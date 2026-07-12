import { timingSafeEqual } from "node:crypto";

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export function isAuthorized(req: Request, authSecret: string): boolean {
  const token = bearerToken(req);
  if (token === null) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(authSecret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
