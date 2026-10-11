"use client";
import { useFormState } from "react-dom";
import { newHook, newKey, type Shown } from "./actions";

function Reveal({ s, note }: { s: Shown; note: string }) {
  if (s?.error) return <div className="bad small">{s.error}</div>;
  return s?.value ? <div><div className="small good">{note}</div><pre>{s.value}</pre></div> : null;
}
export function KeyForm() {
  const [s, act] = useFormState(newKey, null);
  return <form action={act} className="card grid" style={{ marginTop: 10 }}>
    <div className="two"><input name="name" placeholder="Name (e.g. support agent)" /><div><button>Create key</button></div></div>
    <Reveal s={s} note="Copy it now — it won't be shown again." />
  </form>;
}
export function HookForm({ events, inboxes }: { events: readonly string[]; inboxes: { id: string; address: string }[] }) {
  const [s, act] = useFormState(newHook, null);
  return <form action={act} className="card grid" style={{ marginTop: 10 }}>
    <input name="url" placeholder="https://your-agent.example.com/mail" required />
    <div className="small">{events.map(e => <label key={e} style={{ marginRight: 14 }}><input type="checkbox" name="events" value={e} defaultChecked={e === "message.received"} style={{ width: "auto", marginRight: 4 }} />{e}</label>)}</div>
    <select name="inbox" defaultValue=""><option value="">All inboxes</option>{inboxes.map(i => <option key={i.id} value={i.id}>{i.address}</option>)}</select>
    <div><button>Add webhook</button></div>
    <Reveal s={s} note="Signing secret — copy it now, it won't be shown again." />
  </form>;
}
