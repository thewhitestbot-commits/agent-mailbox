import { route, qp } from "@/lib/api";
import { createInbox, listInboxes } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async req => ({ inboxes: await listInboxes(Number(qp(req).get("limit")) || 100) }));
export const POST = route(async (_r, _c, b) => createInbox(b));
