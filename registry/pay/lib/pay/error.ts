export type PayErrorOptions = {
  code?: string;
  balance?: number;
  requested?: number;
  /** API request identifier for support/debugging. */
  requestId?: string;
};

/** A stable, inspectable error returned by vantezzen/pay client helpers. */
export class PayError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly balance?: number;
  readonly requested?: number;
  readonly requestId?: string;

  constructor(status: number, message: string, opts: PayErrorOptions = {}) {
    super(message);
    this.name = "PayError";
    this.status = status;
    this.code = opts.code;
    this.balance = opts.balance;
    this.requested = opts.requested;
    this.requestId = opts.requestId;
  }

  get isInsufficientCredits(): boolean {
    return this.status === 402;
  }
}
