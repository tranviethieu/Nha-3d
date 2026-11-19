import { useEffect, useRef, useState } from 'react';
import type { Game } from '../engine/Game';
import { COLOR_SPECS, LIGHT_SPACING, ROOM_DIMS, TV_DEFAULT_URL, fmtM, parseYouTube, type Layout, type ObjOverride, type OpeningOverride, type RoofOverride } from '../engine/layout';

export interface SaveStatus { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string }

interface Props {
  game: Game;
  layout: Layout;
  /** Bumped after every rebuild so sizes are re-read from the game. */
  version: number;
  dirty: boolean;
  dbConfigured: boolean;
  status: SaveStatus;
  onChange: (l: Layout) => void;
  onSave: () => void;
  onRevert: () => void;
  onReset: () => void;
  onClose: () => void;
  /** Name written to the edit log in chat. */
  name: string;
  onName: (n: string) => void;
}

/** Colour picker that previews while dragging (rebuilds are coalesced to one every ~120 ms). */
function ColorField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value), timer = useRef<number>();
  useEffect(() => { setV(value); }, [value]);
  return (
    <span className="color">
      <input type="color" value={v} aria-label="Chọn màu"
        onChange={e => { const c = e.target.value; setV(c); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => onCommit(c), 120); }} />
      <code>{v}</code>
    </span>
  );
}

/** YouTube link for the living-room TV (applied on Enter / blur; checked before it is used). */
function TvLink({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value || TV_DEFAULT_URL);
  useEffect(() => { setV(value || TV_DEFAULT_URL); }, [value]);
  const ok = !!parseYouTube(v);
  const commit = () => { if (ok && v.trim() !== (value || TV_DEFAULT_URL)) onCommit(v.trim()); };
  return (
    <div className={`row ${value ? 'edited' : ''}`}>
      <div className="row-head"><b><i className="ti ti-brand-youtube" aria-hidden="true" /> Tivi phòng khách</b>
        {value && <button className="icon" title="Về video mặc định" onClick={() => onCommit('')}><i className="ti ti-arrow-back-up" /></button>}</div>
      <label className="num"><span>Link YouTube (bật bằng nút "Bật tivi" trong Chi tiết, bấm vào tivi, hoặc E khi đứng trước tivi)</span>
        <input type="url" value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
      </label>
      {!ok && <p className="note" style={{ color: '#c0392b' }}>Link chưa đúng dạng YouTube (youtube.com/watch?v=…, youtu.be/…).</p>}
    </div>
  );
}

/** Number input (meters) that commits on Enter, blur, or after a short pause while typing. */
function NumField({ value, onCommit, label, step = 0.05, disabled }: {
  value: number; onCommit: (v: number) => void; label: string; step?: number; disabled?: boolean;
}) {
  const [txt, setTxt] = useState(fmtM(value));
  const focused = useRef(false), timer = useRef<number>();
  useEffect(() => { if (!focused.current) setTxt(fmtM(value)); }, [value]);
  const commit = (t: string) => {
    window.clearTimeout(timer.current);
    const v = parseFloat(t.replace(',', '.'));
    if (Number.isFinite(v) && Math.abs(v - value) > 1e-4) onCommit(v);
  };
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" inputMode="decimal" step={step} value={txt} disabled={disabled}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; commit(txt); setTxt(fmtM(value)); }}
        onChange={e => { const t = e.target.value; setTxt(t); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => commit(t), 500); }}
        onKeyDown={e => { if (e.key === 'Enter') commit(txt); }} />
    </label>
  );
}

