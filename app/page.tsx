import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Nav from "./Nav";
import { needAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { createInbox, ApiError } from "@/lib/mail";
import { getDomains } from "@/lib/config";
export const dynamic = "force-dynamic";

async function make(f: FormData) {
  "use server";
  needAdmin();
  try { const ib = await createInbox({ username: String(f.get("username") || "") || undefined, domain: String(f.get("domain") || "") || undefined, display_name: String(f.get("display_name") || "") }); revalidatePath("/"); redirect(`/inbox/${ib.id}`); }
  catch (e) { if (e instanceof ApiError) redirect(`/?err=${encodeURIComponent(e.message)}`); throw e; }
}
export default async function Home({ searchParams }: { searchParams: { err?: string } }) {
  needAdmin();
  const rows = await q<{ id: string; address: string; display_name: string; unread: number; total: number; last: string | null }>(`
    select i.id, i.address, i.display_name, count(m.id) filter (where m.direction = 'in' and not m.read)::int unread, count(m.id)::int total, max(m.created_at)::text last
    from inboxes i left join messages m on m.inbox_id = i.id where i.deleted_at is null group by i.id order by max(m.created_at) desc nulls last, i.created_at desc`);
  const ds = await getDomains();
  return <><Nav /><div className="wrap">
    <h1>Inboxes</h1>
    {rows.length ? <div className="list">{rows.map(r =>
      <a key={r.id} href={`/inbox/${r.id}`} className="row" style={{ color: "inherit" }}>
        <span className={`grow ${r.unread ? "unread" : ""}`}>{r.address}{r.display_name && <span className="dim"> · {r.display_name}</span>}</span>
        {r.unread > 0 && <span className="tag good">{r.unread} new</span>}
        <span className="dim small">{r.total} messages</span>
      </a>)}</div> : <div className="card dim">No inboxes yet. Make one below, or with one API call.</div>}
    <h2>New inbox</h2>
    {ds.length ? <form action={make} className="card grid">
      <div className="two"><input name="username" placeholder="username (blank = random)" />
        <select name="domain" defaultValue={ds[0]}>{ds.map(d => <option key={d} value={d}>@{d}</option>)}</select></div>
      <input name="display_name" placeholder="Name shown to people (optional)" />
      {searchParams.err && <div className="bad small">{searchParams.err}</div>}
      <div><button>Create inbox</button></div>
    </form> : <div className="card">First, add your mail domain on the <a href="/settings">Setup</a> screen.</div>}
  </div></>;
}
