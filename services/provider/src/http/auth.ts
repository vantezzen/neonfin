export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export function isAuthorized(req: Request, authSecret: string): boolean {
  return bearerToken(req) === authSecret;
}
