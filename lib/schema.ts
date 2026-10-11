// The whole database. Applied automatically on first use (see db.ts); every statement is safe to run again.
export const SCHEMA = `
create table if not exists settings (key text primary key, value text not null);

create table if not exists api_keys (
  id serial primary key, name text not null default '', prefix text not null, hash text unique not null,
  created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);

create table if not exists inboxes (
  id text primary key,                                   -- inb_...
  address text unique not null,                          -- support-bot@agents.example.com
  display_name text not null default '',
  client_id text unique,                                 -- optional caller-chosen key: the same create call twice returns the same inbox
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists threads (
  id text primary key, inbox_id text not null references inboxes(id) on delete cascade,
  subject text not null default '', last_message_at timestamptz not null default now(), message_count int not null default 0
);
create index if not exists threads_inbox on threads(inbox_id, last_message_at desc);

create table if not exists messages (
  id text primary key,                                   -- msg_...
  inbox_id text not null references inboxes(id) on delete cascade,
  thread_id text not null references threads(id) on delete cascade,
  direction text not null,                               -- in | out
  message_id text,                                       -- the RFC 5322 Message-ID
  in_reply_to text, refs text[] not null default '{}',
  from_addr text not null default '', to_addrs text[] not null default '{}', cc_addrs text[] not null default '{}',
  reply_to text, subject text not null default '', text_body text not null default '', html_body text,
  labels text[] not null default '{}', read boolean not null default false,
  provider_id text, status text not null default 'received', -- received | sending | sent | failed | stored (MAIL_PROVIDER=none)
  error text, created_at timestamptz not null default now()
);
create index if not exists messages_inbox on messages(inbox_id, created_at desc);
create index if not exists messages_thread on messages(thread_id, created_at);
create index if not exists messages_mid on messages(inbox_id, message_id);
create unique index if not exists messages_provider on messages(inbox_id, provider_id) where provider_id is not null;

create table if not exists attachments (
  id text primary key, message_id text not null references messages(id) on delete cascade,
  filename text not null default 'file', content_type text not null default 'application/octet-stream',
  bytes int not null default 0, data bytea not null
);
create index if not exists attachments_msg on attachments(message_id);

create table if not exists webhooks (
  id text primary key, url text not null, secret text not null, events text[] not null default '{message.received}',
  inbox_id text references inboxes(id) on delete cascade, -- null = every inbox
  created_at timestamptz not null default now(), disabled_at timestamptz
);
create table if not exists webhook_deliveries (
  id bigserial primary key, webhook_id text not null references webhooks(id) on delete cascade,
  event text not null, payload jsonb not null, status int, attempts int not null default 0, error text,
  created_at timestamptz not null default now(), delivered_at timestamptz
);
create index if not exists deliveries_hook on webhook_deliveries(webhook_id, created_at desc);
`;
