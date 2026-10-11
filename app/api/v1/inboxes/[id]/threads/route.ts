import { route, qp } from "@/lib/api";
import { listThreads } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async (req, { params }) => ({ threads: await listThreads(params.id, Number(qp(req).get("limit")) || 25) }));
