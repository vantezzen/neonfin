FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . ./
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgres://pay:pay@postgres:5432/pay
ENV PAY_PROVIDER_SERVICE_URL=http://provider-service:3001
ENV PAY_PROVIDER_SERVICE_SECRET=build-only-provider-service-secret
ENV BETTER_AUTH_SECRET=build-only-better-auth-secret
ENV BETTER_AUTH_URL=$NEXT_PUBLIC_APP_URL
RUN bun run build

FROM build AS migrate
CMD ["bun", "run", "db:migrate"]

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
CMD ["bun", "run", "start", "--", "--hostname", "0.0.0.0"]
