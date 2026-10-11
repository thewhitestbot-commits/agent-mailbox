// Checking a webhook really came from your mailbox server (Node / any framework).
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody: string, header: string | null, secret: string, toleranceSec = 300) {
  const m = /t=(\d+),v1=([0-9a-f]+)/.exec(header || ""); if (!m) return false;
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > toleranceSec) return false;
  const want = createHmac("sha256", secret).update(`${m[1]}.${rawBody}`).digest("hex");
  return want.length === m[2].length && timingSafeEqual(Buffer.from(want), Buffer.from(m[2]));
}
