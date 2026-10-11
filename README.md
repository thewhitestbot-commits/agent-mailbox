# ✉︎ Agent Mailbox

**Real email inboxes for AI agents. Self-hosted, free, MIT.**

One API call gives your agent its own address. It can send, receive, reply in proper threads, read attachments, and get a webhook the moment mail arrives. Use it over REST or plug it straight into any MCP client.

```bash
curl -X POST https://your-app.example.com/api/v1/inboxes \
  -H "Authorization: Bearer am_..." -H "content-type: application/json" \
  -d '{"username": "support-bot", "display_name": "Support"}'
# → { "id": "inb_...", "address": "support-bot@agents.example.com", ... }
```

## What you get

- **Inboxes on demand.** Pick a username or get a random one. Pass `client_id` and repeat calls return the same inbox, so a retrying agent never makes duplicates.
- **Send and reply.** Plain text or HTML, cc/bcc, attachments up to 20 MB. Replies carry the right `In-Reply-To` / `References` headers, so they thread correctly in Gmail and Outlook.
- **Threads that hold together.** Incoming mail joins its conversation by message headers, falling back to subject and sender when a client strips the headers.
- **Attachments.** Stored with the message and downloadable over the API.
- **Webhooks.** `message.received`, `message.sent` and `message.failed`, signed with HMAC-SHA256, retried up to 3 times, and every delivery logged. Scope a webhook to one inbox or to all of them.
- **MCP server built in.** `/api/mcp` exposes `create_inbox`, `list_inboxes`, `list_messages`, `get_message`, `get_thread`, `send_message`, `reply` and `update_message`.
- **Labels and read state.** Lets an agent keep its own workflow: `needs-human`, `billing`, `done`.
- **Dashboard.** Browse every inbox, read threads, send and reply by hand, and manage keys and webhooks.
- **Your data stays with you.** One Postgres database and one Next.js app. Run it anywhere.

## Run it

```bash
git clone https://github.com/<you>/agent-mailbox && cd agent-mailbox
npm install
cp .env.example .env.local      # fill it in (below)
npm run dev                     # http://localhost:3222
```

Or deploy it to Vercel (or anywhere Node runs) with a Postgres URL. The tables create themselves on first use.

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Any Postgres |
| `MAIL_DOMAINS` | The domain(s) your inboxes live on, comma-separated |
| `RESEND_API_KEY` | Sending, plus receiving through Resend |
| `ADMIN_PASSWORD` | Turns on the dashboard |
| `INBOUND_SECRET` | Optional: lets any mail server POST raw email to you |
| `MAIL_PROVIDER=none` | Local testing: outgoing mail is stored, not sent |

Sign in to the dashboard, open **Keys & webhooks**, and create an API key. The key is shown once and only a hash is stored.

## Receiving mail

Pick one of these.

**A. Resend.** Add your domain in Resend, turn on receiving, and point the `email.received` webhook at `https://your-app/api/inbound/resend`. The server reads each message back from Resend with your own key, so a forged webhook can't plant mail.

**B. Any mail server, including free Cloudflare Email Routing.** POST the raw email to `/api/inbound/raw` with `Authorization: Bearer $INBOUND_SECRET`. For Cloudflare, use [`examples/cloudflare-email-worker.js`](examples/cloudflare-email-worker.js). Add `?to=address` so bcc'd inboxes get their copy too.

Mail for addresses that don't belong to an inbox is ignored.

## API

All requests send `Authorization: Bearer am_...`. Everything is JSON.

| | |
|---|---|
| `POST /api/v1/inboxes` | `{ username?, domain?, display_name?, client_id?, metadata? }` |
| `GET /api/v1/inboxes` | List inboxes |
| `GET · PATCH · DELETE /api/v1/inboxes/:id` | `:id` can be the id or the address |
| `GET /api/v1/inboxes/:id/messages` | `?limit=25&before=msg_…&unread=true&label=x&direction=in&thread_id=…&full=true` |
| `POST /api/v1/inboxes/:id/messages` | Send: `{ to, cc?, bcc?, subject, text?, html?, labels?, attachments?: [{ filename, content (base64), content_type? }] }` |
| `GET /api/v1/inboxes/:id/threads` | Recent conversations |
| `GET /api/v1/threads/:id` | A whole conversation, oldest first |
| `GET /api/v1/messages/:id` | One message, in full |
| `PATCH /api/v1/messages/:id` | `{ read?, add_labels?, remove_labels? }` |
| `POST /api/v1/messages/:id/reply` | `{ text?, html?, reply_all?, attachments? }` |
| `GET /api/v1/messages/:id/attachments/:att` | The file |
| `GET · POST /api/v1/webhooks` | `{ url, events?, inbox_id? }`. The signing secret is returned once |
| `DELETE /api/v1/webhooks/:id` | Remove a webhook |

Paging works like this: pass the `next_before` from one response as `before` on the next request.

### A full loop

```bash
# 1. an inbox
curl -s -X POST $URL/api/v1/inboxes -H "$AUTH" -d '{"username":"quotes"}'
# 2. someone emails quotes@agents.example.com, and your webhook gets:
#    { "event": "message.received", "data": { "id": "msg_…", "from": "lee@buyer.com", "subject": "Quote for 500 units", "text": "…" } }
# 3. the agent answers in the same thread
curl -s -X POST $URL/api/v1/messages/msg_…/reply -H "$AUTH" -d '{"text":"$4.20 each, ships Friday."}'
```

## Webhook signatures

Every webhook POST carries a `X-Mailbox-Signature: t=<unix>,v1=<hex>` header, where `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. Check it with [`examples/verify-webhook.ts`](examples/verify-webhook.ts) and reject anything older than 5 minutes.

## MCP

Point any MCP client at `https://your-app/api/mcp` (HTTP transport) with the header `Authorization: Bearer am_...`. The agent can then make inboxes, read mail and reply on its own.

## Security notes

- API keys and webhook secrets are random. Keys are stored only as SHA-256 hashes.
- Every dashboard page checks the admin cookie itself. The cookie is signed and lasts 400 days.
- A deleted inbox's address is never handed to anyone else, so old mail can't reach a new owner.
- Attachments are always served as downloads (`nosniff`), never rendered inline.

## Tests

```bash
createdb mailbox_test
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/mailbox_test npm test   # wipes that database each run
```

The tests cover receiving (with attachments, duplicates and bcc), threading, replies, sending failures, paging, signed and retried webhooks, API keys and the MCP tools.

## License

MIT. Use it, fork it, sell it, ship it.
