import type {
  ProviderServiceRequest,
  ProviderServiceResponse,
} from "../contract";

export function providerJson<T extends ProviderServiceRequest["op"]>(
  status: number,
  body: ProviderServiceResponse<T>,
) {
  return Response.json(body, { status });
}

export function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function notFound() {
  return Response.json({ ok: false, error: "Not found" }, { status: 404 });
}
