import "server-only";

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: number, public readonly requested: number) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}
export class WalletNotFoundError extends Error {
  constructor() {
    super("Wallet not found");
    this.name = "WalletNotFoundError";
  }
}
export class WalletExpiredError extends Error {
  constructor(public readonly expiredAt: Date) {
    super("Wallet expired");
    this.name = "WalletExpiredError";
  }
}
export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found for this project");
    this.name = "ProductNotFoundError";
  }
}
