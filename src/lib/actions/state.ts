import { ZodError } from "zod";

export type FormState = { error?: string; ok?: boolean };

/** Extract a user-facing message, letting Next redirect/notFound errors pass. */
export function actionError(e: unknown): FormState {
  // Never swallow framework control-flow errors (redirect/notFound).
  if (e && typeof e === "object" && "digest" in e) {
    const digest = String((e as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_HTTP_ERROR_FALLBACK;404") {
      throw e;
    }
  }
  // A raw ZodError message is a JSON blob - surface the first issue instead.
  if (e instanceof ZodError) {
    return { error: e.issues[0]?.message ?? "Invalid input" };
  }
  if (e instanceof Error) return { error: e.message };
  return { error: "Something went wrong" };
}
