/**
 * Rendu procédural Canvas 2D : personnages, mobilier, tables de rituel, fantôme, onomatopées.
 * Style "comics" : contours noirs épais, aplats, ombres dures. Aucun sprite externe requis.
 */
import type { Cosmetics, Furniture } from '@shared';

export function shadeRgb(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const INK = '#000';

function line(ctx: CanvasRenderingContext2D, w = 4) {
  ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}

/** Personnage "haricot à visière" (même design que le composant Avatar SVG). */
export function drawCharacter(
  ctx: CanvasRenderingContext2D, x: number, y: number, c: Cosmetics,
  opts: { facing: 1 | -1; t: number; moving: boolean; alpha?: number; scale?: number },
) {
  const s = opts.scale ?? 0.55;
  const bob = opts.moving ? Math.abs(Math.sin(opts.t * 12)) * 3 : Math.sin(opts.t * 2) * 0.8;
  const legSwing = opts.moving ? Math.sin(opts.t * 12) * 5 : 0;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  // ombre au sol
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(x, y + 22, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y - bob);
  ctx.scale(s * opts.facing, s);
  ctx.translate(-40, -50);
  line(ctx, 6);
  // sac à dos
  ctx.fillStyle = shadeRgb(c.color, -50);
  roundRect(ctx, 2, 34, 16, 32, 6); ctx.fill(); ctx.stroke();
  // jambes
  ctx.fillStyle = c.color;
  roundRect(ctx, 18 + legSwing, 62, 14, 22, 6); ctx.fill(); ctx.stroke();
  roundRect(ctx, 48 - legSwing, 62, 14, 22, 6); ctx.fill(); ctx.stroke();
  // corps
  ctx.beginPath();
  ctx.moveTo(16, 30); ctx.bezierCurveTo(16, 8, 64, 8, 64, 30); ctx.lineTo(64, 72); ctx.lineTo(16, 72); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // reflet
  ctx.strokeStyle = shadeRgb(c.color, 60); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(22, 28); ctx.quadraticCurveTo(26, 15, 46, 16); ctx.stroke();
  // visière
  line(ctx, 5);
  ctx.fillStyle = '#9fe6ff';
  roundRect(ctx, 36, 26, 34, 20, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  roundRect(ctx, 44, 30, 14, 5, 2.5); ctx.fill();
  drawHat(ctx, c.hat, opts.t);
  ctx.restore();
}

function drawHat(ctx: CanvasRenderingContext2D, hat: Cosmetics['hat'], t: number) {
  ctx.save();
  ctx.translate(0, -8);
  line(ctx, 4);
  switch (hat) {
    case 'tophat':
      ctx.fillStyle = '#151515'; ctx.fillRect(22, 2, 36, 22); ctx.strokeRect(22, 2, 36, 22);
      roundRect(ctx, 14, 20, 52, 7, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8b2cff'; ctx.fillRect(22, 14, 36, 5);
      break;
    case 'witch':
      ctx.fillStyle = '#2b1a40';
      ctx.beginPath(); ctx.moveTo(40, -14); ctx.lineTo(60, 22); ctx.lineTo(20, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      roundRect(ctx, 10, 19, 60, 7, 3); ctx.fill(); ctx.stroke();
      break;
    case 'candle': {
      ctx.fillStyle = '#f5ecd7'; ctx.fillRect(34, 4, 12, 20); ctx.strokeRect(34, 4, 12, 20);
      const fl = Math.sin(t * 15) * 1.5;
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.moveTo(40 + fl, -8); ctx.quadraticCurveTo(47, 2, 40, 5); ctx.quadraticCurveTo(33, 2, 40 + fl, -8); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case 'horns':
      ctx.fillStyle = '#ff2e55'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, 22); ctx.bezierCurveTo(14, 10, 16, 2, 22, -2); ctx.bezierCurveTo(22, 8, 28, 14, 30, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(58, 22); ctx.bezierCurveTo(66, 10, 64, 2, 58, -2); ctx.bezierCurveTo(58, 8, 52, 14, 50, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color = '#f5ecd7') {
  ctx.save();
  ctx.font = '16px Bangers, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}

/** Mobilier fouillable. `glow` = surbrillance quand le joueur est à portée. */
export function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, glow: boolean) {
  ctx.save();
  ctx.translate(f.x, f.y);
  if (glow) { ctx.shadowColor = '#7dff3a'; ctx.shadowBlur = 25; }
  line(ctx, 4);
  switch (f.kind) {
    case 'shelf':
      ctx.fillStyle = '#5a3520'; ctx.fillRect(-60, -28, 120, 56); ctx.strokeRect(-60, -28, 120, 56);
      ctx.shadowBlur = 0;
      ['#8b2cff', '#c51111', '#117f2d', '#ef7d0d', '#132ed1', '#f5f557'].forEach((col, i) => {
        ctx.fillStyle = col; ctx.fillRect(-54 + i * 18, -22, 12, 20); ctx.strokeRect(-54 + i * 18, -22, 12, 20);
        ctx.fillStyle = col; ctx.fillRect(-50 + i * 17, 4, 11, 18); ctx.strokeRect(-50 + i * 17, 4, 11, 18);
      });
      break;
    case 'chest':
      ctx.fillStyle = '#7a4a22'; roundRect(ctx, -30, -20, 60, 40, 6); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffd23a'; ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
      ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(30, -4); ctx.stroke();
      break;
    case 'barrel':
      ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'stove':
      ctx.fillStyle = '#3f474e'; ctx.fillRect(-36, -30, 72, 60); ctx.strokeRect(-36, -30, 72, 60);
      ctx.shadowBlur = 0; ctx.fillStyle = '#ff7a1a';
      ctx.beginPath(); ctx.arc(-14, -12, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(14, -12, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'crate':
      ctx.fillStyle = '#9b6b3c'; ctx.fillRect(-24, -24, 48, 48); ctx.strokeRect(-24, -24, 48, 48);
      ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(24, 24); ctx.moveTo(24, -24); ctx.lineTo(-24, 24); ctx.stroke();
      break;
    case 'wardrobe':
      ctx.fillStyle = '#4a2a18'; ctx.fillRect(-34, -40, 68, 80); ctx.strokeRect(-34, -40, 68, 80);
      ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 40); ctx.stroke();
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(-8, -4, 5, 8); ctx.fillRect(3, -4, 5, 8);
      break;
  }
  ctx.restore();
}

/** Table de rituel ronde avec pentagramme, places et aura si une partie est en cours. */
export function drawRitualTable(ctx: CanvasRenderingContext2D, x: number, y: number, maxSeats: number, seated: number, active: boolean, glow: boolean, t: number) {
  ctx.save();
  ctx.translate(x, y);
  // chaises
  for (let i = 0; i < maxSeats; i++) {
    const a = (i / maxSeats) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(Math.cos(a) * 62, Math.sin(a) * 62);
    line(ctx, 3);
    ctx.fillStyle = i < seated ? '#8b2cff' : '#3a2440';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (active) { ctx.shadowColor = '#7dff3a'; ctx.shadowBlur = 30 + Math.sin(t * 4) * 10; }
  else if (glow) { ctx.shadowColor = '#c86bff'; ctx.shadowBlur = 25; }
  line(ctx, 5);
  ctx.fillStyle = '#3b1f12';
  ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // pentagramme
  ctx.strokeStyle = active ? '#7dff3a' : '#c86bff'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = ((i * 2) / 5) * Math.PI * 2 - Math.PI / 2 + (active ? t * 0.5 : 0);
    const px = Math.cos(a) * 32, py = Math.sin(a) * 32;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function drawBell(ctx: CanvasRenderingContext2D, x: number, y: number, glow: boolean, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1a0d1f'; line(ctx, 5);
  ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.rotate(Math.sin(t * 3) * 0.05);
  if (glow) { ctx.shadowColor = '#ff2e55'; ctx.shadowBlur = 30; }
  ctx.fillStyle = '#ffcf3a';
  ctx.beginPath(); ctx.moveTo(-30, 20); ctx.quadraticCurveTo(-28, -30, 0, -34); ctx.quadraticCurveTo(28, -30, 30, 20); ctx.lineTo(36, 26); ctx.lineTo(-36, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff2e55'; ctx.beginPath(); ctx.arc(0, 30, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3) * 6);
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = '#7dff3a'; ctx.shadowBlur = 30;
  line(ctx, 5);
  ctx.fillStyle = '#e8fff0';
  ctx.beginPath();
  ctx.moveTo(-30, 30);
  ctx.bezierCurveTo(-34, -50, 34, -50, 30, 30);
  for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(30 - i * 15 - 7.5, 30 + (i % 2 ? -10 : 12) + Math.sin(t * 8 + i) * 3, 30 - (i + 1) * 15, 30);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(-11, -10, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, -10, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 10, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Onomatopée BD dans le monde (étoile éclatée + texte incliné). `p` = progression 0..1. */
export function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: number, color = '#ffd23a') {
  const scale = p < 0.2 ? p / 0.2 * 1.2 : p < 0.3 ? 1.2 - (p - 0.2) * 2 : 1;
  ctx.save();
  ctx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1;
  ctx.translate(x, y - 50 - p * 30);
  ctx.rotate(-0.08);
  ctx.scale(scale, scale);
  ctx.font = '34px Bangers, Impact, sans-serif';
  const w = Math.max(90, ctx.measureText(text).width + 40);
  line(ctx, 5);
  ctx.fillStyle = color;
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.75 : 1;
    const px = Math.cos(a) * (w / 2) * r, py = Math.sin(a) * 38 * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeText(text, 0, 2);
  ctx.fillStyle = '#fff'; ctx.fillText(text, 0, 2);
  ctx.restore();
}
