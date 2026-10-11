// MCP tools: the same actions as the REST API, for agents that speak the Model Context Protocol.
import * as mail from "./mail";

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; run: (a: any) => Promise<unknown> }; // eslint-disable-line
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const strs = (description: string) => ({ type: "array", items: { type: "string" }, description });
const files = { type: "array", description: "Files to attach", items: obj({ filename: str("File name"), content: str("File contents, base64"), content_type: str("MIME type") }, ["filename", "content"]) };

export const TOOLS: Tool[] = [
  { name: "create_inbox", description: "Create a new email inbox. Returns its id and address. Pass client_id to make the call safe to repeat.",
    inputSchema: obj({ username: str("Part before the @ (random if left out)"), display_name: str("Name shown to recipients"), client_id: str("Your own key for this inbox") }), run: a => mail.createInbox(a) },
  { name: "list_inboxes", description: "List all inboxes.", inputSchema: obj({}), run: async () => ({ inboxes: await mail.listInboxes() }) },
  { name: "list_messages", description: "List recent messages in an inbox, newest first.",
    inputSchema: obj({ inbox: str("Inbox id or address"), unread: { type: "boolean" }, label: str("Only messages with this label"), limit: { type: "number" }, before: str("Message id to page from") }, ["inbox"]),
    run: a => mail.listMessages(a.inbox, a) },
  { name: "get_message", description: "Read one message in full, with its attachments listed.", inputSchema: obj({ message_id: str("Message id") }, ["message_id"]), run: a => mail.getMessage(a.message_id) },
  { name: "get_thread", description: "Read a whole conversation in order.", inputSchema: obj({ thread_id: str("Thread id") }, ["thread_id"]), run: a => mail.getThread(a.thread_id) },
  { name: "send_message", description: "Send a new email from an inbox.",
    inputSchema: obj({ inbox: str("Inbox id or address"), to: strs("Recipients"), cc: strs("Cc"), bcc: strs("Bcc"), subject: str("Subject"), text: str("Plain-text body"), html: str("HTML body (optional)"), attachments: files }, ["inbox", "to"]),
    run: ({ inbox, ...o }) => mail.send(inbox, o) },
  { name: "reply", description: "Reply to a message in the same thread.",
    inputSchema: obj({ message_id: str("The message to answer"), text: str("Plain-text body"), html: str("HTML body (optional)"), reply_all: { type: "boolean" }, attachments: files }, ["message_id"]),
    run: ({ message_id, ...o }) => mail.reply(message_id, o) },
  { name: "update_message", description: "Mark read/unread and add or remove labels.",
    inputSchema: obj({ message_id: str("Message id"), read: { type: "boolean" }, add_labels: strs("Labels to add"), remove_labels: strs("Labels to remove") }, ["message_id"]),
    run: ({ message_id, ...o }) => mail.updateMessage(message_id, o) },
];
