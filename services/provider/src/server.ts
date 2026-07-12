import { providerServiceConfig } from "./config";
import type {
  ProviderServiceRequest,
  ProviderServiceResponse,
} from "./contract";
import { isAuthorized } from "./http/auth";
import { notFound, providerJson, unauthorized } from "./http/responses";
import { handleProviderRequest } from "./operations/handler";
import { ProviderInputError } from "./operations/errors";
import { validateSecretsConfig } from "./secrets";

declare const Bun: {
  serve(options: {
    port: number;
    fetch(req: Request): Response | Promise<Response>;
  }): { url: URL };
};

const config = providerServiceConfig();

// Validate secrets configuration at boot — exits non-zero on misconfiguration.
validateSecretsConfig();

Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    if (url.pathname !== "/internal/provider" || req.method !== "POST") {
      return notFound();
    }
    if (!isAuthorized(req, config.authSecret)) return unauthorized();

    let op: string | undefined;
    try {
      const request = (await req.json()) as ProviderServiceRequest;
      op = request.op;
      const data = await handleProviderRequest(request);
      return providerJson(200, {
        ok: true,
        data,
      } as ProviderServiceResponse<typeof request.op>);
    } catch (err) {
      console.error(`[provider-service] op=${op ?? "unparsed"} failed:`, err);
      return providerJson(400, {
        ok: false,
        error:
          err instanceof ProviderInputError
            ? err.message
            : "Provider operation failed",
      });
    }
  },
});

console.log(`provider-service listening on :${config.port}`);
