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

/**
 * fetch with an AbortController timeout. Forwards an optional caller-provided
 * `signal`, aborting on whichever fires first.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/** Parse a failed response body into a PayError, preserving all fields. */
function toPayError(status: number, data: unknown): PayError {
  const err = (data ?? {}) as {
    error?: string;
    code?: string;
    balance?: number;
    requested?: number;
    requestId?: string;
  };
  return new PayError(status, err.error ?? `Request failed (${status})`, {
    code: err.code,
    balance: err.balance,
    requested: err.requested,
    requestId: err.requestId,
  });
}

/**
 * Run a request with a timeout, parse the JSON body, and either return it or
 * throw a PayError. `networkErrorMessage` is used when the request never
 * reaches the server (DNS/offline/timeout).
 */
export async function payFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  networkErrorMessage: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(input, init, timeoutMs);
  } catch {
    throw new PayError(0, networkErrorMessage, { code: "network_error" });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw toPayError(res.status, data);
  return data as T;
}
