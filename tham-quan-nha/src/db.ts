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
export interface ChatItem { id: number; kind: 'message' | 'log'; name: string; content: string; created_at: string }

/** Newest first. */
export async function listChat(limit = 200): Promise<ChatItem[]> {
  return await (await call(`house_chat?select=id,kind,name,content,created_at&order=created_at.desc,id.desc&limit=${limit}`)).json() as ChatItem[];
}

export async function postChat(item: { kind: ChatItem['kind']; name: string; content: string }) {
  await call('house_chat', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(item) });
}
