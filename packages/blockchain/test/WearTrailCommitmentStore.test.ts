import { expect } from "chai";
import { network } from "hardhat";
import { ethers as ethersType } from "ethers";

const { ethers } = await network.create();

describe("WearTrailCommitmentStore", function () {
  let store: any;
  let owner: any;
  let writer: any;
  let unauthorizedUser: any;

  // Helper to generate a 32-byte hex string (bytes32)
  function randomBytes32(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    writer = signers[1];
    unauthorizedUser = signers[2];

    const factory = await ethers.getContractFactory("WearTrailCommitmentStore");
    store = await factory.deploy(owner.address);
    await store.waitForDeployment();
  });

  describe("Deployment & Authorization", function () {
    it("should set the initial owner correctly", async function () {
      expect(await store.owner()).to.equal(owner.address);
    });

    it("should allow owner to authorize a writer and emit WriterAuthorizationUpdated", async function () {
      await expect(store.setAuthorizedWriter(writer.address, true))
        .to.emit(store, "WriterAuthorizationUpdated")
        .withArgs(writer.address, true);

      expect(await store.authorizedWriters(writer.address)).to.be.true;
    });

    it("should allow owner to revoke an authorized writer", async function () {
      await store.setAuthorizedWriter(writer.address, true);
      expect(await store.authorizedWriters(writer.address)).to.be.true;

      await expect(store.setAuthorizedWriter(writer.address, false))
        .to.emit(store, "WriterAuthorizationUpdated")
        .withArgs(writer.address, false);

      expect(await store.authorizedWriters(writer.address)).to.be.false;
    });

    it("should prevent non-owners from authorizing writers", async function () {
      const storeAsUnauthorized = store.connect(unauthorizedUser);
      await expect(
        storeAsUnauthorized.setAuthorizedWriter(unauthorizedUser.address, true)
      ).to.be.revertedWithCustomError(store, "Unauthorized");
    });

    it("should prevent authorizing address(0)", async function () {
      await expect(
        store.setAuthorizedWriter(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(store, "ZeroAddress");
    });

    it("should allow ownership transfer by owner and emit OwnershipTransferred", async function () {
      await expect(store.transferOwnership(writer.address))
        .to.emit(store, "OwnershipTransferred")
        .withArgs(owner.address, writer.address);

      expect(await store.owner()).to.equal(writer.address);
    });

    it("should prevent non-owners from transferring ownership", async function () {
      const storeAsUnauthorized = store.connect(unauthorizedUser);
      await expect(
        storeAsUnauthorized.transferOwnership(unauthorizedUser.address)
      ).to.be.revertedWithCustomError(store, "Unauthorized");
    });
  });

  describe("Authorized Writes & Event Emission", function () {
    it("should allow owner to record a valid commitment and emit CommitmentRecorded", async function () {
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      const tx = await store.recordCommitment(commitmentId, payloadHash);
      const receipt = await tx.wait();

      // Verify event was emitted
      await expect(tx)
        .to.emit(store, "CommitmentRecorded")
        .withArgs(commitmentId, payloadHash, receipt.blockNumber, (await ethers.provider.getBlock(receipt.blockNumber))!.timestamp);

      expect(await store.hasCommitment(commitmentId)).to.be.true;
    });

    it("should allow an authorized writer to record commitments", async function () {
      await store.setAuthorizedWriter(writer.address, true);

      const storeAsWriter = store.connect(writer);
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      const tx = await storeAsWriter.recordCommitment(commitmentId, payloadHash);
      await expect(tx).to.emit(store, "CommitmentRecorded");

      expect(await store.hasCommitment(commitmentId)).to.be.true;
    });

    it("should revert if an unauthorized account attempts to record a commitment", async function () {
      const storeAsUnauthorized = store.connect(unauthorizedUser);
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      await expect(
        storeAsUnauthorized.recordCommitment(commitmentId, payloadHash)
      ).to.be.revertedWithCustomError(store, "Unauthorized");
    });

    it("should revert if a revoked writer attempts to record a commitment", async function () {
      await store.setAuthorizedWriter(writer.address, true);
      await store.setAuthorizedWriter(writer.address, false);

      const storeAsRevoked = store.connect(writer);
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      await expect(
        storeAsRevoked.recordCommitment(commitmentId, payloadHash)
      ).to.be.revertedWithCustomError(store, "Unauthorized");
    });

    it("should revert when commitmentId or payloadHash is zero bytes", async function () {
      const validHash = randomBytes32();
      const validId = randomBytes32();
      const zeroBytes32 = ethers.ZeroHash;

      await expect(
        store.recordCommitment(zeroBytes32, validHash)
      ).to.be.revertedWithCustomError(store, "EmptyCommitmentId");

      await expect(
        store.recordCommitment(validId, zeroBytes32)
      ).to.be.revertedWithCustomError(store, "EmptyPayloadHash");
    });
  });

  describe("Retrieval Operations", function () {
    it("should accurately retrieve commitment metadata and hash", async function () {
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      const tx = await store.recordCommitment(commitmentId, payloadHash);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      // Check hasCommitment
      expect(await store.hasCommitment(commitmentId)).to.be.true;

      // Check getCommitment
      const [retrievedHash, blockNum, blockTime] = await store.getCommitment(commitmentId);
      expect(retrievedHash).to.equal(payloadHash);
      expect(blockNum).to.equal(BigInt(receipt.blockNumber));
      expect(blockTime).to.equal(BigInt(block!.timestamp));

      // Check getCommitmentHash
      expect(await store.getCommitmentHash(commitmentId)).to.equal(payloadHash);
    });

    it("should return false for hasCommitment on unknown ID", async function () {
      const unknownId = randomBytes32();
      expect(await store.hasCommitment(unknownId)).to.be.false;
    });

    it("should revert with CommitmentNotFound when reading unknown ID", async function () {
      const unknownId = randomBytes32();

      await expect(store.getCommitment(unknownId))
        .to.be.revertedWithCustomError(store, "CommitmentNotFound")
        .withArgs(unknownId);

      await expect(store.getCommitmentHash(unknownId))
        .to.be.revertedWithCustomError(store, "CommitmentNotFound")
        .withArgs(unknownId);
    });
  });

  describe("Idempotency (Identical Retries)", function () {
    it("should succeed cleanly when retrying identical ID and identical hash", async function () {
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      // First write
      const tx1 = await store.recordCommitment(commitmentId, payloadHash);
      const receipt1 = await tx1.wait();
      const [hash1, block1, time1] = await store.getCommitment(commitmentId);

      // Identical retry should not revert
      const tx2 = await store.recordCommitment(commitmentId, payloadHash);
      await tx2.wait();

      // State remains unaltered (append-only immutability)
      const [hash2, block2, time2] = await store.getCommitment(commitmentId);
      expect(hash2).to.equal(hash1);
      expect(block2).to.equal(block1);
      expect(time2).to.equal(time1);
    });

    it("should return isNew = false on identical retry via static call", async function () {
      const commitmentId = randomBytes32();
      const payloadHash = randomBytes32();

      // Initial write
      const isNewFirst = await store.recordCommitment.staticCall(commitmentId, payloadHash);
      expect(isNewFirst).to.be.true;
      await store.recordCommitment(commitmentId, payloadHash);

      // Retry
      const isNewSecond = await store.recordCommitment.staticCall(commitmentId, payloadHash);
      expect(isNewSecond).to.be.false;
    });
  });

  describe("Conflicting Writes", function () {
    it("should revert with ConflictingCommitment when same ID is submitted with a different hash", async function () {
      const commitmentId = randomBytes32();
      const originalHash = randomBytes32();
      const conflictingHash = randomBytes32();
      expect(originalHash).to.not.equal(conflictingHash);

      // Record first hash
      await store.recordCommitment(commitmentId, originalHash);

      // Attempt conflicting write with different hash
      await expect(
        store.recordCommitment(commitmentId, conflictingHash)
      )
        .to.be.revertedWithCustomError(store, "ConflictingCommitment")
        .withArgs(commitmentId, originalHash, conflictingHash);

      // Ensure original data was NOT altered
      expect(await store.getCommitmentHash(commitmentId)).to.equal(originalHash);
    });
  });

  describe("Batch Commitments", function () {
    it("should record a batch of commitments atomically", async function () {
      const ids = [randomBytes32(), randomBytes32(), randomBytes32()];
      const hashes = [randomBytes32(), randomBytes32(), randomBytes32()];

      const tx = await store.recordCommitmentsBatch(ids, hashes);
      await tx.wait();

      for (let i = 0; i < ids.length; i++) {
        expect(await store.hasCommitment(ids[i])).to.be.true;
        expect(await store.getCommitmentHash(ids[i])).to.equal(hashes[i]);
      }
    });

    it("should handle idempotent retries inside batch without error", async function () {
      const id1 = randomBytes32();
      const hash1 = randomBytes32();
      await store.recordCommitment(id1, hash1);

      const id2 = randomBytes32();
      const hash2 = randomBytes32();

      // Batch contains id1 (retry) and id2 (new)
      const tx = await store.recordCommitmentsBatch([id1, id2], [hash1, hash2]);
      await tx.wait();

      expect(await store.hasCommitment(id1)).to.be.true;
      expect(await store.hasCommitment(id2)).to.be.true;
    });

    it("should revert entire batch on array length mismatch", async function () {
      const ids = [randomBytes32(), randomBytes32()];
      const hashes = [randomBytes32()];

      await expect(
        store.recordCommitmentsBatch(ids, hashes)
      ).to.be.revertedWithCustomError(store, "ArrayLengthMismatch");
    });

    it("should revert entire batch if one item has conflicting hash", async function () {
      const id1 = randomBytes32();
      const hash1 = randomBytes32();
      await store.recordCommitment(id1, hash1);

      const id2 = randomBytes32();
      const hash2 = randomBytes32();
      const conflictingHash1 = randomBytes32();

      await expect(
        store.recordCommitmentsBatch([id1, id2], [conflictingHash1, hash2])
      ).to.be.revertedWithCustomError(store, "ConflictingCommitment");

      // id2 was not committed due to atomicity
      expect(await store.hasCommitment(id2)).to.be.false;
    });
  });
});
