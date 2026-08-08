create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.is_current_user_session_owner(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions session_record
    where session_record.id = target_session_id
      and session_record.user_id = auth.uid()
  );
$$;

create or replace function public.is_current_user_sentence_owner(target_sentence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sentences sentence_record
    join public.sessions session_record
      on session_record.id = sentence_record.session_id
    where sentence_record.id = target_sentence_id
      and session_record.user_id = auth.uid()
  );
$$;

create or replace function public.is_current_user_audio_owner(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    split_part(object_name, '/', 1) = 'sessions'
    and exists (
      select 1
      from public.sessions session_record
      where session_record.id = public.try_parse_uuid(split_part(object_name, '/', 2))
        and session_record.user_id = auth.uid()
    );
$$;

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.sentences enable row level security;
alter table public.word_tokens enable row level security;
alter table public.templates enable row level security;
alter table storage.objects enable row level security;

alter table public.profiles force row level security;
alter table public.sessions force row level security;
alter table public.sentences force row level security;
alter table public.word_tokens force row level security;
alter table public.templates force row level security;
alter table storage.objects force row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can read own sessions" on public.sessions;
drop policy if exists "Users can insert own sessions" on public.sessions;
drop policy if exists "Users can update own sessions" on public.sessions;
drop policy if exists "Users can delete own sessions" on public.sessions;

create policy "Users can read own sessions"
on public.sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own sessions"
on public.sessions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own sessions"
on public.sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own sessions"
on public.sessions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own sentences" on public.sentences;
drop policy if exists "Users can insert own sentences" on public.sentences;
drop policy if exists "Users can update own sentences" on public.sentences;
drop policy if exists "Users can delete own sentences" on public.sentences;

create policy "Users can read own sentences"
on public.sentences
for select
to authenticated
using (public.is_current_user_session_owner(session_id));

create policy "Users can insert own sentences"
on public.sentences
for insert
to authenticated
with check (public.is_current_user_session_owner(session_id));

create policy "Users can update own sentences"
on public.sentences
for update
to authenticated
using (public.is_current_user_session_owner(session_id))
with check (public.is_current_user_session_owner(session_id));

create policy "Users can delete own sentences"
on public.sentences
for delete
to authenticated
using (public.is_current_user_session_owner(session_id));

drop policy if exists "Users can read own word tokens" on public.word_tokens;
drop policy if exists "Users can insert own word tokens" on public.word_tokens;
drop policy if exists "Users can update own word tokens" on public.word_tokens;
drop policy if exists "Users can delete own word tokens" on public.word_tokens;

create policy "Users can read own word tokens"
on public.word_tokens
for select
to authenticated
using (public.is_current_user_sentence_owner(sentence_id));

create policy "Users can insert own word tokens"
on public.word_tokens
for insert
to authenticated
with check (public.is_current_user_sentence_owner(sentence_id));

create policy "Users can update own word tokens"
on public.word_tokens
for update
to authenticated
using (public.is_current_user_sentence_owner(sentence_id))
with check (public.is_current_user_sentence_owner(sentence_id));

create policy "Users can delete own word tokens"
on public.word_tokens
for delete
to authenticated
using (public.is_current_user_sentence_owner(sentence_id));

drop policy if exists "Authenticated users can read templates" on public.templates;

create policy "Authenticated users can read templates"
on public.templates
for select
to authenticated
using (true);

drop policy if exists "Users can read own audio objects" on storage.objects;
drop policy if exists "Users can upload own audio objects" on storage.objects;
drop policy if exists "Users can update own audio objects" on storage.objects;
drop policy if exists "Users can delete own audio objects" on storage.objects;

create policy "Users can read own audio objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'shadowing-audio'
  and public.is_current_user_audio_owner(name)
);

create policy "Users can upload own audio objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shadowing-audio'
  and public.is_current_user_audio_owner(name)
);

create policy "Users can update own audio objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shadowing-audio'
  and public.is_current_user_audio_owner(name)
)
with check (
  bucket_id = 'shadowing-audio'
  and public.is_current_user_audio_owner(name)
);

create policy "Users can delete own audio objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shadowing-audio'
  and public.is_current_user_audio_owner(name)
);
