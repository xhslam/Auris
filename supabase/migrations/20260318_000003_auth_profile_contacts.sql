alter table profiles
  add column if not exists account_identifier text,
  add column if not exists account_type text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_login_at timestamptz not null default now();

create unique index if not exists profiles_account_identifier_idx
  on profiles(account_identifier)
  where account_identifier is not null;
