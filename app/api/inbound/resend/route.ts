import { ingest } from "@/lib/mail";
import { fetchResendReceived } from "@/lib/provider";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
// Resend's "email.received" webhook. Only the email id is trusted: the message itself is read back from Resend with
// the server's own key, so a forged webhook can't plant mail and no webhook secret is needed.
export async function POST(req: Request) {
  const j = await req.json().catch(() => null) as { type?: string; data?: { email_id?: string; id?: string } } | null;
  if (j?.type !== "email.received") return Response.json({ ok: true, skipped: true });
  const id = j.data?.email_id ?? j.data?.id;
  if (!id || !/^[\w-]{6,80}$/.test(id)) return Response.json({ error: "no id" }, { status: 400 });
  try { return Response.json({ saved: await ingest(await fetchResendReceived(id)) }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
