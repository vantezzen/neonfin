import "server-only";

export type Cursor = { createdAt: string; id: string };

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.createdAt !== "string" ||
      Number.isNaN(new Date(parsed.createdAt).valueOf()) ||
      typeof parsed?.id !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id }),
  ).toString("base64url");
}
