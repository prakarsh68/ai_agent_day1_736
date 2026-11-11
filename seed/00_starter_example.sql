-- =====================================================================
-- 00 Starter example: tasks table
-- SRM Agentic AI Hackathon | Run this FIRST in Supabase -> SQL Editor.
-- The example agent tools (listTasks, createTask, completeTask) use it.
-- You can delete this table later when your own tools are ready.
-- =====================================================================

drop table if exists tasks cascade;

create table tasks (
  id          bigint generated always as identity primary key,
  title       text not null,
  due_date    date,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);

insert into tasks (title, due_date, status) values
  ('Set up Supabase project', current_date, 'done'),
  ('Create team Gemini API key', current_date, 'done'),
  ('Deploy first version to Vercel', current_date, 'open'),
  ('Write README for the project', current_date + 1, 'open');

alter table tasks enable row level security;

-- Give the server key (service_role) access, then tell the Supabase API to see the new tables.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
notify pgrst, 'reload schema';
