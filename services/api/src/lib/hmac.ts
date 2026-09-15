import crypto from "node:crypto";

export function createQrTokenValue(nonce: string, certificateId: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret).update(`${nonce}.${certificateId}`).digest("base64url");
  return `${nonce}.${hmac}`;
}

export function qrTokenLooksValid(token: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export function hmacMatches(token: string, nonce: string, certificateId: string, secret: string) {
  const expected = createQrTokenValue(nonce, certificateId, secret);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function sha256Canonical(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function randomNonce() {
  return crypto.randomBytes(16).toString("hex");
}
