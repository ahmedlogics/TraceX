export type DemoErrorCode = "forbidden" | "conflict" | "not-found" | "invalid";

export class DemoError extends Error {
  constructor(
    public code: DemoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DemoError";
  }
}

export function ensure(cond: unknown, code: DemoErrorCode, message: string): asserts cond {
  if (!cond) throw new DemoError(code, message);
}
