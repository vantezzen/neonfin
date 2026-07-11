ALTER TABLE "orders" ADD COLUMN "checkout_url" text;
ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;
CREATE UNIQUE INDEX "orders_project_idempotency_uq" ON "orders" USING btree ("project_id", "idempotency_key");
