import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils/id";

export type Provider = "stripe" | "polar";

const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();

export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("prov")),
    ownerId: text("owner_id").notNull(),
    provider: text("provider").$type<Provider>().notNull(),
    label: text("label").notNull(),
    secretKeyEnc: text("secret_key_enc").notNull(),
    webhookSecretEnc: text("webhook_secret_enc"),
    environment: text("environment").notNull().default("production"),
    createdAt,
  },
  (t) => [index("provider_accounts_owner_idx").on(t.ownerId)],
);

export type ProviderAccount = typeof providerAccounts.$inferSelect;
