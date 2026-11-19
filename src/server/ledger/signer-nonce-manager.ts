import type { Provider } from "ethers";

/**
 * SignerNonceManager controls Ethereum transaction-nonce concurrency.
 *
 * Ensures that:
 * 1. Transactions dispatched by the same signer account are serialized.
 * 2. Nonces are incremented predictably without race conditions.
 * 3. In the event of a broadcast failure or uncertain broadcast, the manager
 *    can re-synchronize with the chain's 'pending' transaction count.
 * 4. Multi-worker processes cannot allocate conflicting signer nonces simultaneously.
 */
export class SignerNonceManager {
  private inFlightQueues: Map<string, Promise<unknown>> = new Map();
  private signerNonces: Map<string, number> = new Map();

  /**
   * Normalizes an Ethereum address to lowercase for map indexing.
   */
  private normalizeAddress(address: string): string {
    return address.toLowerCase();
  }

  /**
   * Gets or initializes the next transaction nonce for the signer.
   */
  public async getNextNonce(
    address: string,
    provider: Provider,
    forceResync = false,
  ): Promise<number> {
    const key = this.normalizeAddress(address);

    if (forceResync || !this.signerNonces.has(key)) {
      const pendingCount = await provider.getTransactionCount(address, "pending");
      this.signerNonces.set(key, pendingCount);
      return pendingCount;
    }

    const current = this.signerNonces.get(key)!;
    return current;
  }

  /**
   * Increments the tracked nonce for the signer after a successful broadcast.
   */
  public commitNonce(address: string, usedNonce: number): void {
    const key = this.normalizeAddress(address);
    this.signerNonces.set(key, Math.max(usedNonce + 1, (this.signerNonces.get(key) ?? 0) + 1));
  }

  /**
   * Clears the cached nonce for an address, forcing a chain re-sync on next broadcast.
   */
  public invalidateNonce(address: string): void {
    const key = this.normalizeAddress(address);
    this.signerNonces.delete(key);
  }

  /**
   * Clears all tracked nonces.
   */
  public resetAll(): void {
    this.signerNonces.clear();
    this.inFlightQueues.clear();
  }

  /**
   * Serializes transaction operations for a given signer address.
   * Ensures only one operation per signer executes at any moment within the process.
   *
   * @param address Signer account address.
   * @param provider Ethereum provider to query pending count.
   * @param operation Callback that receives the assigned nonce and returns a promise.
   */
  public async withSignerLock<T>(
    address: string,
    provider: Provider,
    operation: (nonce: number) => Promise<T>,
  ): Promise<T> {
    const key = this.normalizeAddress(address);

    // Chain onto existing in-flight promise for this signer to enforce strict ordering
    const previous = this.inFlightQueues.get(key) ?? Promise.resolve();

    let releaseQueue: () => void;
    const currentQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    this.inFlightQueues.set(key, currentQueue);

    try {
      // Wait for any prior broadcast operation for this signer to complete
      await previous.catch(() => {});

      // Retrieve the current validated nonce
      const nonce = await this.getNextNonce(address, provider);

      // Execute the broadcast operation
      const result = await operation(nonce);

      // On successful send, advance our local tracked nonce
      this.commitNonce(address, nonce);

      return result;
    } catch (error) {
      // On error (e.g. network error, nonce collision, revert), invalidate cached nonce
      this.invalidateNonce(address);
      throw error;
    } finally {
      releaseQueue!();
      if (this.inFlightQueues.get(key) === currentQueue) {
        this.inFlightQueues.delete(key);
      }
    }
  }
}

/**
 * Global singleton SignerNonceManager instance.
 */
export const signerNonceManager = new SignerNonceManager();
