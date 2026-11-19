/**
 * WearTrailCommitmentStore smart contract ABI.
 * Human-readable format supported natively by ethers.js v6.
 */
export const WEARTRAIL_COMMITMENT_STORE_ABI = [
  "function owner() external view returns (address)",
  "function authorizedWriters(address) external view returns (bool)",
  "function setAuthorizedWriter(address writer, bool authorized) external",
  "function transferOwnership(address newOwner) external",
  "function recordCommitment(bytes32 commitmentId, bytes32 payloadHash) external returns (bool isNew)",
  "function recordCommitmentsBatch(bytes32[] calldata commitmentIds, bytes32[] calldata payloadHashes) external returns (uint256 newCount)",
  "function hasCommitment(bytes32 commitmentId) external view returns (bool)",
  "function getCommitment(bytes32 commitmentId) external view returns (bytes32 payloadHash, uint64 blockNumber, uint64 blockTimestamp)",
  "function getCommitmentHash(bytes32 commitmentId) external view returns (bytes32)",
  "event CommitmentRecorded(bytes32 indexed commitmentId, bytes32 indexed payloadHash, uint64 blockNumber, uint64 blockTimestamp)",
  "event WriterAuthorizationUpdated(address indexed writer, bool indexed authorized)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "error Unauthorized()",
  "error ZeroAddress()",
  "error EmptyCommitmentId()",
  "error EmptyPayloadHash()",
  "error ConflictingCommitment(bytes32 commitmentId, bytes32 existingHash, bytes32 submittedHash)",
  "error CommitmentNotFound(bytes32 commitmentId)",
  "error ArrayLengthMismatch()",
] as const;
