-- Rollback for 20260318_000002_rls_and_storage_policies.sql

BEGIN;

-- Drop storage policies
DROP POLICY IF EXISTS "Users can delete own audio objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own audio objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own audio objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own audio objects" ON storage.objects;

-- Drop table policies
DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.templates;

DROP POLICY IF EXISTS "Users can delete own word tokens" ON public.word_tokens;
DROP POLICY IF EXISTS "Users can update own word tokens" ON public.word_tokens;
DROP POLICY IF EXISTS "Users can insert own word tokens" ON public.word_tokens;
DROP POLICY IF EXISTS "Users can read own word tokens" ON public.word_tokens;

DROP POLICY IF EXISTS "Users can delete own sentences" ON public.sentences;
DROP POLICY IF EXISTS "Users can update own sentences" ON public.sentences;
DROP POLICY IF EXISTS "Users can insert own sentences" ON public.sentences;
DROP POLICY IF EXISTS "Users can read own sentences" ON public.sentences;

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can read own sessions" ON public.sessions;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

-- Disable RLS
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentences DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Drop helper functions
DROP FUNCTION IF EXISTS public.is_current_user_audio_owner(text);
DROP FUNCTION IF EXISTS public.is_current_user_sentence_owner(uuid);
DROP FUNCTION IF EXISTS public.is_current_user_session_owner(uuid);
DROP FUNCTION IF EXISTS public.try_parse_uuid(text);

COMMIT;
