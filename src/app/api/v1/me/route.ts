import { authenticate, corsHeaders, preflight } from "@/lib/api/http";

export function OPTIONS(): Response {
  return preflight();
}

/** Identify the current key's project and authorization mode for diagnostics. */
export async function GET(req: Request): Promise<Response> {
  const auth = await authenticate(req, { rateLimit: false });
  if ("error" in auth) return auth.error;
  const { project, keyKind, origin } = auth;
  return Response.json(
    {
      projectId: project.id,
      project: project.slug,
      mode: project.mode,
      keyKind,
    },
    { headers: { ...corsHeaders(project, origin), "Cache-Control": "no-store" } },
  );
}
