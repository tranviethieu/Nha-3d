import { useEffect, useRef, useState } from 'react';
import { Game, type HudState, type RoofMode } from './engine/Game';
import { TouchControls } from './components/TouchControls';
import { Toast } from './components/Toast';

const ROOF_LABEL: Record<RoofMode, string> = { auto: 'Mái: tự động', on: 'Mái: luôn hiện', off: 'Mái: luôn ẩn' };
const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export default function App() {
  const viewRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    const game = new Game(viewRef.current!, mapRef.current!, setHud, text => setToast({ text, id: Date.now() }));
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game; // for debugging in the console
    return () => { game.dispose(); gameRef.current = null; };
  }, []);

  const g = () => gameRef.current;
  const touring = hud?.mode === 'tour';
  // run an action, then drop focus so Space/E don't re-trigger the button
  const click = (fn: (g: Game) => void) => (e: React.MouseEvent<HTMLButtonElement>) => { const x = g(); if (x) fn(x); e.currentTarget.blur(); };

  const overviewButtons = [
    { icon: 'ti-bath', label: 'Xem nhà vệ sinh', run: (x: Game) => x.viewWC() },
    { icon: 'ti-droplet', label: 'Xem lavabo', run: (x: Game) => x.viewLavabo() },
    { icon: 'ti-tools-kitchen-2', label: 'Xem bếp', run: (x: Game) => x.viewKitchen() },
    { icon: 'ti-device-tv', label: 'Xem vách tivi', run: (x: Game) => x.viewTV() },
    { icon: 'ti-home', label: hud?.roofOn ? 'Ẩn mái' : 'Hiện mái', run: (x: Game) => x.toggleRoof() },
    { icon: 'ti-door', label: hud?.anyDoorClosed === false ? 'Đóng tất cả cửa' : 'Mở tất cả cửa', run: (x: Game) => x.toggleAllDoors() },
    { icon: 'ti-window', label: hud?.anyWindowClosed === false ? 'Đóng cửa sổ' : 'Mở cửa sổ', run: (x: Game) => x.toggleAllWindows() },
    { icon: 'ti-box', label: hud?.anyWardrobeClosed === false ? 'Đóng tủ quần áo' : 'Mở tủ quần áo', run: (x: Game) => x.toggleAllWardrobes() },
    { icon: 'ti-arrows-vertical', label: hud?.rackDown ? 'Nâng giá bát' : 'Hạ giá bát', run: (x: Game) => x.toggleRack() },
    { icon: 'ti-cube', label: 'Phối cảnh', run: (x: Game) => x.viewPerspective() },
    { icon: 'ti-ruler-measure', label: hud?.dimsOn ? 'Ẩn kích thước' : 'Hiện kích thước', run: (x: Game) => x.toggleDims() },
  ];

  const tourTools = [
    { icon: 'ti-eye', label: `Góc nhìn: ${hud?.aerial ? 'toàn cảnh' : hud?.firstPerson ? 'thứ nhất' : 'thứ ba'}`, key: 'V', run: (x: Game) => x.toggleView() },
    { icon: 'ti-map-2', label: hud?.aerial ? 'Thoát toàn cảnh' : 'Toàn cảnh', key: 'T', run: (x: Game) => x.toggleAerial() },
    { icon: 'ti-home', label: ROOF_LABEL[hud?.roofMode ?? 'auto'], key: 'R', run: (x: Game) => x.cycleRoof() },
    { icon: 'ti-door', label: hud?.anyDoorClosed === false ? 'Đóng tất cả cửa' : 'Mở tất cả cửa', key: 'O', run: (x: Game) => x.toggleAllDoors() },
    { icon: 'ti-ruler-measure', label: hud?.dimsOn ? 'Ẩn kích thước' : 'Hiện kích thước', key: 'K', run: (x: Game) => x.toggleDims() },
    { icon: 'ti-map-pin', label: 'Về trước cửa chính', key: 'H', run: (x: Game) => x.goHome() },
    { icon: 'ti-logout', label: 'Thoát tham quan', key: 'Esc', run: (x: Game) => x.exitTour() },
  ];

  return (
    <>
      <div ref={viewRef} className="viewport" />

      {/* ---------------- overview: the original model ---------------- */}
      <div className={`overview ${touring ? 'hidden' : ''}`}>
        <div className="panel info">
          <h1>Mô hình 3D</h1>
          <div className="room">Nhà 9 × 14 m</div>
          <p className="sub">WC1 và WC2 có sen cây đứng, ngoài WC1 có bàn lavabo đôi với gương</p>
        </div>
        <div className="panel bar">
          <div className="bar-buttons">
            {overviewButtons.map(b => (
              <button key={b.icon} onClick={click(b.run)}><i className={`ti ${b.icon}`} aria-hidden="true" />{b.label}</button>
            ))}
          </div>
          <p className="hint">{hud?.dimsOn ? 'Kích thước & diện tích theo bản vẽ thực tế · ' : ''}{isTouch ? 'Chạm vào cửa, cửa sổ, tủ hoặc giá bát để đóng mở · kéo để xoay · chụm 2 ngón để phóng to' : 'Bấm vào cánh cửa, cửa sổ, tủ hoặc giá bát để đóng mở · kéo để xoay · cuộn để phóng to'}</p>
        </div>
        <button className="tour-cta" onClick={click(x => x.enterTour())}>
          <i className="ti ti-walk" aria-hidden="true" /> Thăm quan
        </button>
      </div>

      {/* ---------------- tour: walk around with a character ---------------- */}
      <div className={touring ? '' : 'hidden'}>
        <div className="panel info">
          <h1>Tham quan nhà 9 × 14 m</h1>
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
            <div><kbd>E</kbd> mở/đóng cửa, cửa sổ, hạ giá bát, mở tủ, ngồi ghế/sofa, nằm giường · kéo chuột để xoay · cuộn để zoom · <kbd>T</kbd> toàn cảnh</div>
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

      <Toast toast={toast} />
    </>
  );
}
