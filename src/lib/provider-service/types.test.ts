import { expect, test } from "bun:test";
import { eventFromWire, eventToWire, type NormalizedEvent } from "./types";

test("provider events serialize dates only on the HTTP wire", () => {
  const event: NormalizedEvent = {
    type: "subscription.renewed",
    providerEventId: "evt_123",
    rawType: "invoice.paid",
    customerEmail: "buyer@example.com",
    currentPeriodEnd: new Date("2026-07-09T10:00:00.000Z"),
  };

  const wire = eventToWire(event);
  expect(wire.customerEmail).toBe("buyer@example.com");
  expect(wire.currentPeriodEnd).toBe("2026-07-09T10:00:00.000Z");

  const parsed = eventFromWire(wire);
  expect(parsed.customerEmail).toBe("buyer@example.com");
  expect(parsed.currentPeriodEnd?.toISOString()).toBe(
    "2026-07-09T10:00:00.000Z",
  );
});
