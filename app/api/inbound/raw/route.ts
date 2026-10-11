import { ingest } from "@/lib/mail";
import { parseRaw } from "@/lib/raw";
import { addrList, safeEqual } from "@/lib/util";
import { conf } from "@/lib/config";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Any mail server or relay (a Cloudflare Email Worker, Postfix pipe, SES → Lambda ...) POSTs the raw email here.
// Authorization: Bearer <INBOUND_SECRET>. Optional ?to=a@x,b@y = the envelope recipients (so bcc'd inboxes get it too).
export async function POST(req: Request) {
  const secret = await conf("INBOUND_SECRET");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(got, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (!raw.length) return Response.json({ error: "empty body" }, { status: 400 });
  if (raw.length > 30 * 1024 * 1024) return Response.json({ error: "too large" }, { status: 413 });
  const saved = await ingest(await parseRaw(raw, addrList(new URL(req.url).searchParams.get("to") || "")));
  return Response.json({ saved });
}
