const bearer = [{ bearerAuth: [] }];
const json = { "application/json": { schema: { type: "object" } } };

const spec = {
  openapi: "3.1.0",
  info: {
    title: "vantezzen/pay API",
    version: "v1",
    description:
      "REST API for wallets, credit access, checkout, orders, and billing portals.",
  },
  servers: [{ url: "/api/v1", description: "Current deployment" }],
  security: bearer,
  paths: {
    "/me": {
      get: {
        summary: "Inspect the authenticated project and key mode",
        responses: { "200": { description: "Project identity", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/products": {
      get: {
        summary: "List active products and prices",
        responses: { "200": { description: "Catalog", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets": {
      post: {
        summary: "Create an anonymous credit-code wallet",
        responses: { "200": { description: "Wallet", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/{code}": {
      get: {
        summary: "Read an anonymous wallet",
        parameters: [{ $ref: "#/components/parameters/code" }],
        responses: { "200": { description: "Wallet", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/{code}/deduct": {
      post: {
        summary: "Deduct credits from an anonymous wallet",
        parameters: [{ $ref: "#/components/parameters/code" }],
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Deduction result", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/{code}/ledger": {
      get: {
        summary: "List anonymous wallet ledger entries",
        parameters: [{ $ref: "#/components/parameters/code" }, { $ref: "#/components/parameters/cursor" }, { $ref: "#/components/parameters/limit" }],
        responses: { "200": { description: "Ledger page", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/{code}/portal": {
      get: {
        summary: "Create an anonymous wallet billing-portal URL",
        parameters: [{ $ref: "#/components/parameters/code" }],
        responses: { "200": { description: "Portal URL", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/external": {
      get: {
        summary: "Read an existing external-auth wallet",
        parameters: [{ $ref: "#/components/parameters/externalUserId" }],
        responses: { "200": { description: "Wallet", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
      post: {
        summary: "Get or create an external-auth wallet",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Wallet", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/external/deduct": {
      post: {
        summary: "Deduct credits from an external-auth wallet",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Deduction result", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/external/ledger": {
      get: {
        summary: "List external-auth wallet ledger entries",
        parameters: [{ $ref: "#/components/parameters/externalUserId" }, { $ref: "#/components/parameters/cursor" }, { $ref: "#/components/parameters/limit" }],
        responses: { "200": { description: "Ledger page", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/wallets/external/portal": {
      post: {
        summary: "Create an external-auth billing-portal URL",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Portal URL", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/credit": {
      post: {
        summary: "Grant credits with a secret key",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Grant result", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/features": {
      post: {
        summary: "Grant or revoke a manual feature",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Feature result", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/checkout": {
      post: {
        summary: "Create an idempotent provider checkout",
        requestBody: { required: true, content: json },
        responses: { "200": { description: "Checkout URL", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/orders": {
      get: {
        summary: "List project orders",
        parameters: [{ $ref: "#/components/parameters/cursor" }, { $ref: "#/components/parameters/limit" }],
        responses: { "200": { description: "Order page", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
    "/orders/{ref}": {
      get: {
        summary: "Read an order by order or provider checkout id",
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Order", content: json }, default: { $ref: "#/components/responses/Error" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API key" },
    },
    parameters: {
      code: { name: "code", in: "path", required: true, schema: { type: "string" } },
      cursor: { name: "cursor", in: "query", schema: { type: "string" } },
      limit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
      externalUserId: { name: "externalUserId", in: "query", required: true, schema: { type: "string" } },
    },
    responses: {
      Error: {
        description: "Machine-readable error response",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["error", "code", "requestId"],
              properties: {
                error: { type: "string" },
                code: { type: "string" },
                requestId: { type: "string", description: "Support request identifier" },
                details: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        headers: {
          "X-Request-Id": {
            description: "Support request identifier",
            schema: { type: "string" },
          },
          "Retry-After": {
            description: "Seconds until a rate-limited request can be retried",
            schema: { type: "integer", minimum: 1 },
          },
          "RateLimit-Limit": {
            description: "Token bucket capacity",
            schema: { type: "integer", minimum: 1 },
          },
          "RateLimit-Remaining": {
            description: "Tokens remaining in the current bucket",
            schema: { type: "integer", minimum: 0 },
          },
          "RateLimit-Reset": {
            description: "Seconds until another token is available",
            schema: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  },
};

export function GET(): Response {
  return Response.json(spec, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
