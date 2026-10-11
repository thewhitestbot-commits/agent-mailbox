# Setting up Agent Mailbox (instructions for an AI agent)

You are helping a person run their own Agent Mailbox. Work through these steps in order. Do everything you can yourself (commands, files, deploys), and ask the person only for what needs their accounts or their decision. Explain each thing you ask for in plain words.

## What they need before you start

Ask about all four up front, so nothing stalls halfway:

1. **A domain they control.** Suggest a subdomain just for agents, like `agents.theircompany.com`, so their normal email is never touched.
2. **A Resend account** (resend.com, free tier is fine). This sends their mail and receives it.
3. **A Postgres database.** Neon or Supabase free tiers work. Any Postgres URL does.
4. **Somewhere to run it.** Vercel is the easiest. Any Node 18+ host works.

## Steps

### 1. Get the code running locally

```bash
npm install
cp .env.example .env.local
```

Put two things in `.env.local`:
- `DATABASE_URL`: their Postgres URL
- `ADMIN_PASSWORD`: a long random password. Generate one, give it to the person, and tell them to save it in their password manager.

Run `npm run dev` and open http://localhost:3222. The tables create themselves.

### 2. Deploy

On Vercel: import the repo, add the same two environment variables (`DATABASE_URL`, `ADMIN_PASSWORD`), and deploy. Note the public URL; it's called `APP` below.

### 3. Set up the domain in Resend

Walk the person through this in the Resend dashboard (it needs their login):

1. **Domains → Add domain →** the domain from above.
2. Resend shows DNS records (MX, TXT/DKIM, SPF). Add each one at the person's DNS provider, exactly as shown. If you can reach their DNS provider yourself, do it for them.
3. **Turn on receiving** for the domain. This adds an MX record pointing at Resend.
4. Wait until Resend shows the domain as **Verified**.
5. **API Keys → Create API key** (Full access). They copy it.
6. **Webhooks → Add endpoint:** URL `APP/api/inbound/resend`, event `email.received`.

### 4. Finish in the dashboard

The person opens `APP`, signs in with `ADMIN_PASSWORD`, and goes to **Keys & webhooks → Setup**:

- **Mail domain:** the domain from step 3.
- **Resend API key:** the key from step 3.5.
- Click **Save setup**.

Then, on the same page, they **create an API key**. It's shown once. This is the key their agents use.

### 5. Prove it works

Using that API key:

```bash
curl -X POST $APP/api/v1/inboxes -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"username":"test"}'
```

1. Have the person email `test@<their domain>` from their normal email.
2. List the messages: `GET $APP/api/v1/inboxes/test@<domain>/messages`. The email should be there within a few seconds.
3. Reply to it: `POST $APP/api/v1/messages/<id>/reply` with `{"text":"Got it!"}`.
4. Ask the person to confirm the reply landed in their inbox, in the same conversation.

If the email doesn't arrive, check these in order: the domain shows Verified in Resend; the MX record exists (`dig MX <domain>`); the webhook URL is exactly `APP/api/inbound/resend` with the `email.received` event; the address matches an inbox that exists.

### 6. Hook up their agents

- **Agents that use code:** give them the API key and point them at the API in README.md. To react to new mail instantly, add a webhook (**dashboard → Webhooks**, or `POST /api/v1/webhooks`), save the signing secret, and check signatures as in `examples/verify-webhook.ts`.
- **MCP clients** (Claude Desktop, Cursor, and others): add an MCP server with URL `APP/api/mcp` and header `Authorization: Bearer <API key>`. The tools are listed in README.md.

## No Resend? Free receiving with Cloudflare

If their domain's DNS is on Cloudflare, receiving can go through Cloudflare Email Routing instead:

1. In the dashboard Setup, tick **Make an inbound secret** and copy the secret.
2. Create a Cloudflare Worker from `examples/cloudflare-email-worker.js`, with variables `MAILBOX_URL=APP` and `INBOUND_SECRET=<that secret>`.
3. Under **Email Routing**, send a catch-all for the domain to that Worker.

Sending still needs Resend, or a change to `lib/provider.ts` to use another mail service.

## Rules while setting up

- Never put keys or passwords in the code or in git. They belong in environment variables or the dashboard Setup screen.
- Don't use the person's main domain for agent inboxes unless they ask you to.
- Test with a real email before saying it's done.
