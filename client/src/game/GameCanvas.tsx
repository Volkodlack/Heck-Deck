/**
 * HEX DECK — Rendu temps réel du manoir (Canvas 2D) + entrées clavier + prédiction de mouvement.
 *
 * Contrôles (positions physiques, donc ZQSD en AZERTY / WASD en QWERTY, ou flèches) :
 *   Déplacement  ZQSD / WASD / flèches
 *   E            Interagir (fouiller, s'asseoir, cloche)
 *   R            Refiler une Hex Card (Possédé)
 *   1 / 2        Utiliser Lampe UV / Sel
 */
import { useEffect, useRef } from 'react';
import {
  BALANCE, BELL, DOORS, FURNITURE, INTERACT_RANGE, PLAYER_SPEED, RITUAL_TABLES, ROOMS, SLIP_RANGE, WALLS, WORLD,
  dist, isHex, moveWithCollisions, solidRects, type GameRoomState, type PlayerPublic, type PrivateState,
} from '@shared';
import { getStore, onFx, serverNow, socket } from '../lib/socket';
import { drawBell, drawBurst, drawCharacter, drawFurniture, drawGhost, drawNameTag, drawRitualTable, roundRect } from './draw';
import { SFX } from './SoundEffects';
import { voice } from './VoiceChat';

export interface Prompt { kind: 'search' | 'sit' | 'bell' | 'slip'; label: string; targetId: string }

interface Props {
  /** Bloque les entrées (modale de cartes, vote, chat…) */
  inputLocked: boolean;
  onPrompt: (p: Prompt | null) => void;
}

/** Permet au HUD (boutons tactiles / souris) de déclencher l'interaction. */
export const interactNow = () => window.dispatchEvent(new Event('hexdeck:interact'));
export const slipNow = () => window.dispatchEvent(new Event('hexdeck:slip'));

const ROLE_TAG: Record<string, string> = { possessed: 'POSSÉDÉ', survivor: 'SURVIVANT', medium: 'MÉDIUM', skirmisher: '' };

