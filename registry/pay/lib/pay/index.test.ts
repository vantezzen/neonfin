import { expect, test } from "bun:test";
import { createPayClient } from "./index";

test("browser client refuses to mint an anonymous wallet during SSR", async () => {
  const client = createPayClient({
    baseUrl: "https://pay.example.com",
    publishableKey: "pay_pk_example",
  });

  let message = "";
  try {
    await client.getOrCreateCode();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message.includes("browser-only")).toBe(true);
});
