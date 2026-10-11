"use client";
import { useMemo } from "react";
import { useFormState } from "react-dom";
import { saveSetup, type Shown } from "./actions";

type S = { domains: string; domainsServer: boolean; resend: "server" | "saved" | "none"; resendEnd: string; storeOnly: boolean; providerServer: boolean; inbound: "server" | "saved" | "none" };
const Lock = () => <span className="dim small"> (set on the server)</span>;
export default function Setup({ s }: { s: S }) {
  const [r, act] = useFormState<Shown, FormData>(saveSetup, null);
  const formKey = useMemo(() => (r && !r.error ? Math.random() : 0), [r]);   // after a good save the form starts fresh (no re-generating secrets by accident)
  return <div className="card grid">
  <form key={formKey} action={act} className="grid">
    <label className="small"><b>1. Your mail domain</b>{s.domainsServer && <Lock />}<br />
      <span className="dim">The domain inboxes live on, like <code>agents.yourcompany.com</code>. More than one? Separate with commas.</span>
      <input name="MAIL_DOMAINS" defaultValue={s.domains} disabled={s.domainsServer} placeholder="agents.yourcompany.com" style={{ marginTop: 6 }} /></label>

    <label className="small"><b>2. Resend API key</b>{s.resend === "server" ? <Lock /> : s.resend === "saved" ? <span className="good small"> saved (…{s.resendEnd})</span> : <span className="bad small"> not set</span>}<br />
      <span className="dim">resend.com → API Keys → Create (Full access). Then add your domain under Domains and turn on receiving.</span>
      {s.resend !== "server" && <input name="RESEND_API_KEY" type="password" autoComplete="off" placeholder={s.resend === "saved" ? "Paste a new key to replace it" : "re_..."} style={{ marginTop: 6 }} />}
      {s.resend === "saved" && <label className="dim"><input type="checkbox" name="clear_resend" style={{ width: "auto", marginRight: 6 }} />Remove the saved key</label>}</label>

    <label className="small"><b>3. Receiving from other mail servers</b> <span className="dim">(optional — for Cloudflare Email Routing or your own server)</span>
      {s.inbound === "server" ? <Lock /> : s.inbound === "saved" ? <span className="good small"> secret saved</span> : null}<br />
      {s.inbound !== "server" && <label className="dim"><input type="checkbox" name="new_inbound" style={{ width: "auto", marginRight: 6 }} />{s.inbound === "saved" ? "Make a new secret (the old one stops working)" : "Make an inbound secret"}</label>}</label>

    <label className="small dim">{s.providerServer ? <>Sending mode<Lock /></> : <><input type="checkbox" name="store_only" defaultChecked={s.storeOnly} style={{ width: "auto", marginRight: 6 }} />Test mode: keep outgoing mail here, don't really send it</>}</label>

    {r?.error && <div className="bad small" role="alert">{r.error}</div>}
    <div><button>Save setup</button></div>
  </form>
  {r?.value ? <div><div className="small good">Saved. Inbound secret — copy it now, it won't be shown again:</div><pre>{r.value}</pre></div> : r && !r.error ? <div className="good small">Saved.</div> : null}
  </div>;
}
