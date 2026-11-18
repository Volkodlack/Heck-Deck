/**
 * HUD minimaliste : jauge de Panique (haut), inventaire & main (bas), pouvoirs des Possédés,
 * statut des sabotages, contrôles audio/micro, toasts et onomatopées globales.
 */
import { useEffect, useState } from 'react';
import { ROOMS, cardLabel, isHex, sortHand, type RoomId } from '@shared';
import { serverNow, socket, useGame } from '../lib/socket';
import { interactNow, slipNow, type Prompt } from '../game/GameCanvas';
import { voice } from '../game/VoiceChat';
import { SFX } from '../game/SoundEffects';
import { ComicBurst, fxColor } from './ComicFx';
import PlayingCard from './PlayingCard';
import { isTouchDevice } from '../game/touch';

const ROLE_INFO = {
  survivor: { label: 'SURVIVANT', color: 'bg-toxic text-black', goal: 'Vide ta main aux Tables de Rituel et démasque les Possédés.' },
  possessed: { label: 'POSSÉDÉ', color: 'bg-blood text-white', goal: 'Refile tes Hex Cards, sabote, fais monter la Panique à 100 %.' },
  medium: { label: 'MÉDIUM', color: 'bg-hexviolet text-white', goal: 'Neutre : survis jusqu’à la fin. Tu peux sonder l’âme d’un joueur une fois.' },
  skirmisher: { label: 'ESCARMOUCHE', color: 'bg-paper text-black', goal: 'Sois le premier à vider ta main. Évite le Fantôme !' },
} as const;

