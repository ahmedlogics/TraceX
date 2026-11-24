import { createPrismaClient } from "../src/server/db/client";

async function main() {
  const db = createPrismaClient();
  try {
    const g15 = await db.garments.findFirst({ where: { code: "TROUSER-015" } });
    if (!g15) {
      throw new Error("TROUSER-015 not found");
    }

    // Bind 04001122 to TROUSER-015
    const existingBinding = await db.rfid_tag_bindings.findFirst({
      where: { tag_identifier: "04001122", unbound_at: null },
    });
    if (!existingBinding) {
      await db.rfid_tag_bindings.create({
        data: {
          tag_identifier: "04001122",
          tag_technology: "ISO_14443_A",
          garment_id: g15.id,
          bound_by: "d797b079-5e98-4c0a-a0dd-ac0cc5376887",
          bound_at: new Date(),
          unbound_at: null,
        },
      });
      console.log("Bound tag 04001122 to TROUSER-015");
    } else if (existingBinding.garment_id !== g15.id) {
      await db.rfid_tag_bindings.update({
        where: { id: existingBinding.id },
        data: { garment_id: g15.id },
      });
      console.log("Re-pointed tag 04001122 to TROUSER-015");
    }

    console.log("SUCCESS! Stage 3 Approved garment TROUSER-015 (UID 04001122) ready for Stage 4 Stitching.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
