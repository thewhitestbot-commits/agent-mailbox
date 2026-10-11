process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://localhost:5432/mailbox_test";
process.env.MAIL_DOMAINS = "agents.test,other.test";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { q, end } from "../lib/db";
import * as mail from "../lib/mail";
import { setSender, type OutgoingWire } from "../lib/provider";
import { createKey, checkKey } from "../lib/keys";
import { createHook, sign } from "../lib/webhooks";
import { parseRaw } from "../lib/raw";
import { addrList, cleanLocal, idList, replySubject } from "../lib/util";
import { TOOLS } from "../lib/mcp";

const sent: OutgoingWire[] = [];
before(async () => {
  await q("select 1");
  await q("truncate webhook_deliveries, webhooks, attachments, messages, threads, inboxes, api_keys restart identity cascade");
  setSender(async m => { sent.push(m); return { id: `prov-${sent.length}` }; });
});
after(async () => { setSender(null); await end(); });

test("helpers", () => {
  assert.deepEqual(addrList("Ana <ANA@x.com>, bob@y.org; nope"), ["ana@x.com", "bob@y.org"]);
  assert.equal(cleanLocal("  Support Bot!! "), "support-bot");
  assert.deepEqual(idList("<a@x> junk <b@y>"), ["<a@x>", "<b@y>"]);
  assert.equal(replySubject("Fwd: Hello"), "Re: Hello");
  assert.equal(replySubject("RE: Hello"), "RE: Hello");
});

test("inboxes: create, idempotent client_id, taken, other domain, delete keeps address reserved", async () => {
  const a = await mail.createInbox({ username: "Support Bot", display_name: "Support" });
  assert.equal(a.address, "support-bot@agents.test");
  const r = await mail.createInbox({});
  assert.match(r.address, /^[a-z]+-[a-z]+-[0-9a-f]{6}@agents\.test$/);
  const c1 = await mail.createInbox({ client_id: "agent-42", username: "fortytwo" });
  const c2 = await mail.createInbox({ client_id: "agent-42", username: "whatever" });
  assert.equal(c1.id, c2.id);
  await assert.rejects(mail.createInbox({ username: "support-bot" }), /taken/);
  await assert.rejects(mail.createInbox({ username: "x", domain: "evil.com" }), /domain must be/);
  assert.equal((await mail.createInbox({ username: "x", domain: "other.test" })).address, "x@other.test");
  const tmp = await mail.createInbox({ username: "temp" });
  await mail.deleteInbox(tmp.id);
  await assert.rejects(mail.getInbox(tmp.id), /not found/);
  const again = await mail.createInbox({ username: "temp" });           // the name can be made again, but old mail never reaches it
  assert.notEqual(again.id, tmp.id);
  assert.equal(await mail.getInbox("SUPPORT-BOT@agents.test").then(i => i.id), a.id);
});

test("receive raw mail with an attachment, dedupe, bcc via envelope, unknown recipients ignored", async () => {
  const raw = [
    "From: Ana Diaz <ana@customer.com>", "To: support-bot@agents.test, stranger@agents.test", "Subject: Order 1182 is late",
    "Message-ID: <first@customer.com>", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="b1"', "",
    "--b1", "Content-Type: text/plain; charset=utf-8", "", "Where is my order?", "",
    "--b1", 'Content-Type: application/pdf; name="receipt.pdf"', 'Content-Disposition: attachment; filename="receipt.pdf"', "Content-Transfer-Encoding: base64", "",
    Buffer.from("%PDF-1.4 fake").toString("base64"), "--b1--", "",
  ].join("\r\n");
  const ids = await mail.ingest(await parseRaw(raw));
  assert.equal(ids.length, 1);
  const m = await mail.getMessage(ids[0]);
  assert.equal(m.from, "ana@customer.com");
  assert.equal(m.subject, "Order 1182 is late");
  assert.equal((m as { text: string }).text.trim(), "Where is my order?");
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].filename, "receipt.pdf");
  assert.equal((await mail.getAttachment(m.id, m.attachments[0].id)).data.toString(), "%PDF-1.4 fake");
  assert.deepEqual(await mail.ingest(await parseRaw(raw)), []);                 // same Message-ID again: not filed twice
  const bcc = await mail.ingest(await parseRaw(raw.replace("first@", "second@"), ["fortytwo@agents.test"]));
  assert.equal(bcc.length, 2);                                                  // support-bot (To) + fortytwo (envelope only)
});

test("threads: reply goes to sender, In-Reply-To/References set, the customer's answer joins the thread", async () => {
  const ib = await mail.getInbox("support-bot@agents.test");
  const first = (await mail.listMessages(ib.id, { full: true })).messages.find(m => m.message_id === "<first@customer.com>")!;
  const r = await mail.reply(first.id, { text: "It ships today." });
  assert.equal(r.thread_id, first.thread_id);
  assert.deepEqual(r.to, ["ana@customer.com"]);
  assert.equal(r.subject, "Re: Order 1182 is late");
  assert.equal(r.status, "sent");
  const wire = sent[sent.length - 1];
  assert.equal(wire.headers["In-Reply-To"], "<first@customer.com>");
  assert.equal(wire.from, '"Support" <support-bot@agents.test>');
  const back = await mail.ingest({ from: "ana@customer.com", to: [ib.address], subject: "Re: Order 1182 is late", text: "Thanks!", messageId: "<third@customer.com>", inReplyTo: r.message_id, references: `<first@customer.com> ${r.message_id}` });
  assert.equal((await mail.getMessage(back[0])).thread_id, first.thread_id);
  const t = await mail.getThread(first.thread_id);
  assert.deepEqual(t.messages.map(m => m.direction), ["in", "in", "out", "in"]);   // the second copy (same person, same subject) joined too
  // no headers at all, same subject + same person → still the same thread
  const loose = await mail.ingest({ from: "Ana <ana@customer.com>", to: [ib.address], subject: "RE: re: Order 1182 is late", text: "One more thing" });
  assert.equal((await mail.getMessage(loose[0])).thread_id, first.thread_id);
});

