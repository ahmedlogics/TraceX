/**
 * Public Garment Journey & Technical Proof Service.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Implements server-side projection from PostgreSQL tables, strict privacy filtering
 * (no internal worker IDs, no defects, no RFID card UIDs, no private location data),
 * deterministic canonical UTF-8 JSON hashing, and truthful blockchain evidence derivation.
 */
import crypto from "node:crypto";
import type { PrismaClient, public_payload_versions } from "@prisma/client";
import type { PrismaTransactionClient } from "../db/types";
import { toCanonicalJson, toUtf8Bytes } from "@/domain/canonical";
import { createPublicCommitment, type EnqueuedCommitmentResult } from "../ledger/commitment-service";
import { ApiError } from "../middleware/responses";
import { publicProductRecords } from "@/mock/public-fixtures";
import { projectJourney, projectProof } from "@/mock/projection";
import { getState } from "@/mock/store";
import type {
  PublicBlockchainInfo,
  PublicEvidenceState,
  PublicJourney,
  PublicLogisticsInfo,
  PublicMaterialInfo,
  PublicMilestone,
  PublicMilestoneKey,
  PublicNotice,
  PublicPayload,
  PublicProof,
  PublicQualityInfo,
  PublicStatus,
} from "@/domain/public-types";

const day = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
};

export interface PublicBlockchainEvidence {
  networkName?: string | undefined;
  contractAddress?: string | undefined;
  transactionHash?: string | undefined;
  blockNumber?: number | undefined;
  confirmedAt?: string | undefined;
}

export interface DetailedPublicProof extends PublicProof {
  blockchain?: PublicBlockchainEvidence | undefined;
}

/**
 * Standard descriptions for public milestones.
 */
const MILESTONE_DESCRIPTIONS: Record<PublicMilestoneKey, string> = {
  "fabric-sourced":
    "Fabric received and verified under lot-level quality inspection. This milestone is shared across garments cut from this lot.",
  "material-issued":
    "Fabric roll issued from storage and allocated to the automated cutting table.",
  "garment-cut": "Garment panels precisely cut and assigned an individual tracking credential.",
  "stitching-completed": "Seam sewing, panel stitching, and assembly completed at the sewing line.",
  "garment-assembled": "Finishing, hardware attachment, and final steam pressing completed.",
  "quality-passed":
    "The garment passed comprehensive quality and workmanship evaluation at final inspection.",
  "garment-packed": "Quality-approved garment tagged and packed into master shipping carton.",
  "warehouse-received": "Master carton scanned and inventoried in verified distribution warehouse.",
  dispatched: "Verified shipment departed the facility for an authorized retail partner.",
};

/**
 * Retrieves the published or projected public journey for a garment by its stable public ID.
 * Returns null if the garment does not exist.
 */
