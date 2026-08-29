import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhookSignature } from "./webhook";

describe("message webhook signatures", () => {
  const body = JSON.stringify({ providerMessageId: "sandbox_1", status: "delivered" });
  const secret = "test-webhook-secret";

  it("accepts an authentic HMAC signature", () => {
    expect(verifyWebhookSignature(body, signWebhook(body, secret), secret)).toBe(true);
  });

  it("rejects missing or modified signatures", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(`${body}x`, signWebhook(body, secret), secret)).toBe(false);
  });
});
