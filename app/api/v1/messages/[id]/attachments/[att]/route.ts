import { route } from "@/lib/api";
import { getAttachment } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async (_r, { params }) => {
  const a = await getAttachment(params.id, params.att);
  return new Response(new Uint8Array(a.data), { headers: { "content-type": a.content_type, "content-disposition": `attachment; filename="${a.filename.replace(/["\\\r\n]/g, "_")}"`, "x-content-type-options": "nosniff" } });
});
