import { route } from "@/lib/api";
import { reply } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = route(async (_r, { params }, b) => reply(params.id, b));