export default function GameCanvas({ inputLocked, onPrompt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lockedRef = useRef(inputLocked);
  lockedRef.current = inputLocked;
  const promptRef = useRef(onPrompt);
  promptRef.current = onPrompt;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const bg = renderBackground();
    const dark = document.createElement('canvas');
    const dctx = dark.getContext('2d')!;
    const keys = new Set<string>();
    const me = { x: 0, y: 0, init: false, facing: 1 as 1 | -1, moving: false };
    const smooth = new Map<string, { x: number; y: number }>();
    const bursts: { x: number; y: number; text: string; start: number; color: string }[] = [];
    let raf = 0;
    let lastT = performance.now();
    let lastSend = 0;
    let lastStep = 0;
    let lastVoice = 0;
    let promptKey = '';
    let currentPrompt: Prompt | null = null;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      dark.width = canvas.width;
      dark.height = canvas.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const FX_COLOR: Record<string, string> = { hexed: '#7dff3a', blocked: '#9fe6ff', search: '#ffd23a', ghost: '#e8fff0', curse: '#7dff3a', boom: '#ff7a1a', win: '#7dff3a' };
    const offFx = onFx((f) => {
      if (f.x != null && f.y != null && f.text) bursts.push({ x: f.x, y: f.y, text: f.text, start: performance.now(), color: FX_COLOR[f.type] ?? '#ffd23a' });
    });

    const interact = () => {
      if (lockedRef.current || !currentPrompt) return;
      const p = currentPrompt;
      if (p.kind === 'search') socket.emit('search', p.targetId);
      if (p.kind === 'sit') socket.emit('table:sit', p.targetId);
      if (p.kind === 'bell') socket.emit('bell');
    };
    const slip = () => {
      const { state, me: priv } = getStore();
      if (!state || !priv || priv.role !== 'possessed' || lockedRef.current) return;
      const target = nearestVictim(state, priv, me);
      const card = priv.hand.find(isHex);
      if (target && card) socket.emit('hex:slip', { targetId: target.id, cardId: card.id });
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.type === 'keydown') {
        keys.add(e.code);
        if (e.repeat) return;
        if (e.code === 'KeyE') interact();
        if (e.code === 'KeyR') slip();
        if (e.code === 'Digit1') socket.emit('item:use', 'uv');
        if (e.code === 'Digit2') socket.emit('item:use', 'salt');
      } else keys.delete(e.code);
    };
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    window.addEventListener('hexdeck:interact', interact);
    window.addEventListener('hexdeck:slip', slip);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      const t = now / 1000;
      const { state, me: priv, mediumResults } = getStore();
      const self = state?.players.find((p) => p.id === socket.id);
      if (!state || !self) return;
      const sNow = serverNow();
      const locked = state.sabotage.locked && state.sabotage.locked.until > sNow ? state.sabotage.locked.room : null;

      /* ---------- Synchronisation / prédiction ---------- */
      const mustSnap = !me.init || self.seatedAt || state.phase !== 'explore' || (self.alive && dist(me, self) > 90);
      if (mustSnap && self.alive) { me.x = self.x; me.y = self.y; me.init = true; }
      if (!me.init) { me.x = self.x; me.y = self.y; me.init = true; }

      /* ---------- Déplacement ---------- */
      const canMove = (state.phase === 'explore' || (!self.alive && state.phase !== 'ended')) && !self.seatedAt && !lockedRef.current;
      let dx = 0, dy = 0;
      if (canMove) {
        if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      }
      me.moving = dx !== 0 || dy !== 0;
      if (me.moving) {
        const len = Math.hypot(dx, dy);
        const step = PLAYER_SPEED * dt;
        if (dx !== 0) me.facing = dx > 0 ? 1 : -1;
        if (self.alive) Object.assign(me, moveWithCollisions(me.x, me.y, (dx / len) * step, (dy / len) * step, solidRects(locked)));
        else { me.x = clamp(me.x + (dx / len) * step, 0, WORLD.w); me.y = clamp(me.y + (dy / len) * step, 0, WORLD.h); } // fantôme spectateur
        if (self.alive && now - lastStep > 320) { lastStep = now; SFX.step(); }
      }
      if (self.alive && state.phase === 'explore' && !self.seatedAt && now - lastSend > 50) {
        lastSend = now;
        socket.emit('move', { x: Math.round(me.x), y: Math.round(me.y), facing: me.facing, moving: me.moving });
      }

      /* ---------- Chat vocal ---------- */
      if (now - lastVoice > 100) {
        lastVoice = now;
        voice.update({
          me: { id: self.id, x: me.x, y: me.y, alive: self.alive },
          others: state.players.filter((p) => p.id !== self.id && p.connected).map((p) => ({ id: p.id, x: p.x, y: p.y, alive: p.alive })),
          global: state.phase === 'meeting' || state.phase === 'ended',
          jammed: state.sabotage.voiceJamUntil > sNow,
          lockedRoom: locked,
        });
      }

      /* ---------- Interaction disponible ---------- */
      currentPrompt = self.alive && state.phase === 'explore' && !self.seatedAt ? findPrompt(state, priv, me) : null;
      const key = currentPrompt ? `${currentPrompt.kind}:${currentPrompt.targetId}` : '';
      if (key !== promptKey) { promptKey = key; promptRef.current(currentPrompt); }

      /* ---------- Rendu ---------- */
      const W = canvas.width, H = canvas.height;
      const zoom = clamp(Math.min(W / dpr / 1100, H / dpr / 720), 0.55, 1.25) * dpr;
      const camX = clamp(me.x, W / zoom / 2, WORLD.w - W / zoom / 2);
      const camY = clamp(me.y, H / zoom / 2, WORLD.h - H / zoom / 2);
      const camXf = WORLD.w * zoom < W ? WORLD.w / 2 : camX;
      const camYf = WORLD.h * zoom < H ? WORLD.h / 2 : camY;
      const toScreen = (x: number, y: number) => ({ x: (x - camXf) * zoom + W / 2, y: (y - camYf) * zoom + H / 2 });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050208';
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(zoom, 0, 0, zoom, W / 2 - camXf * zoom, H / 2 - camYf * zoom);
      ctx.drawImage(bg, 0, 0);

      // Portes verrouillées
      if (locked) {
        for (const d of DOORS.filter((d) => d.rooms.includes(locked))) {
          ctx.fillStyle = '#ff2e55'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
          ctx.fillRect(d.x, d.y, d.w, d.h); ctx.strokeRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.moveTo(d.x + d.w, d.y); ctx.lineTo(d.x, d.y + d.h); ctx.stroke();
        }
      }

      for (const f of FURNITURE) drawFurniture(ctx, f, currentPrompt?.targetId === f.id);
      for (const tdef of RITUAL_TABLES) {
        const ts = state.tables.find((x) => x.id === tdef.id);
        drawRitualTable(ctx, tdef.x, tdef.y, tdef.maxSeats, ts?.seats.length ?? 0, !!ts?.active, currentPrompt?.targetId === tdef.id, t);
      }
      if (!state.skirmish) drawBell(ctx, BELL.x, BELL.y, currentPrompt?.kind === 'bell', t);

      // Joueurs (triés par profondeur)
      const drawList: { p: PlayerPublic; x: number; y: number; isMe: boolean }[] = [];
      for (const p of state.players) {
        if (!p.connected && p.id !== self.id) continue;
        if (!p.alive && self.alive) continue; // les vivants ne voient pas les morts
        if (p.id === self.id) { drawList.push({ p, x: me.x, y: me.y, isMe: true }); continue; }
        const s = smooth.get(p.id) ?? { x: p.x, y: p.y };
        const k = 1 - Math.pow(0.0001, dt); // lissage indépendant du framerate
        s.x += (p.x - s.x) * k; s.y += (p.y - s.y) * k;
        if (Math.hypot(p.x - s.x, p.y - s.y) > 200) { s.x = p.x; s.y = p.y; }
        smooth.set(p.id, s);
        drawList.push({ p, x: s.x, y: s.y, isMe: false });
      }
      drawList.sort((a, b) => a.y - b.y);
      for (const d of drawList) {
        drawCharacter(ctx, d.x, d.y, d.p.cosmetics, { facing: d.isMe ? me.facing : d.p.facing, t: t + d.p.id.length, moving: d.isMe ? me.moving : d.p.moving, alpha: d.p.alive ? 1 : 0.4 });
        const partner = priv?.partners.includes(d.p.id);
        const known = d.p.revealedRole ?? mediumResults[d.p.id];
        const tag = known && ROLE_TAG[known] ? ` · ${ROLE_TAG[known]}` : '';
        drawNameTag(ctx, d.x, d.y - 40, (d.p.isBot ? '🤖 ' : '') + d.p.name + tag, partner || known === 'possessed' ? '#ff2e55' : d.isMe ? '#7dff3a' : '#f5ecd7');
        // Indicateur de parole / proximité vocale
        const lvl = voice.levels[d.p.id] ?? 0;
        if (!d.isMe && lvl > 0.05) {
          ctx.fillStyle = `rgba(125,255,58,${Math.min(1, lvl)})`;
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(d.x, d.y - 64, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (d.isMe && priv && priv.saltUntil > sNow) {
          ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(d.x, d.y, 34, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      if (state.ghost.active) drawGhost(ctx, state.ghost.x, state.ghost.y, t);

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const p = (now - b.start) / 1400;
        if (p >= 1) { bursts.splice(i, 1); continue; }
        drawBurst(ctx, b.x, b.y, b.text, p, b.color);
      }

      /* ---------- Lumière dynamique ---------- */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const meetingOrEnd = state.phase === 'meeting' || state.phase === 'ended';
      if (self.alive && !meetingOrEnd) {
        const uv = !!priv && priv.uvUntil > sNow;
        const blackout = state.sabotage.lightsOutUntil > sNow;
        const flicker = blackout ? Math.random() * 6 : Math.sin(t * 7) * 3;
        const radius = ((blackout && !uv ? BALANCE.lightRadiusSabotaged : BALANCE.lightRadius) + flicker) * zoom;
        const c = toScreen(me.x, me.y);
        dctx.globalCompositeOperation = 'source-over';
        dctx.clearRect(0, 0, W, H);
        dctx.fillStyle = blackout ? 'rgba(2,0,4,.985)' : 'rgba(5,2,10,.955)';
        dctx.fillRect(0, 0, W, H);
        dctx.globalCompositeOperation = 'destination-out';
        const g = dctx.createRadialGradient(c.x, c.y, radius * 0.35, c.x, c.y, radius);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g;
        dctx.beginPath(); dctx.arc(c.x, c.y, radius, 0, Math.PI * 2); dctx.fill();
        ctx.drawImage(dark, 0, 0);
        if (uv) { ctx.fillStyle = 'rgba(139,44,255,.12)'; ctx.fillRect(0, 0, W, H); }
      } else if (!self.alive) {
        ctx.fillStyle = 'rgba(30,60,45,.28)';
        ctx.fillRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('hexdeck:interact', interact);
      window.removeEventListener('hexdeck:slip', slip);
      offFx();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />;
}

/* ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function nearestVictim(state: GameRoomState, priv: PrivateState, me: { x: number; y: number }) {
  return state.players
    .filter((p) => p.alive && p.id !== socket.id && !priv.partners.includes(p.id) && dist(p, me) <= SLIP_RANGE)
    .sort((a, b) => dist(a, me) - dist(b, me))[0];
}

function findPrompt(state: GameRoomState, priv: PrivateState | null, me: { x: number; y: number }): Prompt | null {
  const options: (Prompt & { d: number })[] = [];
  if (!state.skirmish) {
    const d = dist(me, BELL);
    if (d < INTERACT_RANGE + 10) options.push({ kind: 'bell', label: priv?.bellUsed ? 'Cloche (déjà utilisée)' : 'Sonner la Cloche', targetId: 'bell', d });
  }
  for (const t of state.tables) {
    const d = dist(me, t);
    if (d < INTERACT_RANGE + 50) options.push({ kind: 'sit', label: `S’asseoir (${t.seats.length}/${t.maxSeats})`, targetId: t.id, d: d - 30 });
  }
  for (const f of FURNITURE) {
    const d = dist(me, f);
    if (d < INTERACT_RANGE) options.push({ kind: 'search', label: 'Fouiller', targetId: f.id, d });
  }
  options.sort((a, b) => a.d - b.d);
  return options[0] ?? null;
}

/** Pré-rendu statique du manoir (sols, tapis, murs, noms de pièces). */
function renderBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WORLD.w; c.height = WORLD.h;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (const r of Object.values(ROOMS)) {
    g.fillStyle = r.floor;
    g.fillRect(r.x, r.y, r.w, r.h);
    // Parquet / dalles procéduraux
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = 2;
    const plank = r.name === 'Cave' || r.name === 'Cuisine' ? 60 : 28;
    for (let y = r.y; y < r.y + r.h; y += plank) {
      g.beginPath(); g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); g.stroke();
      const off = rnd() * 120;
      for (let x = r.x + off; x < r.x + r.w; x += plank === 60 ? 60 : 140) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + plank); g.stroke(); }
    }
    // Taches et toiles d'araignée
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
      g.beginPath(); g.ellipse(r.x + rnd() * r.w, r.y + rnd() * r.h, 20 + rnd() * 40, 10 + rnd() * 20, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.save();
    g.font = '42px Bangers, Impact, sans-serif';
    g.fillStyle = 'rgba(245,236,215,.09)';
    g.textAlign = 'center';
    g.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 + 15);
    g.restore();
  }
  // Tapis du Hall
  g.fillStyle = '#5c1530'; g.strokeStyle = '#000'; g.lineWidth = 5;
  roundRect(g, BELL.x - 260, BELL.y - 170, 520, 340, 30); g.fill(); g.stroke();
  g.strokeStyle = '#ffcf3a'; g.lineWidth = 3;
  roundRect(g, BELL.x - 240, BELL.y - 150, 480, 300, 22); g.stroke();

  // Murs avec relief BD
  for (const w of WALLS) {
    g.fillStyle = '#000'; g.fillRect(w.x + 5, w.y + 5, w.w, w.h);
    g.fillStyle = '#4b2d5e'; g.fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle = '#6d4687'; g.fillRect(w.x, w.y, w.w, Math.min(6, w.h));
    g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(w.x, w.y, w.w, w.h);
  }
  return c;
}
