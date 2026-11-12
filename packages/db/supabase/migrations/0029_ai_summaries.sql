-- S6b PR 4: a daily briefing, a member activity summary, and questions about
-- your own work, each behind its own switch (off).
--
-- No tables: nothing these features write is stored. Our code selects the
-- records under the person's own row-level security and sends only those;
-- the answer is shown once. The usage log (ai_runs) keeps metadata only.

insert into public.feature_flags (key, description) values
  ('ai_staff_daily_briefing', 'VA assistant: on the Today page, a briefing of what is due across your transactions, leads waiting for a reply and messages waiting, written from your own records.'),
  ('ai_staff_member_summary', 'VA assistant: on a member''s page, a summary of their recent activity (saved homes, searches, tour requests, homes they''re pursuing, their last portal messages) and suggested next steps.'),
  ('ai_staff_data_questions', 'VA assistant: plain questions about your own work in the console (transactions, tasks, leads, messages waiting), answered from your records with links.')
on conflict (key) do nothing;
