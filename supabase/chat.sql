-- Chat + edit log for the 3D tour (tham-quan-nha). Run once in Supabase → SQL Editor (after schema.sql).
-- kind = 'message' (typed by a visitor) or 'log' (written automatically when the design is saved / reset).
create table if not exists public.house_chat (
  id bigint generated always as identity primary key,
  kind text not null default 'message' check (kind in ('message', 'log')),
  name text not null check (char_length(name) between 1 and 60),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists house_chat_created_at on public.house_chat (created_at desc);

alter table public.house_chat enable row level security;

-- Anyone may read and post; nobody can edit or delete (so the edit log stays as written).
drop policy if exists "house_chat read" on public.house_chat;
drop policy if exists "house_chat insert" on public.house_chat;
create policy "house_chat read"   on public.house_chat for select to anon, authenticated using (true);
create policy "house_chat insert" on public.house_chat for insert to anon, authenticated with check (true);

grant select, insert on public.house_chat to anon, authenticated;
