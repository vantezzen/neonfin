import { providerServiceConfig } from "./config";
import type {
  ProviderServiceRequest,
  ProviderServiceResponse,
} from "./contract";
import { isAuthorized } from "./http/auth";
import { handleProviderRequest } from "./operations/handler";
import { ProviderInputError } from "./operations/errors";
import { validateSecretsConfig } from "./secrets";

const config = providerServiceConfig();

// Validate secrets configuration at boot — exits non-zero on misconfiguration.
validateSecretsConfig();

Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    if (url.pathname !== "/internal/provider" || req.method !== "POST") {
      return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (!isAuthorized(req, config.authSecret)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let op: string | undefined;
    try {
      const request = (await req.json()) as ProviderServiceRequest;
      op = request.op;
      const data = await handleProviderRequest(request);
      return Response.json(
        { ok: true, data } as ProviderServiceResponse<typeof request.op>,
        { status: 200 },
      );
    } catch (err) {
      console.error(`[provider-service] op=${op ?? "unparsed"} failed:`, err);
      return Response.json(
        {
          ok: false,
          error:
            err instanceof ProviderInputError
              ? err.message
              : "Provider operation failed",
        },
        { status: 400 },
      );
    }
  },
});

console.log(`provider-service listening on :${config.port}`);
