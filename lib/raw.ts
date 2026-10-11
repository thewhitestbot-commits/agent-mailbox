// A raw email (RFC 5322 text, the way any mail server hands it over) → the shape ingest() takes.
import { simpleParser, type AddressObject } from "mailparser";
import type { Incoming } from "./mail";

const addrs = (a: AddressObject | AddressObject[] | undefined) => (Array.isArray(a) ? a : a ? [a] : []).flatMap(x => x.value.map(v => v.address || "")).filter(Boolean);
export async function parseRaw(raw: Buffer | string, envelopeTo: string[] = []): Promise<Incoming> {
  const m = await simpleParser(raw);
  return {
    messageId: m.messageId || null, inReplyTo: m.inReplyTo || null,
    references: Array.isArray(m.references) ? m.references : m.references || "",
    from: addrs(m.from)[0] || "", to: addrs(m.to), cc: addrs(m.cc), replyTo: addrs(m.replyTo)[0] || null,
    subject: m.subject || "", text: m.text || "", html: typeof m.html === "string" ? m.html : null, envelopeTo,
    attachments: m.attachments.filter(a => a.contentDisposition !== "inline" || a.filename).map(a => ({ filename: a.filename || "file", contentType: a.contentType || "application/octet-stream", data: a.content })),
  };
}
