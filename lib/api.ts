// Every /v1 route goes through here: API key check, JSON in, JSON out, errors as {error}.
import { ApiError } from "./mail";
import { bearer, checkKey } from "./keys";

type Ctx = { params: Record<string, string> };
export function route(fn: (req: Request, ctx: Ctx, body: any) => Promise<unknown>) { // eslint-disable-line
  return async (req: Request, ctx: Ctx) => {
    try {
      if (!(await checkKey(bearer(req)))) return Response.json({ error: "missing or invalid API key (Authorization: Bearer am_...)" }, { status: 401 });
      let body: unknown = {};
      if (req.method !== "GET" && req.method !== "DELETE") {
        const t = await req.text();
        if (t) { try { body = JSON.parse(t); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); } }
      }
      const out = await fn(req, ctx, body ?? {});
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "server error" }, { status: 500 });
    }
  };
}
export const qp = (req: Request) => new URL(req.url).searchParams;
