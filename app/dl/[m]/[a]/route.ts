import { isAdmin } from "@/lib/admin";
import { getAttachment } from "@/lib/mail";
export const dynamic = "force-dynamic";
export async function GET(_r: Request, { params }: { params: { m: string; a: string } }) {
  if (!isAdmin()) return new Response("Not signed in", { status: 401 });
  try {
    const a = await getAttachment(params.m, params.a);
    return new Response(new Uint8Array(a.data), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${a.filename.replace(/["\\\r\n]/g, "_")}"`, "x-content-type-options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
