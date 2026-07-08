DROP INDEX "webhook_provider_event_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_provider_account_event_uq" ON "webhook_events" USING btree ("provider_account_id","provider","provider_event_id");
