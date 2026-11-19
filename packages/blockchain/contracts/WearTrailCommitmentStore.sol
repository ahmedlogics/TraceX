// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/**
 * @title WearTrailCommitmentStore
 * @notice Minimal authorized append-only cryptographic commitment anchor for WearTrail supply chain provenance.
 * @dev Stores opaque 32-byte commitment identifiers and supplied 32-byte payload hashes.
 *      Enforces strict authorization, idempotency on identical replays, and reverts on conflicting writes.
 *      Privacy Guarantee: Operates strictly on opaque hashes and UUIDs. Zero factory details, garment
 *      identifiers, worker IDs, or private nonces are exposed to the contract or its emitted events.
 */
contract WearTrailCommitmentStore {
    // -------------------------------------------------------------------------
    // Types & Structs
    // -------------------------------------------------------------------------

    struct Commitment {
        bytes32 payloadHash;
        uint64 blockNumber;
        uint64 blockTimestamp;
        bool exists;
    }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    /// @notice Contract administrator/deployer
    address public owner;

    /// @notice Authorized backend writers (e.g. WearTrail outbox worker keys)
    mapping(address => bool) public authorizedWriters;

    /// @dev Internal mapping from commitmentId to stored commitment data
    mapping(bytes32 => Commitment) private _commitments;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new commitment is anchored
    event CommitmentRecorded(
        bytes32 indexed commitmentId,
        bytes32 indexed payloadHash,
        uint64 blockNumber,
        uint64 blockTimestamp
    );

    /// @notice Emitted when a writer authorization status changes
    event WriterAuthorizationUpdated(
        address indexed writer,
        bool indexed authorized
    );

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error Unauthorized();
    error ZeroAddress();
    error EmptyCommitmentId();
    error EmptyPayloadHash();
    error ConflictingCommitment(bytes32 commitmentId, bytes32 existingHash, bytes32 submittedHash);
    error CommitmentNotFound(bytes32 commitmentId);
    error ArrayLengthMismatch();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != owner && !authorizedWriters[msg.sender]) {
            revert Unauthorized();
        }
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner Initial owner address. If address(0), defaults to msg.sender.
     */
    constructor(address initialOwner) {
        address assignedOwner = initialOwner == address(0) ? msg.sender : initialOwner;
        owner = assignedOwner;
        emit OwnershipTransferred(address(0), assignedOwner);
    }

    // -------------------------------------------------------------------------
    // Administration
    // -------------------------------------------------------------------------

    /**
     * @notice Grants or revokes permission for a backend address to record commitments.
     * @param writer Address to update.
     * @param authorized True to authorize, false to revoke.
     */
    function setAuthorizedWriter(address writer, bool authorized) external onlyOwner {
        if (writer == address(0)) revert ZeroAddress();
        authorizedWriters[writer] = authorized;
        emit WriterAuthorizationUpdated(writer, authorized);
    }

    /**
     * @notice Transfers ownership of the contract.
     * @param newOwner New owner address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // -------------------------------------------------------------------------
    // Commitment Write Operations
    // -------------------------------------------------------------------------

    /**
     * @notice Records an append-only commitment.
     * @dev Idempotency behavior:
     *      - New commitment ID: stores commitment, emits CommitmentRecorded, returns true.
     *      - Existing commitment ID with identical payloadHash: no-op, returns false (idempotent success).
     *      - Existing commitment ID with different payloadHash: reverts with ConflictingCommitment.
     * @param commitmentId Opaque 32-byte identifier.
     * @param payloadHash Supplied 32-byte payload hash (e.g. SHA-256 of canonical event or public payload).
     * @return isNew True if a new commitment record was written, false if already recorded with identical hash.
     */
    function recordCommitment(
        bytes32 commitmentId,
        bytes32 payloadHash
    ) external onlyAuthorized returns (bool isNew) {
        if (commitmentId == bytes32(0)) revert EmptyCommitmentId();
        if (payloadHash == bytes32(0)) revert EmptyPayloadHash();

        Commitment storage existing = _commitments[commitmentId];
        if (existing.exists) {
            if (existing.payloadHash != payloadHash) {
                revert ConflictingCommitment(commitmentId, existing.payloadHash, payloadHash);
            }
            return false;
        }

        _commitments[commitmentId] = Commitment({
            payloadHash: payloadHash,
            blockNumber: uint64(block.number),
            blockTimestamp: uint64(block.timestamp),
            exists: true
        });

        emit CommitmentRecorded(
            commitmentId,
            payloadHash,
            uint64(block.number),
            uint64(block.timestamp)
        );

        return true;
    }

    /**
     * @notice Records a batch of commitments.
     * @dev Atomically applies commitments. If any item has a conflicting hash or invalid argument, reverts entire batch.
     * @param commitmentIds Array of opaque 32-byte identifiers.
     * @param payloadHashes Array of 32-byte payload hashes matching commitmentIds by index.
     * @return newCount Number of new commitments inserted (excluding idempotent identical retries).
     */
    function recordCommitmentsBatch(
        bytes32[] calldata commitmentIds,
        bytes32[] calldata payloadHashes
    ) external onlyAuthorized returns (uint256 newCount) {
        uint256 len = commitmentIds.length;
        if (len != payloadHashes.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < len; ) {
            bytes32 cid = commitmentIds[i];
            bytes32 phash = payloadHashes[i];

            if (cid == bytes32(0)) revert EmptyCommitmentId();
            if (phash == bytes32(0)) revert EmptyPayloadHash();

            Commitment storage existing = _commitments[cid];
            if (existing.exists) {
                if (existing.payloadHash != phash) {
                    revert ConflictingCommitment(cid, existing.payloadHash, phash);
                }
            } else {
                _commitments[cid] = Commitment({
                    payloadHash: phash,
                    blockNumber: uint64(block.number),
                    blockTimestamp: uint64(block.timestamp),
                    exists: true
                });

                emit CommitmentRecorded(
                    cid,
                    phash,
                    uint64(block.number),
                    uint64(block.timestamp)
                );

                unchecked {
                    ++newCount;
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Commitment Read Operations
    // -------------------------------------------------------------------------

    /**
     * @notice Checks if a commitment ID has been recorded.
     * @param commitmentId Opaque 32-byte identifier.
     * @return exists True if commitment exists, false otherwise.
     */
    function hasCommitment(bytes32 commitmentId) external view returns (bool) {
        return _commitments[commitmentId].exists;
    }

    /**
     * @notice Retrieves full commitment metadata.
     * @param commitmentId Opaque 32-byte identifier.
     * @return payloadHash The stored 32-byte payload hash.
     * @return blockNumber The block number when commitment was recorded.
     * @return blockTimestamp The block timestamp when commitment was recorded.
     */
    function getCommitment(bytes32 commitmentId) external view returns (
        bytes32 payloadHash,
        uint64 blockNumber,
        uint64 blockTimestamp
    ) {
        Commitment storage c = _commitments[commitmentId];
        if (!c.exists) revert CommitmentNotFound(commitmentId);
        return (c.payloadHash, c.blockNumber, c.blockTimestamp);
    }

    /**
     * @notice Retrieves solely the payload hash for a commitment ID.
     * @param commitmentId Opaque 32-byte identifier.
     * @return payloadHash The stored 32-byte payload hash.
     */
    function getCommitmentHash(bytes32 commitmentId) external view returns (bytes32) {
        Commitment storage c = _commitments[commitmentId];
        if (!c.exists) revert CommitmentNotFound(commitmentId);
        return c.payloadHash;
    }
}
