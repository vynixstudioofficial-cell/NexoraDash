create table if not exists nx_sessions (
  id text primary key,
  token_hash text not null unique,
  discord_user_id text not null,
  username text not null,
  global_name text,
  avatar text,
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  guilds_json text not null default '[]',
  csrf_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists nx_sessions_user_idx on nx_sessions (discord_user_id);

create table if not exists nx_oauth_states (
  state_hash text primary key,
  expires_at timestamptz not null
);

create table if not exists nx_guild_settings (
  guild_id text primary key,
  moderator_role_id text not null default '',
  log_channel_id text not null default '',
  application_channel_id text not null default '',
  notes text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists nx_applications (
  id text primary key,
  guild_id text not null,
  external_id text not null,
  applicant_id text not null,
  applicant_name text not null,
  answers_json text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id text,
  reviewer_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, external_id)
);

create index if not exists nx_apps_guild_idx on nx_applications (guild_id, created_at);

create table if not exists nx_audit (
  id text primary key,
  guild_id text,
  actor_id text not null,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists nx_audit_created_idx on nx_audit (created_at);

create table if not exists nx_bot_events (
  id text primary key,
  guild_id text,
  level text not null check (level in ('info', 'warn', 'error')),
  kind text not null check (kind in ('moderation', 'application', 'system')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists nx_events_created_idx on nx_bot_events (created_at);