export function Settings(p: Props) {
  const [tab, setTab] = useState<'rooms' | 'openings' | 'roof' | 'colors' | 'lights' | 'objects'>('rooms');
  const [confirming, setConfirming] = useState(false);
  const [openObj, setOpenObj] = useState<string | null>(null);
  const { game, layout } = p;
  void p.version; // re-render trigger
  const rooms = game.roomSizes(), objects = game.objects;

  const setRoom = (room: string, key: 'dw' | 'dd', cur: number, v: number) => {
    const o = { ...(layout.rooms[room] ?? {}) };
    o[key] = Math.round(((o[key] ?? 0) + v - cur) * 1000) / 1000;
    const rooms = { ...layout.rooms, [room]: o };
    if (!o.dw && !o.dd) delete rooms[room];
    p.onChange({ ...layout, rooms });
  };
  const clearRoom = (room: string) => { const rooms = { ...layout.rooms }; delete rooms[room]; p.onChange({ ...layout, rooms }); };
  const setObj = (id: string, patch: ObjOverride) => {
    const o: ObjOverride = { ...(layout.objects[id] ?? {}), ...patch };
    (Object.keys(o) as (keyof ObjOverride)[]).forEach(k => { if (o[k] === undefined) delete o[k]; });
    const objects = { ...layout.objects, [id]: o };
    if (!Object.keys(o).length) delete objects[id];
    p.onChange({ ...layout, objects });
  };
  const setOpening = (id: string, patch: OpeningOverride) => {
    const o: OpeningOverride = { ...(layout.openings[id] ?? {}), ...patch };
    (Object.keys(o) as (keyof OpeningOverride)[]).forEach(k => { if (o[k] === undefined) delete o[k]; });
    const openings = { ...layout.openings, [id]: o };
    if (!Object.keys(o).length) delete openings[id];
    p.onChange({ ...layout, openings });
  };
  const clearOpening = (id: string) => { const openings = { ...layout.openings }; delete openings[id]; p.onChange({ ...layout, openings }); };
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const roomTitle = (room: string) => ROOM_DIMS.find(r => r.room === room)?.title ?? room;
  const { doors, wins } = game.openings();
  /** × hides a door / window (the wall closes up); a hidden one gets "Hiện lại". */
  const hideBtn = (id: string, hidden: boolean) => hidden
    ? <button className="link show-again" onClick={() => setOpening(id, { hidden: undefined })}><i className="ti ti-eye" /> Hiện lại</button>
    : <button className="icon hide-x" title="Ẩn cửa này (tường liền lại)" aria-label="Ẩn" onClick={() => setOpening(id, { hidden: true })}><i className="ti ti-x" /></button>;
  const roofs = game.roofInfo(), deg = (t: number) => Math.round(Math.atan(t) * 180 / Math.PI);
  type RoofKey = 'main' | 'tho' | 'sanh';
  const roofOv = (k: RoofKey): RoofOverride => (k === 'main' ? layout.roof : layout.subRoofs?.[k]) ?? {};
  const putRoof = (k: RoofKey, r: RoofOverride) => {
    (Object.keys(r) as (keyof RoofOverride)[]).forEach(f => { if (r[f] === undefined) delete r[f]; });
    if (k === 'main') p.onChange({ ...layout, roof: r });
    else { const sub = { ...(layout.subRoofs ?? {}), [k]: r }; if (!Object.keys(r).length) delete sub[k]; p.onChange({ ...layout, subRoofs: sub }); }
  };
  const setRoof = (k: RoofKey, patch: RoofOverride) => putRoof(k, { ...roofOv(k), ...patch });
  // limits keep each roof covering what it sits on (main: the house; thờ / sảnh: the porch columns and east wall)
  const ROOF_ROWS: { k: RoofKey; name: string; minL: number; minW: number }[] = [
    { k: 'main', name: 'Mái chính', minL: roofs.main.base.L - 0.7, minW: roofs.main.base.W - 1.4 },
    { k: 'tho', name: 'Mái phòng thờ', minL: roofs.tho.base.L - 0.7, minW: roofs.tho.base.W - 0.35 },
    { k: 'sanh', name: 'Mái sảnh', minL: roofs.sanh.base.L - 0.4, minW: roofs.sanh.base.W - 0.2 },
  ];

  const clearObj = (id: string) => { const objects = { ...layout.objects }; delete objects[id]; p.onChange({ ...layout, objects }); };

  const groups = ROOM_DIMS.map(r => ({ room: r.room, title: r.title, items: objects.filter(o => o.room === r.room) })).filter(g => g.items.length);

  return (
    <aside className="settings panel" onKeyDown={e => e.stopPropagation()}>
      <header>
        <h2><i className="ti ti-settings" aria-hidden="true" /> Cài đặt kích thước</h2>
        <button className="icon" onClick={p.onClose} aria-label="Đóng"><i className="ti ti-x" /></button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'rooms'} className={tab === 'rooms' ? 'on' : ''} onClick={() => setTab('rooms')}>Phòng</button>
        <button role="tab" aria-selected={tab === 'openings'} className={tab === 'openings' ? 'on' : ''} onClick={() => setTab('openings')}>Cửa</button>
        <button role="tab" aria-selected={tab === 'roof'} className={tab === 'roof' ? 'on' : ''} onClick={() => setTab('roof')}>Mái</button>
        <button role="tab" aria-selected={tab === 'colors'} className={tab === 'colors' ? 'on' : ''} onClick={() => setTab('colors')}>Màu</button>
        <button role="tab" aria-selected={tab === 'lights'} className={tab === 'lights' ? 'on' : ''} onClick={() => setTab('lights')}>Đèn</button>
        <button role="tab" aria-selected={tab === 'objects'} className={tab === 'objects' ? 'on' : ''} onClick={() => setTab('objects')}>Vật thể</button>
      </div>

      <div className="settings-body">
        {tab === 'rooms' ? (
          <>
            <p className="note">Đổi ngang / dọc của phòng thì tường, sàn, mái tự co giãn theo; cửa đi, cửa sổ giữ nguyên bề rộng.
              Các phòng cùng hàng hoặc cùng cột cũng giãn theo vì nhà dựng trên một lưới chung.</p>
            {rooms.map(r => (
              <div key={r.room} className={`row ${layout.rooms[r.room] ? 'edited' : ''}`}>
                <div className="row-head">
                  <b>{r.title}</b>
                  <span className="area">{r.area} m²</span>
                  {layout.rooms[r.room] && <button className="icon" title="Về kích thước ban đầu" onClick={() => clearRoom(r.room)}><i className="ti ti-arrow-back-up" /></button>}
                </div>
                <div className="fields">
                  <NumField label="Ngang (m)" value={r.w} onCommit={v => setRoom(r.room, 'dw', r.w, v)} />
                  <NumField label="Dọc (m)" value={r.d} onCommit={v => setRoom(r.room, 'dd', r.d, v)} />
                </div>
              </div>
            ))}
          </>
        ) : tab === 'roof' ? (
          <>
            <p className="note">Dài và rộng tính cả phần mái đua; cao = từ mép mái lên nóc (đổi cao là đổi độ dốc, mặc định 30°).
              Mái chính: mép phía sảnh giữ nguyên, dài thêm về phía Tây, rộng thêm đều hai bên.
              Mái phòng thờ / mái sảnh: đầu cắm vào mái chính giữ nguyên, dài thêm ra phía Đông (phía sân);
              mái thờ rộng thêm về phía sau, mái sảnh rộng thêm về phía lối đi.</p>
            {ROOF_ROWS.map(({ k, name, minL, minW }) => {
              const r = roofs[k], edited = !!Object.keys(roofOv(k)).length;
              return (
                <div key={k} className={`row ${edited ? 'edited' : ''}`}>
                  <div className="row-head">
                    <b>{name}</b><span className="area">dốc {deg(r.t)}°</span>
                    {edited && <button className="icon" title="Về kích thước ban đầu" onClick={() => putRoof(k, {})}><i className="ti ti-arrow-back-up" /></button>}
                  </div>
                  <div className="fields">
                    <NumField label="Dài (m)" value={r.L} onCommit={v => setRoof(k, { l: clamp(v, minL, 30) })} />
                    <NumField label="Rộng (m)" value={r.W} onCommit={v => setRoof(k, { w: clamp(v, minW, 20) })} />
                    <NumField label="Cao (m)" value={r.rise} onCommit={v => setRoof(k, { h: clamp(v, 0.3, 8) })} />
                  </div>
                  <p className="note">Mặc định: {fmtM(r.base.L)} × {fmtM(r.base.W)} m, cao {fmtM(r.base.rise)} m.</p>
                </div>
              );
            })}
          </>
        ) : tab === 'colors' ? (
          <>
            <p className="note">Màu mặc định theo ảnh mẫu: tường trắng, phào trên / phào dưới ghi đậm, mái ngói xanh than.</p>
            {COLOR_SPECS.map(c => {
              const cur = layout.colors?.[c.key] ?? c.def, edited = !!layout.colors?.[c.key];
              const put = (v?: string) => { const colors = { ...(layout.colors ?? {}) }; if (!v || v.toLowerCase() === c.def) delete colors[c.key]; else colors[c.key] = v; p.onChange({ ...layout, colors }); };
              return (
                <div key={c.key} className={`row color-row ${edited ? 'edited' : ''}`}>
                  <div className="row-head">
                    <b>{c.label}</b>
                    <ColorField value={cur} onCommit={v => put(v)} />
                    {edited && <button className="icon" title="Về màu mặc định" onClick={() => put()}><i className="ti ti-arrow-back-up" /></button>}
                  </div>
                  <p className="note">{c.hint}</p>
                </div>
              );
            })}
          </>
        ) : tab === 'lights' ? (
          <>
            <p className="note">Bấm <b>Bật đèn</b> (cạnh nút Ẩn mái) để xem đèn buổi tối. Đèn âm trần dưới mái chính, mái phòng thờ và mái sảnh được xếp đều
              theo khoảng cách dưới đây; đèn hắt tường (2 cột sảnh, 2 bên cửa sổ phòng thờ) và đèn to ở sảnh giữ nguyên.</p>
            <div className={`row ${layout.lights?.spacing ? 'edited' : ''}`}>
              <div className="row-head">
                <b>Đèn dưới mái</b><span className="area">{game.lightCounts().downlights} bóng · {game.lightCounts().sconces} đèn hắt</span>
                {layout.lights?.spacing && <button className="icon" title="Về khoảng cách mặc định" onClick={() => { const l = { ...layout }; delete l.lights; p.onChange(l); }}><i className="ti ti-arrow-back-up" /></button>}
              </div>
              <div className="fields">
                <NumField label="Khoảng cách giữa các đèn (m)" value={layout.lights?.spacing ?? LIGHT_SPACING}
                  onCommit={v => p.onChange({ ...layout, lights: { spacing: clamp(v, 0.5, 5) } })} />
              </div>
              <p className="note">Mặc định {fmtM(LIGHT_SPACING)} m. Nhỏ hơn = nhiều đèn hơn.</p>
            </div>
          </>
        ) : tab === 'openings' ? (
          <>
            <p className="note">Cửa đi giữ nguyên phía bản lề, rộng thêm về phía cánh mở; cửa sổ giữ nguyên tâm. Tường xung quanh tự khoét lại theo.
              Cửa chính: “Rộng” là tổng 2 cánh (hai ô kính cố định hai bên giữ 0,7 m).</p>
            <h3>Cửa đi</h3>
            {doors.map(d => (
              <div key={d.id} className={`row ${layout.openings[d.id] ? 'edited' : ''} ${d.hidden ? 'is-hidden' : ''}`}>
                <div className="row-head">
                  <b>{d.label}</b><span className="area">{roomTitle(d.room)}</span>
                  {hideBtn(d.id, d.hidden)}
                  {layout.openings[d.id] && !d.hidden && <button className="icon" title="Về kích thước ban đầu" onClick={() => clearOpening(d.id)}><i className="ti ti-arrow-back-up" /></button>}
                </div>
                {!d.hidden && <div className="fields">
                  <NumField label="Rộng (m)" value={d.w} onCommit={v => setOpening(d.id, { w: clamp(v, 0.5, d.base.kind === 'main' ? 3 : 1.6) })} />
                  <NumField label="Cao (m)" value={d.h} onCommit={v => setOpening(d.id, { h: clamp(v, 1.8, 2.8) })} />
                </div>}
              </div>
            ))}
            <h3>Cửa sổ</h3>
            {wins.map(w => (
              <div key={w.id} className={`row ${layout.openings[w.id] ? 'edited' : ''} ${w.hidden ? 'is-hidden' : ''}`}>
                <div className="row-head">
                  <b>{w.label}</b><span className="area">{roomTitle(w.room)}</span>
                  {hideBtn(w.id, w.hidden)}
                  {layout.openings[w.id] && !w.hidden && <button className="icon" title="Về kích thước ban đầu" onClick={() => clearOpening(w.id)}><i className="ti ti-arrow-back-up" /></button>}
                </div>
                {!w.hidden && <div className="fields">
                  <NumField label="Rộng (m)" value={w.w} onCommit={v => setOpening(w.id, { w: clamp(v, 0.4, 3) })} />
                  <NumField label="Cao (m)" value={w.h} onCommit={v => setOpening(w.id, { h: clamp(v, 0.3, 3.3 - w.sill) })} />
                  <NumField label="Cao bệ (m)" value={w.sill} onCommit={v => setOpening(w.id, { sill: clamp(v, 0.1, 3.3 - w.h) })} />
                </div>}
              </div>
            ))}
          </>
        ) : (
          <>
            <TvLink value={layout.tvUrl ?? ''} onCommit={v => { const l = { ...layout }; if (!v || v === TV_DEFAULT_URL) delete l.tvUrl; else l.tvUrl = v; p.onChange(l); }} />
            <p className="note">Mỗi vật thể bám theo bức tường gần nhất khi phòng co giãn. Ngang = theo trục X (dọc mặt tiền), Dọc = theo trục Z.</p>
            {groups.map(g => (
              <section key={g.room}>
                <h3>{g.title}</h3>
                {g.items.map(o => {
                  const ov = layout.objects[o.id], open = openObj === o.id;
                  return (
                    <div key={o.id} className={`row ${ov ? 'edited' : ''}`}>
                      <button className="row-head obj" aria-expanded={open} onClick={() => setOpenObj(open ? null : o.id)}>
                        <i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`} aria-hidden="true" />
                        <b>{o.label}</b>
                        <span className="area">{fmtM(o.size[0])} × {fmtM(o.size[1])} × {fmtM(o.size[2])} m</span>
                      </button>
                      {open && (
                        <>
                          <div className="fields">
                            <NumField label="Ngang" value={o.size[0]} disabled={!o.scalable} onCommit={v => setObj(o.id, { w: Math.max(0.05, v) })} />
                            <NumField label="Dọc" value={o.size[1]} disabled={!o.scalable} onCommit={v => setObj(o.id, { d: Math.max(0.05, v) })} />
                            <NumField label="Cao" value={o.size[2]} disabled={!o.scalable} onCommit={v => setObj(o.id, { h: Math.max(0.05, v) })} />
                          </div>
                          <div className="fields">
                            <NumField label="Dịch X" value={ov?.dx ?? 0} onCommit={v => setObj(o.id, { dx: v || undefined })} />
                            <NumField label="Dịch Z" value={ov?.dz ?? 0} onCommit={v => setObj(o.id, { dz: v || undefined })} />
                            {ov ? <button className="link" onClick={() => clearObj(o.id)}><i className="ti ti-arrow-back-up" /> Ban đầu</button> : <span />}
                          </div>
                          {!o.scalable && <p className="note">Có cánh mở nên giữ nguyên kích thước, chỉ dịch vị trí được.</p>}
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        )}
      </div>

      <footer>
        <label className="who"><span>Người sửa</span>
          <input value={p.name} maxLength={60} placeholder="Tên (ghi vào lịch sử sửa)" onChange={e => p.onName(e.target.value)} />
        </label>
        <p className={`status ${p.status.kind}`} role="status">
          {!p.dbConfigured ? 'Chưa cấu hình database: chỉ xem trước, không lưu được.'
            : p.status.kind !== 'idle' ? p.status.text : p.dirty ? 'Có thay đổi chưa lưu.' : 'Đã lưu, không có thay đổi.'}
        </p>
        <div className="actions">
          <button className="primary" disabled={!p.dbConfigured || !p.dirty || p.status.kind === 'busy'} onClick={p.onSave}>
            <i className="ti ti-device-floppy" /> Lưu
          </button>
          <button disabled={!p.dirty} onClick={p.onRevert}><i className="ti ti-arrow-back-up" /> Huỷ thay đổi</button>
          <span className="right">
          <button className={`flip ${layout.mirror ? 'on' : ''}`} aria-pressed={!!layout.mirror}
            title="Lật nhà trước – sau: hiên sang bên phải, phòng thờ sang bên trái (bấm lần nữa để về như cũ)"
            onClick={() => { const l = { ...layout }; if (l.mirror) delete l.mirror; else l.mirror = true; p.onChange(l); }}>
            <i className="ti ti-arrows-exchange" /> Đảo ngược
          </button>
          <button className="danger" onClick={() => setConfirming(true)}><i className="ti ti-restore" /> Reset mặc định</button>
          </span>
        </div>
      </footer>

      {confirming && (
        <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-box">
            <h3 id="confirm-title">Quay lại thiết kế mặc định?</h3>
            <p>Mọi kích thước phòng và vật thể đã chỉnh sẽ trở về như ban đầu
              {p.dbConfigured ? ', và bản đã lưu trong database cũng bị xoá' : ''}. Không thể hoàn tác.</p>
            <div className="actions">
              <button autoFocus onClick={() => setConfirming(false)}>Huỷ</button>
              <button className="danger solid" onClick={() => { setConfirming(false); p.onReset(); }}>Reset về mặc định</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
