-- Images in the chat (tham-quan-nha). Run once in Supabase → SQL Editor, after chat.sql.

-- 1. A public Storage bucket for the pictures (max 5 MB each, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may upload into this bucket and read from it (same openness as the chat); nobody can overwrite or delete.
drop policy if exists "chat images read" on storage.objects;
drop policy if exists "chat images upload" on storage.objects;
create policy "chat images read"   on storage.objects for select to anon, authenticated using (bucket_id = 'chat-images');
create policy "chat images upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'chat-images');

-- 2. The chat row keeps the picture's public URL; a message may be a picture with no text.
alter table public.house_chat add column if not exists image_url text check (image_url is null or char_length(image_url) <= 1000);
alter table public.house_chat drop constraint if exists house_chat_content_check;
alter table public.house_chat add constraint house_chat_content_check
  check (char_length(content) <= 8000 and (char_length(content) >= 1 or image_url is not null));
