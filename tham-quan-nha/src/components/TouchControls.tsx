import { useRef, useState, type PointerEvent } from 'react';

interface Props {
  onStick: (x: number, y: number) => void;
  onInteract: () => void;
  onJump: () => void;
  onView: () => void;
}

const MAX = 50; // px the knob can travel

/** Virtual joystick (bottom-left) and action buttons for phones/tablets. */
export function TouchControls({ onStick, onInteract, onJump, onView }: Props) {
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const down = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    origin.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x, dy = e.clientY - o.y;
    const l = Math.hypot(dx, dy);
    if (l > MAX) { dx *= MAX / l; dy *= MAX / l; }
    setKnob({ x: dx, y: dy });
    onStick(dx / MAX, dy / MAX);
  };
  const up = () => { origin.current = null; setKnob({ x: 0, y: 0 }); onStick(0, 0); };

  return (
    <>
      <div className="joy" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="touch-btns">
        <button onClick={onInteract}>E</button>
        <button onClick={onJump} aria-label="Nhảy"><i className="ti ti-arrow-big-up" aria-hidden="true" /></button>
        <button onClick={onView}>V</button>
      </div>
    </>
  );
}
