import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dbConfigured, listChat, postChat, uploadChatImage, type ChatItem } from '../db';

/** Shrink a picture to at most `max` px on its long side (JPEG, or PNG if it has transparency-friendly type). */
async function shrink(file: File, max = 1600): Promise<{ blob: Blob; ext: string }> {
  if (file.type === 'image/gif') return { blob: file, ext: 'gif' }; // keep animations
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const png = file.type === 'image/png' && file.size < 600_000;
  const blob = await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('Không đọc được ảnh'))), png ? 'image/png' : 'image/jpeg', 0.86));
  return { blob, ext: png ? 'png' : 'jpg' };
}

/** Full-screen picture: fits the screen; click toggles actual size (scroll / drag to look around); Esc or × closes. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // portal to <body>: the chat panel's backdrop-filter would otherwise trap a position:fixed overlay inside it
  return createPortal(
    <div className={`lightbox ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label="Ảnh phóng to" onClick={onClose}>
      <img src={src} alt="" onClick={e => { e.stopPropagation(); setFull(f => !f); }} title={full ? 'Bấm để thu vừa màn hình' : 'Bấm để xem kích thước gốc'} />
      <div className="lb-tools" onClick={e => e.stopPropagation()}>
        <a href={src} target="_blank" rel="noreferrer" title="Mở ảnh gốc ở thẻ mới"><i className="ti ti-external-link" /></a>
        <button onClick={onClose} aria-label="Đóng"><i className="ti ti-x" /></button>
      </div>
    </div>,
    document.body,
  );
}

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
  const [pic, setPic] = useState<{ file: File; preview: string } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Chỉ gửi được file ảnh.'); return; }
    if (f.size > 20 * 1024 * 1024) { setError('Ảnh quá lớn (tối đa 20 MB trước khi thu nhỏ).'); return; }
    setError(''); setPic(old => { if (old) URL.revokeObjectURL(old.preview); return { file: f, preview: URL.createObjectURL(f) }; });
  };
  const dropPic = () => { setPic(old => { if (old) URL.revokeObjectURL(old.preview); return null; }); if (fileRef.current) fileRef.current.value = ''; };
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
    if (!c && !pic) return;
    setSending(true);
    try {
      let image_url: string | undefined;
      if (pic) { const { blob, ext } = await shrink(pic.file); image_url = await uploadChatImage(blob, ext); }
      await postChat({ kind: 'message', name: n.slice(0, 60), content: c.slice(0, 4000), ...(image_url ? { image_url } : {}) });
      setText(''); dropPic(); await load();
    }
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
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
          onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); pick(f); } }} />
        {pic && (
          <div className="chat-pic">
            <img src={pic.preview} alt="Ảnh sẽ gửi" onClick={() => setZoom(pic.preview)} />
            <button type="button" className="icon" onClick={dropPic} aria-label="Bỏ ảnh"><i className="ti ti-x" /></button>
          </div>
        )}
        <div className="chat-row">
          <span className="err" role="status">{!dbConfigured ? 'Chưa cấu hình database.' : error}</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
          <button type="button" className="icon attach" title="Gửi ảnh (hoặc dán ảnh vào ô nội dung)" aria-label="Đính kèm ảnh"
            disabled={!dbConfigured || sending} onClick={() => fileRef.current?.click()}><i className="ti ti-photo-plus" /></button>
          <button className="primary" disabled={!dbConfigured || sending || (!text.trim() && !pic)}>
            <i className={`ti ${sending ? 'ti-loader-2 spin' : 'ti-send'}`} /> {sending && pic ? 'Đang gửi ảnh…' : 'Gửi'}
          </button>
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
            {i.content && <div className="content">{i.content}</div>}
            {i.image_url && <button className="chat-img" onClick={() => setZoom(i.image_url!)} aria-label="Phóng to ảnh"><img src={i.image_url} alt="" loading="lazy" /></button>}
            <div className="meta"><b>{i.name}</b> · <time dateTime={i.created_at}>{fmtTime(i.created_at)}</time></div>
          </li>
        ))}
      </ul>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </aside>
  );
}
