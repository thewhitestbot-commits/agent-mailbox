// Model Context Protocol over plain HTTP (JSON-RPC 2.0, JSON responses). Point an MCP client at /api/mcp with
// "Authorization: Bearer am_...".
import { bearer, checkKey } from "@/lib/keys";
import { ApiError } from "@/lib/mail";
import { TOOLS } from "@/lib/mcp";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any }; // eslint-disable-line
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize":
      return ok(m.id, { protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "agent-mailbox", version: "0.1.0" } });
    case "ping": return ok(m.id, {});
    case "tools/list": return ok(m.id, { tools: TOOLS.map(({ run: _r, ...t }) => (void _r, t)) });
    case "tools/call": {
      const t = TOOLS.find(x => x.name === m.params?.name);
      if (!t) return err(m.id, -32602, `unknown tool ${m.params?.name}`);
      try { return ok(m.id, { content: [{ type: "text", text: JSON.stringify(await t.run(m.params?.arguments ?? {}), null, 2) }] }); }
      catch (e) { return ok(m.id, { isError: true, content: [{ type: "text", text: e instanceof ApiError ? e.message : "server error" }] }); }
    }
    default: return m.id === undefined ? null : err(m.id, -32601, `method not found: ${m.method}`);
  }
}
export async function POST(req: Request) {
  if (!(await checkKey(bearer(req)))) return Response.json(err(null, -32001, "missing or invalid API key"), { status: 401 });
  const body = await req.json().catch(() => null) as Rpc | Rpc[] | null;
  if (!body) return Response.json(err(null, -32700, "parse error"), { status: 400 });
  const out = (await Promise.all((Array.isArray(body) ? body : [body]).map(handle))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });           // notifications only
  return Response.json(Array.isArray(body) ? out : out[0]);
}
export async function GET() { return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }); }
