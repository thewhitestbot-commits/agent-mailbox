import { route } from "@/lib/api";
import { getThread } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async (_r, { params }) => getThread(params.id));