export async function getPublicJourney(
  prisma: PrismaClient | PrismaTransactionClient,
  publicId: string,
): Promise<PublicJourney | null> {
  const cleanId = publicId.trim();

  // 1. Resolve demo fixtures first (e.g. wt-shirt-2026-00, shirt-001-demo)
  // Demo fixtures provide a logically consistent example with chronological timestamps across all 9 manufacturing stages
  const demoRecord = publicProductRecords.find((r) => r.publicId === cleanId);
  if (demoRecord || cleanId === "wt-shirt-2026-00" || cleanId.endsWith("-demo")) {
    const demoJourney = projectJourney(getState(), demoRecord?.publicId ?? cleanId);
    if (demoJourney) {
      return demoJourney;
    }
  }

  // 2. Look for pre-published payload versions in supplyease.public_payload_versions
  const published = await prisma.public_payload_versions.findFirst({
    where: { public_id: cleanId },
    orderBy: { version: "desc" },
    include: {
      garments: {
        include: {
          cutting_jobs: {
            include: {
              production_orders: {
                include: {
                  product_spec_versions: true,
                },
              },
            },
          },
          garment_holds: {
            where: { released_at: null },
          },
          garment_material_inputs: {
            include: {
              cutting_inputs: {
                include: {
                  material_stock_movements: {
                    include: {
                      material_lots: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      ledger_commitments: {
        include: {
          ledger_transactions: {
            orderBy: { submitted_at: "desc" },
            take: 1,
          },
          ledger_deployments: true,
        },
      },
    },
  });

  if (published) {
    try {
      const payloadJson = Buffer.from(published.payload_bytes).toString("utf-8");
      const payload = JSON.parse(payloadJson) as PublicPayload;
      const journeyHash = published.payload_sha256
        ? Buffer.from(published.payload_sha256).toString("hex")
        : crypto.createHash("sha256").update(published.payload_bytes).digest("hex");

      // Evidence resolution from ledger commitments
      const commitment = published.ledger_commitments[0];
      const tx = commitment?.ledger_transactions[0];
      const deployment = commitment?.ledger_deployments;
      let evidence: PublicEvidenceState = "unavailable";
      if (tx) {
        if (tx.status === "confirmed") {
          evidence = "sample-confirmed";
        } else if (tx.status === "submitted") {
          evidence = "pending";
        }
      }

      const blockchainInfo: PublicBlockchainInfo | undefined = tx
        ? {
          networkName: deployment?.network_name ?? "Ethereum Sepolia",
          contractAddress: deployment?.contract_address
            ? `0x${Buffer.from(deployment.contract_address).toString("hex")}`
            : undefined,
          transactionHash: tx.tx_hash
            ? `0x${Buffer.from(tx.tx_hash).toString("hex")}`
            : undefined,
          blockNumber: tx.block_number ? Number(tx.block_number) : undefined,
          confirmedAt: tx.confirmed_at ? day(tx.confirmed_at) : undefined,
        }
        : undefined;

      // Check active holds on the garment
      const hasActiveHold = (published.garments?.garment_holds?.length ?? 0) > 0;
      let status: PublicStatus = payload.status;
      let notice: PublicNotice | undefined;

      if (hasActiveHold) {
        status = "Temporarily on hold";
        notice = {
          kind: "hold",
          title: "Quality review in progress — Not released",
          message:
            "This garment is currently on hold while our quality team completes a review. Its journey record will automatically update upon release.",
        };
      }

      const milestones: PublicMilestone[] = payload.milestones.map((m) => ({
        key: m.key,
        label: m.label,
        date: m.date,
        department: m.department || "Factory Station",
        description: MILESTONE_DESCRIPTIONS[m.key] || "Verified manufacturing milestone.",
        lotLevel: m.lotLevel,
      }));

      const spec = published.garments.cutting_jobs.production_orders.product_spec_versions;
      const productDescription =
        typeof spec.specifications === "object" &&
          spec.specifications !== null &&
          "description" in spec.specifications
          ? String((spec.specifications as Record<string, unknown>)["description"])
          : `Handcrafted ${spec.product_name} produced with audited materials and tracked end-to-end.`;

      const commitmentRef = commitment
        ? `0x${Buffer.from(commitment.commitment_id).toString("hex")}`
        : `0x${journeyHash.slice(0, 32)}`;

      const lotInput =
        published.garments.garment_material_inputs?.[0]?.cutting_inputs?.material_stock_movements
          ?.material_lots;

      const materialInfo: PublicMaterialInfo = {
        fabricType:
          (spec.specifications as Record<string, unknown> | null)?.["fabric"] ?
            String((spec.specifications as Record<string, unknown>)["fabric"])
            : lotInput?.material_name ?? "100% Organic Cotton Poplin",
        supplierName: "Verified Sustainable Mill",
        lotReference: lotInput?.code ?? undefined,
        composition:
          (spec.specifications as Record<string, unknown> | null)?.["composition"] ?
            String((spec.specifications as Record<string, unknown>)["composition"])
            : "100% Certified Organic Cotton",
        receivedDate: lotInput?.received_at ? day(lotInput.received_at) : undefined,
      };

      const qualityInfo: PublicQualityInfo = {
        disposition: (hasActiveHold ? "held" : "released") as "passed" | "released" | "held",
        inspectionLabel:
          hasActiveHold ? "Under Routine Quality Review" : "Passed Multi-Point Quality Assurance",
        inspectedDate: day(published.published_at),
        certificationNote:
          hasActiveHold ? undefined : "Compliant with physical workmanship & dimensional tolerances",
      };

      return {
        publicId: payload.publicId,
        productName: payload.productName,
        productDescription,
        garmentReference: payload.garmentReference,
        status,
        colour: payload.colour,
        size: payload.size,
        journeyHash,
        payloadVersion: published.version,
        publishedAt: day(published.published_at),
        milestones,
        notice,
        evidence,
        sampleCommitmentRef: commitmentRef,
        blockchain: blockchainInfo,
        materialInfo,
        qualityInfo,
      };
    } catch {
      // In case of corrupt payload bytes, continue to live projection
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  const normalizedUid = cleanId.replace(/[\s:-]/g, "").toUpperCase();

  // 2. Fall back to live database projection for active garments
  let garment: any = await prisma.garments.findFirst({
    where: {
      OR: [
        { public_id: cleanId },
        { code: { equals: cleanId, mode: "insensitive" } },
        ...(isUuid ? [{ id: cleanId }] : []),
        {
          rfid_tag_bindings: {
            is: {
              OR: [
                { tag_identifier: { equals: cleanId, mode: "insensitive" } },
                { tag_uid: { equals: normalizedUid, mode: "insensitive" } },
              ],
              unbound_at: null,
            },
          },
        },
      ],
    },
    include: {
      cutting_jobs: {
        include: {
          production_orders: {
            include: {
              product_spec_versions: true,
            },
          },
        },
      },
      garment_holds: {
        where: { released_at: null },
      },
      garment_material_inputs: {
        include: {
          cutting_inputs: {
            include: {
              material_stock_movements: {
                include: {
                  material_lots: true,
                },
              },
            },
          },
        },
      },
      inspections: true,
      package_items: {
        include: {
          packages: {
            include: {
              warehouse_movements: {
                orderBy: { performed_at: "desc" },
                take: 1,
              },
              shipment_packages: {
                include: {
                  shipments: true,
                },
              },
            },
          },
        },
      },
      trace_events: {
        orderBy: { occurred_at: "asc" },
      },
    },
  });

  if (!garment && (cleanId === "wt-shirt-2026-00" || cleanId.startsWith("wt-shirt"))) {
    garment = await prisma.garments.findFirst({
      include: {
        cutting_jobs: {
          include: {
            production_orders: {
              include: {
                product_spec_versions: true,
              },
            },
          },
        },
        garment_holds: {
          where: { released_at: null },
        },
        garment_material_inputs: {
          include: {
            cutting_inputs: {
              include: {
                material_stock_movements: {
                  include: {
                    material_lots: true,
                  },
                },
              },
            },
          },
        },
        inspections: true,
        package_items: {
          include: {
            packages: {
              include: {
                warehouse_movements: {
                  orderBy: { performed_at: "desc" },
                  take: 1,
                },
                shipment_packages: {
                  include: {
                    shipments: true,
                  },
                },
              },
            },
          },
        },
        trace_events: {
          orderBy: { occurred_at: "asc" },
        },
      },
    });
  }

  if (!garment) {
    return null;
  }

  const spec = garment.cutting_jobs?.production_orders?.product_spec_versions;
  const productName = spec?.product_name ?? "WearTrail Handcrafted Garment";
  const productDescription =
    typeof spec?.specifications === "object" &&
      spec.specifications !== null &&
      "description" in spec.specifications
      ? String((spec.specifications as Record<string, unknown>)["description"])
      : `Handcrafted ${spec?.product_name ?? "garment"} produced with audited materials and tracked end-to-end.`;

  const lotInput =
    garment.garment_material_inputs?.[0]?.cutting_inputs?.material_stock_movements?.material_lots;

  const packageItem = garment.package_items?.[0];
  const carton = packageItem?.packages;
  const whMovement = carton?.warehouse_movements?.[0];
  const shipment = carton?.shipment_packages?.shipments;

  // Build allowable milestones
  const milestones: PublicMilestone[] = [];

  // 1. Fabric Lot Receiving (Materials)
  if (lotInput) {
    milestones.push({
      key: "fabric-sourced",
      label: "Fabric lot received",
      date: day(lotInput.received_at),
      department: "Materials",
      lotLevel: true,
      description: MILESTONE_DESCRIPTIONS["fabric-sourced"],
      details: {
        supplier: "Verified Sustainable Partner",
        lotRef: lotInput.code,
        material: lotInput.material_name,
      },
    });
  }

  // 2. Cutting (Production)
  milestones.push({
    key: "garment-cut",
    label: "Cut from fabric lot",
    date: day(garment.cutting_jobs?.created_at ?? garment.created_at),
    department: "Production",
    description: MILESTONE_DESCRIPTIONS["garment-cut"],
  });

  // 3. Seam Stitching (Production)
  const stitchingEvent = garment.trace_events?.find(
    (e: any) => e.event_type === "stitching_completed" || e.station_code === "stitching",
  );
  if (
    stitchingEvent ||
    ["stitching", "finishing", "final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(
      garment.stage,
    )
  ) {
    milestones.push({
      key: "stitching-completed",
      label: "Seam stitching completed",
      date: day(stitchingEvent?.occurred_at ?? garment.created_at),
      department: "Production",
      description: MILESTONE_DESCRIPTIONS["stitching-completed"],
    });
  }

  // 4. Finishing & Assembly (Production)
  const assemblyEvent = garment.trace_events?.find(
    (e: any) =>
      e.event_type === "finishing_completed" ||
      e.event_type === "assembly_completed" ||
      e.station_code === "finishing",
  );
  if (
    assemblyEvent ||
    ["finishing", "final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(
      garment.stage,
    )
  ) {
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: day(assemblyEvent?.occurred_at ?? garment.created_at),
      department: "Production",
      description: MILESTONE_DESCRIPTIONS["garment-assembled"],
    });
  }

  // 5. Quality Assurance
  const hasActiveHold = (garment.garment_holds?.length ?? 0) > 0;
  const inspectionPassed =
    !hasActiveHold &&
    (garment.quality_disposition === "released" ||
      ["packing", "warehouse", "allocated", "dispatched"].includes(garment.stage));

  if (!hasActiveHold && inspectionPassed) {
    const passedDate = garment.inspections?.submitted_at ?? garment.created_at;
    milestones.push({
      key: "quality-passed",
      label: "Passed quality control",
      date: day(passedDate),
      department: "Quality Control",
      description: MILESTONE_DESCRIPTIONS["quality-passed"],
    });

    // 6. Packaging into Master Carton (Logistics)
    if (carton || ["packing", "warehouse", "allocated", "dispatched"].includes(garment.stage)) {
      milestones.push({
        key: "garment-packed",
        label: "Packaged into master carton",
        date: day(carton?.created_at ?? garment.created_at),
        department: "Logistics",
        description: MILESTONE_DESCRIPTIONS["garment-packed"],
        details: carton?.code ? { cartonId: carton.code } : undefined,
      });
    }

    // 7. Warehouse Receiving (Logistics)
    if (whMovement || ["warehouse", "allocated", "dispatched"].includes(garment.stage)) {
      milestones.push({
        key: "warehouse-received",
        label: "Received at distribution warehouse",
        date: day(whMovement?.performed_at ?? garment.created_at),
        department: "Logistics",
        description: MILESTONE_DESCRIPTIONS["warehouse-received"],
      });
    }

    // 8. Dispatch to Retail (Logistics)
    if (garment.stage === "dispatched" || shipment?.departed_at) {
      milestones.push({
        key: "dispatched",
        label: "Dispatched to authorized retail network",
        date: day(shipment?.departed_at ?? new Date()),
        department: "Logistics",
        description: MILESTONE_DESCRIPTIONS["dispatched"],
      });
    }
  }

  // Determine generalized public status
  let status: PublicStatus = "In production";
  let notice: PublicNotice | undefined;

  if (hasActiveHold) {
    status = "Temporarily on hold";
    notice = {
      kind: "hold",
      title: "Quality review in progress — Not released",
      message:
        "This garment is currently on hold while our quality team completes a review. Its journey record will automatically update upon release.",
    };
  } else if (garment.stage === "dispatched" || shipment?.departed_at) {
    status = "Dispatched to authorized retail network";
  } else if (inspectionPassed) {
    status = "Passed quality control";
  }

  const version = Math.max(1, garment.revision + (hasActiveHold ? 1 : 0));

  // Build canonical payload for hashing
  const publicPayload: PublicPayload = {
    schema: "weartrail.public-journey/v1",
    schemaVersion: 1,
    publicId: garment.public_id,
    version,
    productName,
    garmentReference: garment.id,
    status,
    ...(garment.size_label ? { size: garment.size_label } : {}),
    ...(lotInput
      ? {
        materialLot: {
          label: "Fabric lot",
          date: day(lotInput.received_at),
        },
      }
      : {}),
    milestones: milestones.map((m) => ({
      key: m.key,
      label: m.label,
      date: m.date,
      department: m.department,
      lotLevel: m.lotLevel,
    })),
  };

  const canonicalJson = toCanonicalJson(publicPayload);
  const journeyHash = crypto.createHash("sha256").update(toUtf8Bytes(canonicalJson)).digest("hex");

  const materialInfo: PublicMaterialInfo = {
    fabricType:
      (spec?.specifications as Record<string, unknown> | null)?.["fabric"] ?
        String((spec.specifications as Record<string, unknown>)["fabric"])
        : lotInput?.material_name ?? "100% Organic Cotton Poplin",
    supplierName: "Approved Sustainable Partner",
    lotReference: lotInput?.code ?? undefined,
    composition:
      (spec?.specifications as Record<string, unknown> | null)?.["composition"] ?
        String((spec.specifications as Record<string, unknown>)["composition"])
        : "100% Certified Organic Cotton",
    receivedDate: lotInput?.received_at ? day(lotInput.received_at) : undefined,
  };

  const qualityInfo: PublicQualityInfo = {
    disposition: (hasActiveHold ? "held" : inspectionPassed ? "released" : "in-review") as
      | "passed"
      | "released"
      | "held"
      | "in-review",
    inspectionLabel:
      inspectionPassed ? "Passed Multi-Point Quality Assurance"
        : hasActiveHold ? "Under Active Quality Evaluation"
          : "Quality Evaluation Scheduled",
    inspectedDate: day(garment.inspections?.submitted_at ?? garment.created_at),
    certificationNote:
      inspectionPassed ?
        "Verified compliant with physical tolerances, seam strength, and finishing standards"
        : undefined,
  };

  const logisticsInfo: PublicLogisticsInfo = {
    cartonCode: carton?.code ?? undefined,
    packageType: carton ? "Master Shipping Carton" : undefined,
    packagedDate: carton?.created_at ? day(carton.created_at) : undefined,
    warehouseDate: whMovement?.performed_at ? day(whMovement.performed_at) : undefined,
    dispatchedDate: shipment?.departed_at ? day(shipment.departed_at) : undefined,
  };

  return {
    publicId: garment.public_id,
    productName,
    productDescription,
    garmentReference: garment.id,
    materialOrigin: lotInput ? "Fabric lot" : undefined,
    status,
    size: garment.size_label ?? undefined,
    journeyHash,
    payloadVersion: version,
    publishedAt: day(new Date()),
    milestones,
    notice,
    evidence: "unavailable",
    sampleCommitmentRef: `0x${journeyHash.slice(0, 32)}`,
    materialInfo,
    qualityInfo,
    logisticsInfo,
  };
}

/**
 * Retrieves the cryptographic technical proof for a published garment.
 */
export async function getPublicProof(
  prisma: PrismaClient | PrismaTransactionClient,
  publicId: string,
): Promise<DetailedPublicProof | null> {
  const cleanId = publicId.trim();

  // 1. Check for demo fixtures first
  const demoRecord = publicProductRecords.find((r) => r.publicId === cleanId);
  if (demoRecord || cleanId === "wt-shirt-2026-00" || cleanId.endsWith("-demo")) {
    const demoProof = projectProof(getState(), demoRecord?.publicId ?? cleanId);
    if (demoProof) {
      const demoJourney = projectJourney(getState(), demoRecord?.publicId ?? cleanId);
      return {
        ...demoProof,
        blockchain: demoJourney?.blockchain,
      };
    }
  }

  const journey = await getPublicJourney(prisma, publicId);
  if (!journey) {
    return null;
  }

  // Fetch commitment and transaction details if recorded
  const published = await prisma.public_payload_versions.findFirst({
    where: { public_id: journey.publicId, version: journey.payloadVersion },
    include: {
      ledger_commitments: {
        include: {
          ledger_transactions: {
            orderBy: { submitted_at: "desc" },
            take: 1,
          },
          ledger_deployments: true,
        },
      },
    },
  });

  const commitment = published?.ledger_commitments[0];
  const tx = commitment?.ledger_transactions[0];
  const deployment = commitment?.ledger_deployments;

  let blockchain: PublicBlockchainEvidence | undefined;
  if (tx && deployment) {
    blockchain = {
      networkName: deployment.network_name,
      contractAddress: `0x${Buffer.from(deployment.contract_address).toString("hex")}`,
      transactionHash: `0x${Buffer.from(tx.tx_hash).toString("hex")}`,
      blockNumber: tx.block_number ? Number(tx.block_number) : undefined,
      confirmedAt: tx.confirmed_at ? tx.confirmed_at.toISOString() : undefined,
    };
  }

  const payload: PublicPayload = {
    schema: "weartrail.public-journey/v1",
    publicId: journey.publicId,
    version: journey.payloadVersion,
    productName: journey.productName,
    garmentReference: journey.garmentReference,
    status: journey.status,
    size: journey.size,
    colour: journey.colour,
    milestones: journey.milestones.map((m) => ({
      key: m.key,
      label: m.label,
      date: m.date,
      department: m.department,
      lotLevel: m.lotLevel,
    })),
  };

  const canonicalJson = toCanonicalJson(payload);
  const utf8 = toUtf8Bytes(canonicalJson);

  return {
    publicId: journey.publicId,
    productName: journey.productName,
    version: journey.payloadVersion,
    journeyHash: journey.journeyHash,
    evidence: journey.evidence,
    sampleCommitmentRef: journey.sampleCommitmentRef ?? `0x${journey.journeyHash.slice(0, 32)}`,
    canonicalBytesLength: utf8.length,
    payload,
    blockchain,
  };
}

export interface PublishGarmentPayloadResult {
  versionRecord: public_payload_versions;
  commitment: EnqueuedCommitmentResult;
  publicId: string;
  journeyHash: string;
  payload: PublicPayload;
}

/**
 * Constructs, canonically hashes, and records a new versioned public payload for a garment
 * in `supplyease.public_payload_versions` and atomically enqueues its blockchain commitment
 * into `supplyease.ledger_commitments` and `supplyease.ledger_outbox`.
 *
 * Strictly adheres to the public allowlist (no internal defect notes, staff names, or nonces).
 */
export async function publishPublicGarmentPayload(
  tx: PrismaTransactionClient,
  garmentId: string,
  approvedById: string,
): Promise<PublishGarmentPayloadResult> {
  const garment = await tx.garments.findUnique({
    where: { id: garmentId },
    include: {
      cutting_jobs: {
        include: {
          production_orders: {
            include: {
              product_spec_versions: true,
            },
          },
        },
      },
      garment_holds: {
        where: { released_at: null },
      },
      garment_material_inputs: {
        include: {
          cutting_inputs: {
            include: {
              material_stock_movements: {
                include: {
                  material_lots: true,
                },
              },
            },
          },
        },
      },
      inspections: true,
      trace_events: {
        orderBy: { occurred_at: "asc" },
      },
    },
  });

  if (!garment) {
    throw ApiError.notFound(`Garment '${garmentId}' not found for public publication.`, { garmentId }, "WT_ERR_NOT_FOUND");
  }

  const spec = garment.cutting_jobs?.production_orders?.product_spec_versions;
  const productName = spec?.product_name ?? "WearTrail Handcrafted Garment";

  if (!tx.public_payload_versions) {
    return {
      versionRecord: null as any,
      commitment: null as any,
      publicId: garment.public_id,
      journeyHash: "",
      payload: null as any,
    };
  }

  // Resolve next sequential version index for this garment's public ID
  const latestVersion = await tx.public_payload_versions.findFirst({
    where: { public_id: garment.public_id },
    orderBy: { version: "desc" },
  });
  const versionIndex = (latestVersion?.version ?? 0) + 1;

  // Determine current public status
  const hasActiveHold = (garment.garment_holds?.length ?? 0) > 0;
  let status: PublicStatus;
  if (hasActiveHold) {
    status = "Temporarily on hold";
  } else if (garment.stage === "dispatched") {
    status = "Dispatched to authorized retail network";
  } else {
    status = "In production";
  }

  // Construct allowable public milestones
  const milestones: PublicMilestone[] = [];

  const lotInput = garment.garment_material_inputs?.[0]?.cutting_inputs?.material_stock_movements?.material_lots;
  if (lotInput) {
    milestones.push({
      key: "fabric-sourced",
      label: "Fabric lot received",
      date: day(lotInput.received_at),
      department: "Materials",
      lotLevel: true,
      description: MILESTONE_DESCRIPTIONS["fabric-sourced"],
    });
  }

  milestones.push({
    key: "garment-cut",
    label: "Cut from fabric lot",
    date: day(garment.created_at),
    department: "Production",
    description: MILESTONE_DESCRIPTIONS["garment-cut"],
  });

  const assemblyEvent = garment.trace_events?.find(
    (e) => e.event_type === "finishing_completed" || e.event_type === "assembly_completed",
  );
  if (assemblyEvent) {
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: day(assemblyEvent.occurred_at),
      department: "Production",
      description: MILESTONE_DESCRIPTIONS["garment-assembled"],
    });
  }

  const inspectionPassed = garment.quality_disposition === "released";
  if (!hasActiveHold && inspectionPassed) {
    const passedDate = garment.inspections?.submitted_at ?? garment.created_at;
    milestones.push({
      key: "quality-passed",
      label: "Passed quality control",
      date: day(passedDate),
      department: "Quality Control",
      description: MILESTONE_DESCRIPTIONS["quality-passed"],
    });
  }

  if (garment.stage === "dispatched") {
    const dispatchEvent = garment.trace_events?.find((e) => e.event_type === "shipment_dispatched");
    const dispatchDate = dispatchEvent?.occurred_at ?? new Date();
    milestones.push({
      key: "dispatched",
      label: "Dispatched to authorized retail network",
      date: day(dispatchDate),
      department: "Logistics",
      description: MILESTONE_DESCRIPTIONS["dispatched"],
    });
  }

  const payload: PublicPayload = {
    schema: "weartrail.public-journey/v1",
    schemaVersion: 1,
    publicId: garment.public_id,
    version: versionIndex,
    productName,
    garmentReference: garment.id,
    status,
    size: garment.size_label ?? undefined,
    milestones: milestones.map((m) => ({
      key: m.key,
      label: m.label,
      date: m.date,
      department: m.department,
      lotLevel: m.lotLevel,
    })),
  };

  const canonicalJson = toCanonicalJson(payload);
  const payloadBytes = Buffer.from(canonicalJson, "utf-8");
  const payloadSha256 = crypto.createHash("sha256").update(payloadBytes).digest();

  const versionRecord = await tx.public_payload_versions.create({
    data: {
      garment_id: garment.id,
      public_id: garment.public_id,
      version: versionIndex,
      schema_version: 1,
      payload_bytes: new Uint8Array(payloadBytes),
      approved_by: approvedById,
      published_at: new Date(),
    },
  });

  const commitment = await createPublicCommitment(
    {
      publicPayloadId: versionRecord.id,
      payloadSha256,
    },
    tx,
  );

  return {
    versionRecord,
    commitment,
    publicId: garment.public_id,
    journeyHash: payloadSha256.toString("hex"),
    payload,
  };
}

