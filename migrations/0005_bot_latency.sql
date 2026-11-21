create table if not exists nx_bot_latency (
  bot_id text primary key,
  latency_ms double precision not null,
  bot_status text not null,
  reported_at timestamptz not null,
  received_at timestamptz not null default now()
);
