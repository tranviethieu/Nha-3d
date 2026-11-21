import { useEffect, useRef, useState } from 'react';
import { Game, type HudState, type RoofMode } from './engine/Game';
import { TouchControls } from './components/TouchControls';
import { Toast } from './components/Toast';
import { Settings, type SaveStatus } from './components/Settings';
import { emptyLayout, type Layout } from './engine/layout';
import { PIPE_STYLE } from './engine/plumbing';
import { dbConfigured, deleteLayout, loadLayout, postChat, saveLayout } from './db';
import { Chat } from './components/Chat';
import { describeChanges, logText } from './engine/changes';

const NAME_KEY = 'tqn-name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

const ROOF_LABEL: Record<RoofMode, string> = { auto: 'Mái: tự động', on: 'Mái: luôn hiện', off: 'Mái: luôn ẩn' };
const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export default function App() {
  const viewRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  // editable layout: the draft shown in 3D, and the JSON of what is saved in the database
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "Chi tiết" popover in the overview bar; closes on a click outside it or Escape
  const [detailsOpen, setDetailsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!detailsOpen) return;
    const down = (e: PointerEvent) => { if (!barRef.current?.contains(e.target as Node)) setDetailsOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailsOpen(false); };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [detailsOpen]);
  const [layout, setLayoutState] = useState<Layout>(emptyLayout());
  const [savedKey, setSavedKey] = useState(JSON.stringify(emptyLayout()));
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle', text: '' });
  const [version, setVersion] = useState(0);
  const dirty = JSON.stringify(layout) !== savedKey;
  // chat + edit log
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRefresh, setChatRefresh] = useState(0);
  const [userName, setUserNameState] = useState(readName);
  const setUserName = (n: string) => { setUserNameState(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } };
  /** Write the edit log entry for a save / reset into the chat. */
  const logEdit = async (action: 'save' | 'reset', from: Layout, to: Layout) => {
    const g = gameRef.current; if (!g) return '';
    const ch = describeChanges(from, to, g.objects);
    if (!ch.edited.length) return '';
    try { await postChat({ kind: 'log', name: userName.trim().slice(0, 60) || 'Không rõ tên', content: logText(action, ch).slice(0, 8000) }); setChatRefresh(k => k + 1); return ''; }
    catch (e) { return ` (Chưa ghi được lịch sử sửa vào chat: ${(e as Error).message})`; }
  };
  const applyLayout = (l: Layout) => { gameRef.current?.setLayout(l); setLayoutState(l); setVersion(v => v + 1); };

  useEffect(() => {
    const game = new Game(viewRef.current!, mapRef.current!, setHud, text => setToast({ text, id: Date.now() }));
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game; // for debugging in the console
    if (dbConfigured) {
      setStatus({ kind: 'busy', text: 'Đang tải thiết kế đã lưu…' });
      loadLayout().then(r => {
        if (gameRef.current !== game) return;
        if (r) { game.setLayout(r.layout); setLayoutState(r.layout); setSavedKey(JSON.stringify(r.layout)); setVersion(v => v + 1); }
        setStatus({ kind: 'idle', text: '' });
      }).catch((e: Error) => setStatus({ kind: 'error', text: e.message }));
    }
    return () => { game.dispose(); gameRef.current = null; };
  }, []);

  const g = () => gameRef.current;
  const touring = hud?.mode === 'tour';
  // run an action, then drop focus so Space/E don't re-trigger the button
  const click = (fn: (g: Game) => void) => (e: React.MouseEvent<HTMLButtonElement>) => { const x = g(); if (x) fn(x); e.currentTarget.blur(); };

  const save = async () => {
    setStatus({ kind: 'busy', text: 'Đang lưu…' });
    try {
      const prev = JSON.parse(savedKey) as Layout;
      await saveLayout(layout); setSavedKey(JSON.stringify(layout));
      const warn = await logEdit('save', prev, layout);
      setStatus({ kind: warn ? 'error' : 'ok', text: `Đã lưu lúc ${new Date().toLocaleTimeString('vi-VN')}.${warn || ' Đã ghi vào lịch sử sửa.'}` });
    }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
  };
  const revert = () => { applyLayout(JSON.parse(savedKey) as Layout); setStatus({ kind: 'idle', text: '' }); };
  const reset = async () => {
    const prev = JSON.parse(savedKey) as Layout;
    applyLayout(emptyLayout());
    if (!dbConfigured) { setSavedKey(JSON.stringify(emptyLayout())); return; }
    setStatus({ kind: 'busy', text: 'Đang xoá bản đã lưu…' });
    try {
      await deleteLayout(); setSavedKey(JSON.stringify(emptyLayout()));
      const warn = await logEdit('reset', prev, emptyLayout());
      setStatus({ kind: warn ? 'error' : 'ok', text: 'Đã quay về thiết kế mặc định.' + warn });
    }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
  };

  // "Xuất PDF": the whole design as A3 drawing sheets (loaded on demand)
  const [pdfBusy, setPdfBusy] = useState(false);
  const exportPdf = async (x: Game) => {
    if (pdfBusy) return; setPdfBusy(true);
    const say = (text: string) => setToast({ text, id: Date.now() });
    try { const { exportDesignPdf } = await import('./engine/exportPdf'); await exportDesignPdf(x, say); say('Đã xuất file PDF hồ sơ thiết kế'); }
    catch (e) { say('Không xuất được PDF: ' + (e as Error).message); }
    finally { setPdfBusy(false); }
  };

  // overview bar: the main actions, the rest under "Chi tiết"
  const overviewButtons = [
    { icon: 'ti-settings', label: 'Cài đặt', run: () => setSettingsOpen(o => !o) },
    { icon: 'ti-messages', label: 'Trao đổi', run: () => setChatOpen(o => !o) },
    { icon: 'ti-home', label: hud?.roofOn ? 'Ẩn mái' : 'Hiện mái', run: (x: Game) => x.toggleRoof() },
    { icon: hud?.lightsOn ? 'ti-bulb-off' : 'ti-bulb', label: hud?.lightsOn ? 'Tắt đèn' : 'Bật đèn', run: (x: Game) => x.toggleLights() },
    { icon: 'ti-building', label: hud?.structure ? 'Ẩn kết cấu' : 'Kết cấu', run: (x: Game) => x.toggleStructure() },
    { icon: 'ti-droplet', label: hud?.pipes ? 'Ẩn ống nước' : 'Ống nước', run: (x: Game) => x.togglePipes() },
    { icon: 'ti-cube', label: 'Phối cảnh', run: (x: Game) => x.viewPerspective() },
    { icon: 'ti-door', label: hud?.anyDoorClosed === false ? 'Đóng tất cả cửa' : 'Mở tất cả cửa', run: (x: Game) => x.toggleAllDoors() },
    { icon: 'ti-ruler-measure', label: hud?.dimsOn ? 'Ẩn kích thước' : 'Hiện kích thước', run: (x: Game) => x.toggleDims() },
    { icon: 'ti-file-type-pdf', label: pdfBusy ? 'Đang xuất…' : 'Xuất PDF', run: (x: Game) => { void exportPdf(x); } },
  ];
  const detailButtons = [
    { icon: 'ti-bath', label: 'Xem nhà vệ sinh', run: (x: Game) => x.viewWC() },
    { icon: 'ti-droplet', label: 'Xem lavabo', run: (x: Game) => x.viewLavabo() },
    { icon: 'ti-tools-kitchen-2', label: 'Xem bếp', run: (x: Game) => x.viewKitchen() },
    { icon: 'ti-device-tv', label: 'Xem vách tivi', run: (x: Game) => x.viewTV() },
    { icon: hud?.tvOn ? 'ti-device-tv-off' : 'ti-brand-youtube', label: hud?.tvOn ? 'Tắt tivi' : 'Bật tivi (YouTube)', run: (x: Game) => x.toggleTv() },
    { icon: 'ti-window', label: hud?.anyWindowClosed === false ? 'Đóng cửa sổ' : 'Mở cửa sổ', run: (x: Game) => x.toggleAllWindows() },
    { icon: 'ti-box', label: hud?.anyWardrobeClosed === false ? 'Đóng các tủ' : 'Mở các tủ', run: (x: Game) => x.toggleAllWardrobes() },
    { icon: 'ti-arrows-vertical', label: hud?.rackDown ? 'Nâng giá bát' : 'Hạ giá bát', run: (x: Game) => x.toggleRack() },
  ];

  const tourTools = [
    { icon: 'ti-eye', label: `Góc nhìn: ${hud?.aerial ? 'toàn cảnh' : hud?.firstPerson ? 'thứ nhất' : 'thứ ba'}`, key: 'V', run: (x: Game) => x.toggleView() },
    { icon: 'ti-map-2', label: hud?.aerial ? 'Thoát toàn cảnh' : 'Toàn cảnh', key: 'T', run: (x: Game) => x.toggleAerial() },
    { icon: 'ti-home', label: ROOF_LABEL[hud?.roofMode ?? 'auto'], key: 'R', run: (x: Game) => x.cycleRoof() },
    { icon: hud?.lightsOn ? 'ti-bulb-off' : 'ti-bulb', label: hud?.lightsOn ? 'Tắt đèn' : 'Bật đèn', key: 'L', run: (x: Game) => x.toggleLights() },
    { icon: 'ti-door', label: hud?.anyDoorClosed === false ? 'Đóng tất cả cửa' : 'Mở tất cả cửa', key: 'O', run: (x: Game) => x.toggleAllDoors() },
    { icon: 'ti-ruler-measure', label: hud?.dimsOn ? 'Ẩn kích thước' : 'Hiện kích thước', key: 'K', run: (x: Game) => x.toggleDims() },
    { icon: 'ti-map-pin', label: 'Về trước cửa chính', key: 'H', run: (x: Game) => x.goHome() },
    { icon: 'ti-settings', label: 'Cài đặt kích thước', key: '⚙', run: () => setSettingsOpen(o => !o) },
    { icon: 'ti-messages', label: 'Trao đổi & lịch sử sửa', key: '💬', run: () => setChatOpen(o => !o) },
    { icon: 'ti-logout', label: 'Thoát tham quan', key: 'Esc', run: (x: Game) => x.exitTour() },
  ];

  return (
    <>
      <div ref={viewRef} className="viewport" />

      {/* ---------------- overview: the original model ---------------- */}
      <div className={`overview ${touring ? 'hidden' : ''}`}>
        <div className="panel info">
          <h1>Mô hình 3D</h1>
          <div className="room">Nhà {hud?.houseSize ?? '9 × 14 m'}</div>
          <p className="sub">WC1 và WC2 có sen cây đứng, ngoài WC1 có bàn lavabo đôi với gương</p>
          {hud?.pipes && (
            <div className="struct-legend">
              <div className="t">Cấp thoát nước</div>
              <ul>
                {Object.values(PIPE_STYLE).map(p => <li key={p.name}><span className="sw" style={{ background: p.css }} />{p.name} · {p.spec}</li>)}
              </ul>
              <p>Téc 1500 L trên mái bằng WC cấp tự chảy; ống chính đi trên sàn gác WC và trong trần thạch cao ra bếp. Ống đứng thông hơi trong hộp kỹ thuật góc WC1. Xí vào bể phốt sau nhà, nước sàn vào hố ga HG1, chậu bếp ra HG2 rồi ra mương.</p>
            </div>
          )}
          {hud?.structure && (
            <div className="struct-legend">
              <div className="t">Kết cấu sơ bộ</div>
              <ul>
                <li><span className="sw" style={{ background: '#8f8b84' }} />Móng đơn 1,0 × 1,0 m, sâu 1,6 m · {hud.structure.footings} cái</li>
                <li><span className="sw" style={{ background: '#b86a2c' }} />Dầm móng 220 × 400 · ~{hud.structure.groundBeam} m</li>
                <li><span className="sw" style={{ background: '#c23b2e' }} />Cột 220 × 220 · {hud.structure.columns} cột</li>
                <li><span className="sw" style={{ background: '#d99a1e' }} />Dầm giằng 220 × 300 · ~{hud.structure.tieBeam} m</li>
              </ul>
              <p>Hai hàng cột biên dọc nhà, cột giữa chỉ ở góc phòng kín trùng tường; phòng khách, bếp không có cột giữa phòng. Hiên đứng trên dầm móng vươn ra. Vị trí C, D xem bản vẽ KT-05B. Kích thước thép, bê tông cần kỹ sư kết cấu tính.</p>
            </div>
          )}
        </div>
        <div className="panel bar" ref={barRef}>
          <div className="bar-buttons">
            {overviewButtons.map(b => (
              <button key={b.icon} onClick={click(b.run)}><i className={`ti ${b.icon}`} aria-hidden="true" />{b.label}</button>
            ))}
            <button className={`more ${detailsOpen ? 'on' : ''}`} aria-expanded={detailsOpen} aria-controls="bar-details"
              onClick={e => { setDetailsOpen(o => !o); e.currentTarget.blur(); }}>
              <i className={`ti ${detailsOpen ? 'ti-chevron-down' : 'ti-dots'}`} aria-hidden="true" />Chi tiết
            </button>
          </div>
          {detailsOpen && (
            <div id="bar-details" className="bar-details panel" role="menu">
              {detailButtons.map(b => (
                <button key={b.icon} role="menuitem" onClick={e => { click(b.run)(e); setDetailsOpen(false); }}>
                  <i className={`ti ${b.icon}`} aria-hidden="true" />{b.label}
                </button>
              ))}
            </div>
          )}
          <p className="hint">{hud?.dimsOn ? 'Kích thước & diện tích theo bản vẽ thực tế · ' : ''}{isTouch ? 'Chạm vào cửa, cửa sổ, tủ hoặc giá bát để đóng mở · kéo để xoay · chụm 2 ngón để phóng to' : 'Bấm vào cánh cửa, cửa sổ, tủ hoặc giá bát để đóng mở · kéo để xoay · cuộn để phóng to'}</p>
        </div>
        <button className="tour-cta" onClick={click(x => x.enterTour())}>
          <i className="ti ti-walk" aria-hidden="true" /> Thăm quan
        </button>
      </div>

      {/* ---------------- tour: walk around with a character ---------------- */}
      <div className={touring ? '' : 'hidden'}>
        <div className="panel info">
          <h1>Tham quan nhà {hud?.houseSize ?? '9 × 14 m'}</h1>
          <div className="room">{hud?.room ?? '…'}{hud?.lying ? ' · đang nằm' : hud?.sitting ? ' · đang ngồi' : ''}</div>
        </div>

        <div className="panel tools">
          {tourTools.map(t => (
            <button key={t.key} onClick={click(t.run)}>
              <i className={`ti ${t.icon}`} aria-hidden="true" />
              <span>{t.label}</span>
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>

        {!isTouch && (
          <div className="panel help">
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / mũi tên: đi lại · <kbd>Shift</kbd> chạy · <kbd>Space</kbd> nhảy</div>
            <div><kbd>E</kbd> mở/đóng cửa, cửa sổ, hạ giá bát, mở tủ, ngồi ghế/sofa, nằm giường · kéo chuột để xoay · cuộn để zoom · <kbd>T</kbd> toàn cảnh · <kbd>L</kbd> bật/tắt đèn</div>
            <div>Đi vào cửa đang đóng sẽ tự mở cửa · <kbd>Esc</kbd> về chế độ tổng quan</div>
          </div>
        )}

        <div className="panel minimap"><canvas ref={mapRef} width={200} height={132} /></div>

        {hud?.prompt && (
          <div className="panel prompt">{isTouch ? 'Bấm E — ' : <><kbd>E</kbd> </>}{hud.prompt}</div>
        )}

        {isTouch && touring && (
          <TouchControls
            onStick={(x, y) => g()?.setStick(x, y)}
            onInteract={() => g()?.interact()}
            onJump={() => g()?.jump()}
            onView={() => g()?.toggleView()}
            onAerial={() => g()?.toggleAerial()}
            aerial={!!hud?.aerial}
          />
        )}
      </div>

      {settingsOpen && gameRef.current && (
        <Settings game={gameRef.current} layout={layout} version={version} dirty={dirty} dbConfigured={dbConfigured} status={status}
          name={userName} onName={setUserName}
          onChange={applyLayout} onSave={save} onRevert={revert} onReset={reset} onClose={() => setSettingsOpen(false)} />
      )}
      {chatOpen && <Chat name={userName} onName={setUserName} refreshKey={chatRefresh} onClose={() => setChatOpen(false)} />}
      <Toast toast={toast} />
    </>
  );
}
