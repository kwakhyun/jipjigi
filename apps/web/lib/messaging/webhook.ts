import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhook(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(body: string, provided: string | null, secret?: string) {
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(signWebhook(body, secret));
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
