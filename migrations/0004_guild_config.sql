alter table nx_guild_settings add column if not exists config_json text not null default '{}';
