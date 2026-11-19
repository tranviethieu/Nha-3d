// Saved layout in Supabase (table public.house_layouts, see ../../supabase/schema.sql), through the REST API.
// Only the URL and the PUBLISHABLE key are used here: they are shipped to every visitor's browser.
import { normalizeLayout, type Layout } from './engine/layout';

const URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ROW = 'main';

export const dbConfigured = !!(URL && KEY);

async function call(path: string, init: RequestInit = {}) {
  if (!dbConfigured) throw new Error('Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY!, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
    if (body.code === 'PGRST205') {
      const table = /house_chat/.test(path) ? 'house_chat' : 'house_layouts', file = table === 'house_chat' ? 'chat.sql' : 'schema.sql';
      throw new Error(`Chưa có bảng ${table}: chạy file supabase/${file} trong Supabase → SQL Editor.`);
    }
    throw new Error(body.message || `Lỗi ${res.status}`);
  }
  return res;
}

/** The saved layout, or null when nothing has been saved yet. */
export async function loadLayout(): Promise<{ layout: Layout; updatedAt: string } | null> {
  const rows = await (await call(`house_layouts?id=eq.${ROW}&select=data,updated_at`)).json() as { data: Layout; updated_at: string }[];
  if (!rows.length) return null;
  return { layout: normalizeLayout(rows[0].data), updatedAt: rows[0].updated_at };
}

export async function saveLayout(layout: Layout) {
  await call('house_layouts?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: ROW, data: layout, updated_at: new Date().toISOString() }),
  });
}

/** Back to the default design: remove the saved row. */
export async function deleteLayout() {
  await call(`house_layouts?id=eq.${ROW}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ---------------- chat + edit log (table public.house_chat, see ../../supabase/chat.sql) ----------------
// Pictures go to the public Storage bucket 'chat-images' (../../supabase/chat-images.sql); the row keeps the URL.
export interface ChatItem { id: number; kind: 'message' | 'log'; name: string; content: string; created_at: string; image_url?: string | null }

/** Newest first. Works before chat-images.sql has been run (no image_url column yet): falls back for that call
 *  only, so pictures show up as soon as the column exists, without reloading the page. */
export async function listChat(limit = 200): Promise<ChatItem[]> {
  const q = (cols: string) => call(`house_chat?select=${cols}&order=created_at.desc,id.desc&limit=${limit}`);
  try { return await (await q('id,kind,name,content,created_at,image_url')).json() as ChatItem[]; }
  catch (e) { if (!/image_url/.test((e as Error).message)) throw e; }
  return await (await q('id,kind,name,content,created_at')).json() as ChatItem[];
}

export async function postChat(item: { kind: ChatItem['kind']; name: string; content: string; image_url?: string }) {
  await call('house_chat', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(item) });
}

/** Upload a picture to the chat bucket; returns its public URL. */
export async function uploadChatImage(file: Blob, ext: string): Promise<string> {
  if (!dbConfigured) throw new Error('Chưa cấu hình Supabase.');
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${URL}/storage/v1/object/chat-images/${path}`, {
    method: 'POST', headers: { apikey: KEY!, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    if (/bucket not found/i.test(body.message ?? '') || /bucket/i.test(body.error ?? ''))
      throw new Error('Chưa có nơi lưu ảnh: chạy file supabase/chat-images.sql trong Supabase → SQL Editor.');
    throw new Error(body.message || `Lỗi tải ảnh (${res.status})`);
  }
  return `${URL}/storage/v1/object/public/chat-images/${path}`;
}
