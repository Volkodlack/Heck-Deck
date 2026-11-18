/**
 * Contrôles tactiles (APK / mobile) : joystick virtuel à gauche, boutons d'action à droite.
 */
import { useRef, useState } from 'react';
import { touchInput } from '../game/touch';
import { interactNow, slipNow } from '../game/GameCanvas';
import { socket, useGame } from '../lib/socket';
import { isHex } from '@shared';

const R = 56; // rayon du joystick (px)

export default function TouchControls({ hidden }: { hidden: boolean }) {
  const { me } = useGame();
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  if (hidden) { touchInput.x = 0; touchInput.y = 0; return null; }

  const move = (cx: number, cy: number) => {
    const o = origin.current!;
    let dx = cx - o.x, dy = cy - o.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    // zone morte de 15 %
    const m = Math.hypot(dx, dy) / R;
    touchInput.x = m < 0.15 ? 0 : dx / R;
    touchInput.y = m < 0.15 ? 0 : dy / R;
  };
  const end = () => { origin.current = null; setKnob({ x: 0, y: 0 }); touchInput.x = 0; touchInput.y = 0; };

  return (
    <div className="absolute inset-0 z-[25] pointer-events-none select-none">
      <div
        className="absolute left-6 bottom-6 w-36 h-36 rounded-full border-4 border-black bg-black/40 pointer-events-auto touch-none"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => origin.current?.id === e.pointerId && move(e.clientX, e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="absolute w-16 h-16 rounded-full bg-hexviolet border-4 border-black shadow-hard-sm"
          style={{ left: `calc(50% - 32px + ${knob.x}px)`, top: `calc(50% - 32px + ${knob.y}px)` }} />
      </div>
      <div className="absolute right-5 bottom-5 flex items-end gap-3 pointer-events-auto">
        {me?.role === 'possessed' && (
          <button className="w-16 h-16 rounded-full btn-blood !p-0 !text-2xl" onClick={slipNow} disabled={!me.hand.some(isHex)}>☠</button>
        )}
        <div className="flex flex-col gap-2">
          <button className="w-12 h-12 rounded-full btn-ghost !p-0 !text-xl" onClick={() => socket.emit('item:use', 'uv')} disabled={!me?.items.includes('uv')}>🔦</button>
          <button className="w-12 h-12 rounded-full btn-ghost !p-0 !text-xl" onClick={() => socket.emit('item:use', 'salt')} disabled={!me?.items.includes('salt')}>🧂</button>
        </div>
        <button className="w-20 h-20 rounded-full btn-toxic !p-0 !text-3xl" onClick={interactNow}>E</button>
      </div>
    </div>
  );
}
