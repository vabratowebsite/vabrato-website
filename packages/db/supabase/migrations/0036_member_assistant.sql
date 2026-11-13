-- S5b PR 1: Ask Vabrato, the member assistant (owner answers 2026-11-13).
--
-- Two member features, each behind its own switch (off):
-- - explain: explains a real-estate term in plain language. Not legal or tax
--   advice; the member can pass the question to their agent.
-- - search: turns one sentence into the website's normal search filters
--   (city, price, beds, baths, home type, sort). Our code checks the filters;
--   the member runs or saves the search themselves.
--
-- Nothing else is stored: conversations aren't kept (owner decision
-- 2026-11-13). ai_begin (0026) already lets buyers and sellers run member_*
-- features within the member daily limits, and ai_runs keeps metadata only.

insert into public.feature_flags (key, description) values
  ('ai_member_explain', 'Ask Vabrato: explains a real-estate term in plain language for a member. Not legal or tax advice; nothing is kept.'),
  ('ai_member_search', 'Ask Vabrato: turns a member''s sentence into the website''s search filters (city, price, beds, baths, home type). The member runs or saves the search; nothing is kept.')
on conflict (key) do nothing;