test("send: validation, failure recorded, labels and read", async () => {
  const ib = await mail.getInbox("support-bot@agents.test");
  await assert.rejects(mail.send(ib.id, { to: "not-an-address", text: "x" }), /valid address/);
  await assert.rejects(mail.send(ib.id, { to: "a@b.co" }), /subject or a body/);
  setSender(async () => { throw new Error("provider down"); });
  await assert.rejects(mail.send(ib.id, { to: "a@b.co", subject: "Hi", text: "x" }), /provider down/);
  setSender(async m => { sent.push(m); return { id: `prov-${sent.length}` }; });
  const failed = (await mail.listMessages(ib.id, { direction: "out" })).messages.find(m => m.status === "failed")!;
  assert.match(failed.error!, /provider down/);
  const ok = await mail.send(ib.id, { to: ["a@b.co"], subject: "Report", text: "Attached", attachments: [{ filename: "r.csv", content: Buffer.from("a,b\n1,2").toString("base64"), content_type: "text/csv" }] });
  assert.equal(sent[sent.length - 1].attachments[0].content.toString(), "a,b\n1,2");
  const lab = await mail.updateMessage(ok.id, { add_labels: ["Billing", "urgent"], read: false });
  assert.deepEqual([...lab.labels].sort(), ["billing", "urgent"]);
  const lab2 = await mail.updateMessage(ok.id, { remove_labels: ["urgent"] });
  assert.deepEqual(lab2.labels, ["billing"]);
  assert.equal((await mail.listMessages(ib.id, { label: "billing" })).messages.length, 1);
});

test("paging", async () => {
  const ib = await mail.createInbox({ username: "pager" });
  for (let i = 0; i < 7; i++) await mail.ingest({ from: "x@y.co", to: [ib.address], subject: `n${i}`, text: "." });
  const p1 = await mail.listMessages(ib.id, { limit: 3 });
  const p2 = await mail.listMessages(ib.id, { limit: 3, before: p1.next_before! });
  const p3 = await mail.listMessages(ib.id, { limit: 3, before: p2.next_before! });
  assert.deepEqual([...p1.messages, ...p2.messages, ...p3.messages].map(m => m.subject), ["n6", "n5", "n4", "n3", "n2", "n1", "n0"]);
  assert.equal(p3.next_before, null);
});

test("webhooks: signed, retried, scoped to an inbox", async () => {
  const got: { sig: string; body: string }[] = []; let fails = 1;
  const srv = createServer((req, res) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
    if (fails-- > 0) { res.statusCode = 500; return res.end(); }
    got.push({ sig: String(req.headers["x-mailbox-signature"]), body: b }); res.end("ok"); }); });
  await new Promise<void>(r => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  const ib = await mail.createInbox({ username: "hooked" });
  const h = await createHook({ url: `http://localhost:${port}/hook`, inbox_id: ib.id });
  await assert.rejects(createHook({ url: "ftp://x" }), /https/);
  await mail.ingest({ from: "z@z.co", to: ["pager@agents.test"], subject: "not for the hook", text: "." });
  await mail.ingest({ from: "z@z.co", to: [ib.address], subject: "Ping", text: "hello" });
  srv.close();
  assert.equal(got.length, 1);
  const p = JSON.parse(got[0].body);
  assert.equal(p.event, "message.received"); assert.equal(p.data.subject, "Ping");
  const t = Number(got[0].sig.match(/t=(\d+)/)![1]);
  assert.equal(got[0].sig, sign(h.secret, got[0].body, t));
  const [d] = await q("select attempts, status from webhook_deliveries where webhook_id = $1", [h.id]);
  assert.equal(d.attempts, 2); assert.equal(d.status, 200);
});

test("api keys and MCP tools", async () => {
  const { key } = await createKey("agent");
  assert.ok(await checkKey(key));
  assert.equal(await checkKey(key + "x"), null);
  assert.equal(await checkKey("nope"), null);
  await q("update api_keys set revoked_at = now()");
  assert.equal(await checkKey(key), null);
  const names = TOOLS.map(t => t.name);
  for (const n of ["create_inbox", "send_message", "reply", "list_messages", "get_thread"]) assert.ok(names.includes(n));
  const created = await TOOLS.find(t => t.name === "create_inbox")!.run({ username: "mcp-made" }) as { address: string };
  assert.equal(created.address, "mcp-made@agents.test");
  const s = await TOOLS.find(t => t.name === "send_message")!.run({ inbox: "mcp-made@agents.test", to: ["q@r.co"], subject: "From MCP", text: "hi" }) as { status: string };
  assert.equal(s.status, "sent");
});
