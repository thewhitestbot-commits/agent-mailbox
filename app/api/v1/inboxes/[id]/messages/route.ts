import { route, qp } from "@/lib/api";
import { listMessages, send } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = route(async (req, { params }) => {
  const p = qp(req);
  return listMessages(params.id, { limit: Number(p.get("limit")) || 25, before: p.get("before") || undefined, unread: p.get("unread") === "true",
    label: p.get("label") || undefined, direction: p.get("direction") || undefined, thread_id: p.get("thread_id") || undefined, full: p.get("full") === "true" });
});
export const POST = route(async (_r, { params }, b) => send(params.id, b));
