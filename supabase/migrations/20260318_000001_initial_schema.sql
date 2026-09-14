create table if not exists profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null,
  source_type text not null,
  title text not null,
  original_text text not null,
  normalized_text text not null,
  status text not null,
  voice_id text not null,
  speed_default numeric not null default 1,
  audio_url text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sentences (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  order_index integer not null,
  text text not null,
  start_ms integer not null,
  end_ms integer not null
);

create table if not exists word_tokens (
  id uuid primary key,
  sentence_id uuid not null references sentences(id) on delete cascade,
  order_index integer not null,
  text text not null,
  start_ms integer not null,
  end_ms integer not null
);

create table if not exists templates (
  id uuid primary key,
  title text not null,
  description text not null,
  text text not null,
  difficulty text not null
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sentences_session_id_idx on sentences(session_id);
create index if not exists word_tokens_sentence_id_idx on word_tokens(sentence_id);

insert into storage.buckets (id, name, public)
values ('shadowing-audio', 'shadowing-audio', false)
on conflict (id) do nothing;
