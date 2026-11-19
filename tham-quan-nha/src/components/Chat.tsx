import { useEffect, useRef, useState } from 'react';
import { dbConfigured, listChat, postChat, type ChatItem } from '../db';

interface Props {
  name: string;
  onName: (n: string) => void;
  /** Bumped by the parent after it writes a log entry, to refresh at once. */
  refreshKey: number;
  onClose: () => void;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
});

/** Chat: name + message on top, messages and the automatic edit log (newest first) below. */
export function Chat({ name, onName, refreshKey, onClose }: Props) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'message' | 'log'>('all');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const alive = useRef(true);

  const load = () => listChat().then(r => { if (alive.current) { setItems(r); setError(''); } })
    .catch((e: Error) => { if (alive.current) setError(e.message); });
  useEffect(() => {
    alive.current = true;
    if (!dbConfigured) return;
    load();
    const t = window.setInterval(load, 8000); // poll for other people's messages
    return () => { alive.current = false; window.clearInterval(t); };
  }, [refreshKey]);

  const send = async () => {
    const n = name.trim(), c = text.trim();
    if (!n) { setError('Nhập tên của bạn trước khi gửi.'); return; }
    if (!c) return;
    setSending(true);
    try { await postChat({ kind: 'message', name: n.slice(0, 60), content: c.slice(0, 4000) }); setText(''); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };

  const shown = items.filter(i => filter === 'all' || i.kind === filter);
  return (
    <aside className="chat panel" onKeyDown={e => e.stopPropagation()}>
      <header>
        <h2><i className="ti ti-messages" aria-hidden="true" /> Trao đổi &amp; lịch sử sửa</h2>
        <button className="icon" onClick={onClose} aria-label="Đóng"><i className="ti ti-x" /></button>
      </header>
      <form className="chat-form" onSubmit={e => { e.preventDefault(); send(); }}>
        <input className="chat-name" placeholder="Tên của bạn" value={name} maxLength={60} onChange={e => onName(e.target.value)} aria-label="Tên" />
        <textarea placeholder="Nội dung… (Ctrl/⌘ + Enter để gửi)" value={text} maxLength={4000} rows={3} aria-label="Nội dung"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        <div className="chat-row">
          <span className="err" role="status">{!dbConfigured ? 'Chưa cấu hình database.' : error}</span>
          <button className="primary" disabled={!dbConfigured || sending || !text.trim()}><i className="ti ti-send" /> Gửi</button>
        </div>
      </form>
      <div className="tabs" role="tablist">
        {([['all', 'Tất cả'], ['message', 'Tin nhắn'], ['log', 'Lịch sử sửa']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <ul className="chat-list">
        {shown.length === 0 && <li className="empty">Chưa có gì.</li>}
        {shown.map(i => (
          <li key={i.id} className={i.kind}>
            {i.kind === 'log' && <span className="tag"><i className="ti ti-history" aria-hidden="true" /> Lịch sử sửa</span>}
            <div className="content">{i.content}</div>
            <div className="meta"><b>{i.name}</b> · <time dateTime={i.created_at}>{fmtTime(i.created_at)}</time></div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
