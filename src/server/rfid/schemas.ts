import { z } from "zod";
import { normalizeTagUid } from "../contracts/rfid";

/**
 * Zod schema validating incoming VersionedScanEnvelope (v1) payloads.
 */
export const VersionedScanEnvelopeSchema = z.object({
  version: z.literal("v1", {
    errorMap: () => ({ message: "Only envelope version 'v1' is supported." }),
  }),
  deviceId: z
    .string()
    .uuid({ message: "deviceId must be a valid UUID." }),
  scanId: z
    .string()
    .min(1, { message: "scanId cannot be empty." })
    .max(128, { message: "scanId cannot exceed 128 characters." }),
  bootId: z
    .string()
    .min(1, { message: "bootId cannot be empty." })
    .max(128, { message: "bootId cannot exceed 128 characters." }),
  sequence: z
    .number()
    .int()
    .min(0, { message: "sequence must be a non-negative integer." }),
  readerIndex: z
    .number()
    .int()
    .min(0, { message: "readerIndex must be between 0 and 255." })
    .max(255, { message: "readerIndex must be between 0 and 255." }),
  mappingVersion: z
    .number()
    .int()
    .min(1, { message: "mappingVersion must be a positive integer." }),
  tagUid: z
    .string()
    .transform((val) => normalizeTagUid(val))
    .refine((val) => /^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(val), {
      message: "tagUid must be a valid 4-byte (8 hex), 7-byte (14 hex), or 10-byte (20 hex) RFID UID.",
    }),
  actionContextId: z
    .string()
    .uuid({ message: "actionContextId must be a valid UUID." })
    .nullable()
    .optional(),
  deviceUptimeMs: z
    .number()
    .int()
    .min(0, { message: "deviceUptimeMs must be non-negative." })
    .nullable()
    .optional(),
  timestamp: z
    .string()
    .datetime({ message: "timestamp must be an ISO 8601 datetime string." })
    .optional()
    .default(() => new Date().toISOString()),
});

export type ValidatedScanEnvelope = z.infer<typeof VersionedScanEnvelopeSchema>;