export default function HUD({ prompt }: { prompt: Prompt | null }) {
  const { state, me, fx, toasts } = useGame();
  const [, tick] = useState(0);
  const [lockRoom, setLockRoom] = useState<RoomId>('library');
  const [micMuted, setMicMuted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [inspectTarget, setInspectTarget] = useState('');
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(i); }, []);
  if (!state || !me) return null;

  const now = serverNow();
  const self = state.players.find((p) => p.id === socket.id);
  const role = ROLE_INFO[me.role];
  const sab = state.sabotage;
  const sabReady = Math.max(0, Math.ceil((sab.readyAt - now) / 1000));
  const slipReady = Math.max(0, Math.ceil((me.slipReadyAt - now) / 1000));
  const hexCount = me.hand.filter(isHex).length;
  const activeTables = state.tables.filter((t) => t.active && !t.seats.includes(self?.id ?? ''));
  const globalFx = fx.filter((f) => f.x == null && !f.tableId && f.text).slice(-1);
  const panicColor = state.panic > 75 ? '#ff2e55' : state.panic > 45 ? '#ff9f1a' : '#7dff3a';

  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none compact-ui">
      {/* ---------- Haut : Panique ---------- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[min(560px,70vw)]">
        <div className="flex justify-between font-comic text-lg comic-stroke"><span>PANIQUE DU MANOIR</span><span>{state.panic}%</span></div>
        <div className="h-6 bg-ink border-4 border-black rounded-full overflow-hidden shadow-hard-sm">
          <div className="h-full transition-all duration-500" style={{ width: `${state.panic}%`, background: `repeating-linear-gradient(45deg, ${panicColor}, ${panicColor} 10px, #000a 10px, #000a 14px)` }} />
        </div>
        <div className="flex gap-2 justify-center mt-2 flex-wrap">
          {sab.lightsOutUntil > now && <Banner color="bg-black text-blood">⚡ BLACKOUT {Math.ceil((sab.lightsOutUntil - now) / 1000)}s</Banner>}
          {sab.locked && <Banner color="bg-blood text-white">🔒 {ROOMS[sab.locked.room].name} {Math.ceil((sab.locked.until - now) / 1000)}s</Banner>}
          {sab.voiceJamUntil > now && <Banner color="bg-hexviolet text-white">📻 VOIX BROUILLÉES</Banner>}
        </div>
      </div>

      {/* ---------- Haut gauche : rôle ---------- */}
      <div className="absolute top-3 left-3 panel p-3 max-w-[260px] pointer-events-auto">
        <span className={`font-comic text-xl px-2 border-2 border-black rounded ${role.color}`}>{role.label}</span>
        <p className="text-xs mt-2 opacity-90">{role.goal}</p>
        {me.partners.length > 0 && <p className="text-xs mt-1 text-blood">Complices : {me.partners.map((id) => state.players.find((p) => p.id === id)?.name).join(', ')}</p>}
        {!self?.alive && <p className="font-comic text-lg text-hexviolet mt-1">TU ES UN FANTÔME 👻</p>}
      </div>

      {/* ---------- Haut droite : salle & audio ---------- */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-auto">
        <span className="panel px-3 py-1 font-pixel text-xs text-toxic">{state.code} · Pioche {state.deckCount}</span>
        <div className="flex gap-2">
          {socket.kind !== 'local' && (
            <button className="btn-ghost !text-sm !px-2 !py-1" onClick={() => { const m = !micMuted; setMicMuted(m); voice.setMicMuted(m); }} title="Micro">
              {voice.micAvailable ? (micMuted ? '🎙️✖' : '🎙️') : '🎙️ off'}
            </button>
          )}
          <button className="btn-ghost !text-sm !px-2 !py-1" onClick={() => { const m = !muted; setMuted(m); SFX.setMuted(m); }} title="Son">{muted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      {/* ---------- Pouvoirs ---------- */}
      {self?.alive && me.role === 'possessed' && state.phase === 'explore' && (
        <div className="absolute right-3 top-28 panel p-3 flex flex-col gap-2 w-56 pointer-events-auto">
          <span className="font-comic text-xl text-blood comic-stroke">SABOTAGES {sabReady > 0 && <span className="font-pixel text-[10px]">{sabReady}s</span>}</span>
          <button className="btn-blood !text-sm !py-1" disabled={sabReady > 0} onClick={() => socket.emit('sabotage', { type: 'lights' })}>⚡ Couper le courant</button>
          <div className="flex gap-1">
            <select className="input !py-0 !px-1 text-xs" value={lockRoom} onChange={(e) => setLockRoom(e.target.value as RoomId)}>
              {(Object.keys(ROOMS) as RoomId[]).map((r) => <option key={r} value={r}>{ROOMS[r].name}</option>)}
            </select>
            <button className="btn-blood !text-sm !py-1 !px-2" disabled={sabReady > 0} onClick={() => socket.emit('sabotage', { type: 'lock', room: lockRoom })}>🔒</button>
          </div>
          <button className="btn-blood !text-sm !py-1" disabled={sabReady > 0} onClick={() => socket.emit('sabotage', { type: 'jam' })}>📻 Brouiller les voix</button>
          {activeTables.map((t) => (
            <button key={t.id} className="btn-blood !text-sm !py-1" disabled={sabReady > 0} onClick={() => socket.emit('sabotage', { type: 'blast', tableId: t.id })}>💥 Exploser {t.id.replace('t-', 'table ')}</button>
          ))}
          <button className="btn-toxic !text-sm !py-1 mt-1" disabled={slipReady > 0 || hexCount === 0} onClick={slipNow}>
            ☠ Refiler une Hex [R] {slipReady > 0 ? `${slipReady}s` : `(${hexCount})`}
          </button>
        </div>
      )}
      {self?.alive && me.role === 'medium' && !me.mediumInspectUsed && (
        <div className="absolute right-3 top-28 panel p-3 flex flex-col gap-2 w-56 pointer-events-auto">
          <span className="font-comic text-xl text-hexviolet comic-stroke">SÉANCE DE SPIRITISME</span>
          <select className="input !py-1 text-sm" value={inspectTarget} onChange={(e) => setInspectTarget(e.target.value)}>
            <option value="">— Choisir une âme —</option>
            {state.players.filter((p) => p.alive && p.id !== socket.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-violet !text-sm !py-1" disabled={!inspectTarget} onClick={() => socket.emit('medium:inspect', inspectTarget)}>🔮 Sonder (1×)</button>
        </div>
      )}

      {/* ---------- Bas : inventaire + main ---------- */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-3 pointer-events-auto">
        <div className="panel p-2 flex gap-2 items-center">
          <ItemSlot label="UV" hotkey="1" count={me.items.filter((i) => i === 'uv').length} active={me.uvUntil > now} onUse={() => socket.emit('item:use', 'uv')} icon="🔦" />
          <ItemSlot label="SEL" hotkey="2" count={me.items.filter((i) => i === 'salt').length} active={me.saltUntil > now} onUse={() => socket.emit('item:use', 'salt')} icon="🧂" />
        </div>
        <div className="panel px-3 py-2 flex flex-col items-center">
          <span className="font-pixel text-[9px] mb-1">MA MAIN · {me.hand.length}</span>
          <div className="flex -space-x-7">
            {sortHand(me.hand).map((c) => <span key={c.id} title={cardLabel(c)}><PlayingCard card={c} width={40} /></span>)}
            {me.hand.length === 0 && <span className="font-comic text-toxic text-lg">MAIN VIDE ✓</span>}
          </div>
        </div>
      </div>

      {/* ---------- Invite d'interaction ---------- */}
      {prompt && !isTouchDevice() && (
        <button className="absolute bottom-36 left-1/2 -translate-x-1/2 btn-toxic pointer-events-auto animate-pop" onClick={interactNow}>
          [E] {prompt.label}
        </button>
      )}

      {/* ---------- Aide contrôles ---------- */}
      {!isTouchDevice() && <p className="absolute bottom-3 left-3 text-[10px] font-pixel opacity-50 leading-4 hidden md:block">
        ZQSD/WASD/↑↓←→ bouger<br />E interagir · 1/2 objets{me.role === 'possessed' ? ' · R refiler' : ''}
      </p>}

      {/* ---------- Toasts & onomatopées ---------- */}
      <div className="absolute top-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {toasts.map((t) => <div key={t.key} className="panel px-4 py-2 font-comic text-lg animate-pop">{t.text}</div>)}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        {globalFx.map((f) => <ComicBurst key={f.key} text={f.text!} color={fxColor(f.type)} size={1.3} />)}
      </div>
    </div>
  );
}

function Banner({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`font-comic text-base px-2 border-2 border-black rounded shadow-hard-sm animate-pulse ${color}`}>{children}</span>;
}

function ItemSlot({ label, hotkey, count, active, onUse, icon }: { label: string; hotkey: string; count: number; active: boolean; onUse: () => void; icon: string }) {
  return (
    <button disabled={count === 0} onClick={onUse}
      className={`relative w-14 h-14 bg-ink border-4 border-black rounded-lg flex flex-col items-center justify-center disabled:opacity-40 ${active ? 'ring-4 ring-toxic' : ''}`}>
      <span className="text-2xl leading-none">{icon}</span>
      <span className="font-pixel text-[7px]">{label}</span>
      <span className="absolute -top-2 -left-2 font-pixel text-[8px] bg-paper text-black border-2 border-black rounded px-1">{hotkey}</span>
      {count > 0 && <span className="absolute -top-2 -right-2 font-pixel text-[8px] bg-toxic text-black border-2 border-black rounded px-1">{count}</span>}
    </button>
  );
}
