export interface ProviderServiceConfig {
  port: number;
  authSecret: string;
}

export function providerServiceConfig(): ProviderServiceConfig {
  const authSecret = process.env.PAY_PROVIDER_SERVICE_SECRET;
  if (!authSecret || authSecret.length < 16) {
    throw new Error(
      "PAY_PROVIDER_SERVICE_SECRET must be set and at least 16 chars",
    );
  }

  return {
    port: Number(process.env.PORT ?? process.env.PAY_PROVIDER_SERVICE_PORT ?? 3001),
    authSecret,
  };
}
