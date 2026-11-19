-- Saved house layout for the 3D tour (tham-quan-nha). Run once in Supabase → SQL Editor.
-- One row per design; the app uses id = 'main'.
create table if not exists public.house_layouts (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.house_layouts enable row level security;

-- The owner chose: anyone who opens the site may read, save and reset the design.
drop policy if exists "house_layouts read" on public.house_layouts;
drop policy if exists "house_layouts insert" on public.house_layouts;
drop policy if exists "house_layouts update" on public.house_layouts;
drop policy if exists "house_layouts delete" on public.house_layouts;
create policy "house_layouts read"   on public.house_layouts for select to anon, authenticated using (true);
create policy "house_layouts insert" on public.house_layouts for insert to anon, authenticated with check (true);
create policy "house_layouts update" on public.house_layouts for update to anon, authenticated using (true) with check (true);
create policy "house_layouts delete" on public.house_layouts for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.house_layouts to anon, authenticated;

-- Chat + edit log: see chat.sql (same statements).
