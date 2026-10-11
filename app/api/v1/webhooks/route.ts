import { route } from "@/lib/api";
import { q } from "@/lib/db";
import { ApiError } from "@/lib/mail";
import { createHook } from "@/lib/webhooks";
export const dynamic = "force-dynamic";
export const GET = route(async () => ({ webhooks: await q("select id, url, events, inbox_id, created_at::text as created_at from webhooks where disabled_at is null order by created_at desc") }));
export const POST = route(async (_r, _c, b) => { try { return await createHook(b); } catch (e) { throw new ApiError(400, (e as Error).message); } });
