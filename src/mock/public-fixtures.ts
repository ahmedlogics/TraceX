/**
 * Approved public product records (separate from internal garments).
 * Only these fields may ever be published to shoppers.
 */
export interface PublicProductRecord {
  publicId: string;
  garmentId: string;
  productName: string;
  productDescription: string;
  sampleCommitmentRef: string;
  /** Optional advisory shown on the journey; never blocks access. */
  advisory?: string | undefined;
}

export const publicProductRecords: PublicProductRecord[] = [
  {
    publicId: "shirt-001-demo",
    garmentId: "SHIRT-001",
    productName: "Classic poplin shirt",
    productDescription: "White cotton poplin, size M.",
    sampleCommitmentRef: "demo-commitment-0001",
    advisory:
      "Sample notice: this product link has been opened often in a short period. That can be normal for a shared link. It does not change the journey shown here.",
  },
  {
    publicId: "shirt-002-demo",
    garmentId: "SHIRT-002",
    productName: "Classic poplin shirt",
    productDescription: "White cotton poplin, size L.",
    sampleCommitmentRef: "demo-commitment-0002",
  },
];
