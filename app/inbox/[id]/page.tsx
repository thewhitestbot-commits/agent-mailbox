import { redirect } from "next/navigation";
import Nav from "../../Nav";
import { needAdmin } from "@/lib/admin";
import { ApiError, deleteInbox, getInbox, listMessages, send } from "@/lib/mail";
export const dynamic = "force-dynamic";

async function compose(f: FormData) {
  "use server";
  needAdmin();
  const id = String(f.get("inbox"));
  try { const m = await send(id, { to: String(f.get("to") || ""), cc: String(f.get("cc") || ""), subject: String(f.get("subject") || ""), text: String(f.get("text") || "") }); redirect(`/m/${m.id}`); }
  catch (e) { if (e instanceof ApiError) redirect(`/inbox/${id}?err=${encodeURIComponent(e.message)}`); throw e; }
}
async function remove(f: FormData) {
  "use server";
  needAdmin();
  if (String(f.get("confirm")) !== "delete") redirect(`/inbox/${f.get("inbox")}?err=${encodeURIComponent('Type "delete" to confirm')}`);
  await deleteInbox(String(f.get("inbox"))); redirect("/");
}
export default async function InboxPage({ params, searchParams }: { params: { id: string }; searchParams: { before?: string; err?: string } }) {
  needAdmin();
  let ib; try { ib = await getInbox(params.id); } catch { redirect("/"); }
  const { messages, next_before } = await listMessages(ib.id, { limit: 50, before: searchParams.before });
  return <><Nav /><div className="wrap">
    <h1>{ib.address}</h1>
    <p className="dim small">id <code>{ib.id}</code>{ib.display_name && <> · shown as “{ib.display_name}”</>}</p>
    {messages.length ? <div className="list">{messages.map(m =>
      <a key={m.id} href={`/m/${m.id}`} className="row" style={{ color: "inherit" }}>
        <span className="dim small" style={{ width: 22 }}>{m.direction === "in" ? "↙" : "↗"}</span>
        <span className={`grow ${m.direction === "in" && !m.read ? "unread" : ""}`}>
          {m.direction === "in" ? m.from : `to ${m.to.join(", ")}`} — {m.subject} <span className="dim">{"preview" in m ? m.preview : ""}</span></span>
        {m.status === "failed" && <span className="tag bad">failed</span>}
        {m.attachments.length > 0 && <span className="dim small">📎{m.attachments.length}</span>}
        <span className="dim small">{new Date(m.created_at).toLocaleString()}</span>
      </a>)}</div> : <div className="card dim">Nothing here yet. Mail sent to {ib.address} shows up here.</div>}
    {next_before && <p><a href={`/inbox/${ib.id}?before=${next_before}`}>Older →</a></p>}
    <h2>Send from this inbox</h2>
    <form action={compose} className="card grid">
      <input type="hidden" name="inbox" value={ib.id} />
      <div className="two"><input name="to" placeholder="To" required /><input name="cc" placeholder="Cc" /></div>
      <input name="subject" placeholder="Subject" />
      <textarea name="text" placeholder="Message" />
      {searchParams.err && <div className="bad small">{searchParams.err}</div>}
      <div><button>Send</button></div>
    </form>
    <h2>Delete inbox</h2>
    <form action={remove} className="card grid">
      <input type="hidden" name="inbox" value={ib.id} />
      <p className="dim small" style={{ margin: 0 }}>Mail to this address stops arriving and the address is never reused. Type “delete” to confirm.</p>
      <div className="two"><input name="confirm" placeholder="delete" /><div><button className="ghost">Delete inbox</button></div></div>
    </form>
  </div></>;
}
