import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 * @param payload - Raw request body as string
 * @param signature - Value of X-Hub-Signature-256 header
 * @param secret - Webhook secret configured in GitHub and .env
 * @returns true if signature is valid
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
