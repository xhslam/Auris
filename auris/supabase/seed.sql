insert into templates (id, title, description, text, difficulty)
values
  (
    gen_random_uuid(),
    'TED Shadowing Pack',
    '适合练节奏感和重音切换。',
    'Learning a language is not only about vocabulary, but also about rhythm.',
    'medium'
  ),
  (
    gen_random_uuid(),
    'Daily News Warm-up',
    '适合晨间 2 分钟快速开练。',
    'Today we will focus on clarity, confidence, and speaking with better pacing.',
    'easy'
  )
on conflict do nothing;
