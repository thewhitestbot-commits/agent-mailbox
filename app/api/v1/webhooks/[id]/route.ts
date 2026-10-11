import { route } from "@/lib/api";
import { q } from "@/lib/db";
import { ApiError } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const DELETE = route(async (_r, { params }) => {
  const r = await q("update webhooks set disabled_at = now() where id = $1 and disabled_at is null returning id", [params.id]);
  if (!r.length) throw new ApiError(404, "webhook not found");
  return { id: params.id, deleted: true };
});
