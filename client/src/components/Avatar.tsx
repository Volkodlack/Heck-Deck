/**
 * Personnage modulable (silhouette "haricot" avec visière) en SVG inline.
 * Original et procédural : couleur + chapeau = cosmétiques du profil.
 */
import type { Cosmetics } from '@shared';

export const PALETTE = ['#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ef7d0d', '#f5f557', '#3f474e', '#d6e0f0', '#6b2fbb', '#71491e', '#38fedc', '#50ef39'];
export const HATS: { id: Cosmetics['hat']; label: string }[] = [
  { id: 'none', label: 'Aucun' },
  { id: 'tophat', label: 'Haut-de-forme' },
  { id: 'witch', label: 'Sorcière' },
  { id: 'candle', label: 'Bougie' },
  { id: 'horns', label: 'Cornes' },
];

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function HatSvg({ hat }: { hat: Cosmetics['hat'] }) {
  switch (hat) {
    case 'tophat':
      return <g><rect x="22" y="2" width="36" height="22" fill="#151515" stroke="#000" strokeWidth="4" /><rect x="14" y="20" width="52" height="7" rx="3" fill="#151515" stroke="#000" strokeWidth="4" /><rect x="22" y="14" width="36" height="5" fill="#8b2cff" /></g>;
    case 'witch':
      return <g><path d="M40 -14 L60 22 L20 22 Z" fill="#2b1a40" stroke="#000" strokeWidth="4" strokeLinejoin="round" /><rect x="10" y="19" width="60" height="7" rx="3" fill="#2b1a40" stroke="#000" strokeWidth="4" /></g>;
    case 'candle':
      return <g><rect x="34" y="4" width="12" height="20" fill="#f5ecd7" stroke="#000" strokeWidth="3" /><path d="M40 -8 C46 0 44 4 40 5 C36 4 34 0 40 -8 Z" fill="#ffd23a" stroke="#000" strokeWidth="2" /></g>;
    case 'horns':
      return <g fill="#ff2e55" stroke="#000" strokeWidth="3"><path d="M22 22 C14 10 16 2 22 -2 C22 8 28 14 30 20 Z" /><path d="M58 22 C66 10 64 2 58 -2 C58 8 52 14 50 20 Z" /></g>;
    default:
      return null;
  }
}

export default function Avatar({ cosmetics, size = 64, dead = false, flip = false }: { cosmetics: Cosmetics; size?: number; dead?: boolean; flip?: boolean }) {
  const { color, hat } = cosmetics;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 -16 80 108" style={{ transform: flip ? 'scaleX(-1)' : undefined, opacity: dead ? 0.45 : 1 }}>
      {/* sac à dos */}
      <rect x="2" y="34" width="16" height="32" rx="6" fill={shade(color, -50)} stroke="#000" strokeWidth="4" />
      {/* corps */}
      <path d="M16 30 C16 8 64 8 64 30 L64 78 C64 84 52 84 52 78 L52 72 L30 72 L30 78 C30 84 16 84 16 78 Z" fill={color} stroke="#000" strokeWidth="5" strokeLinejoin="round" />
      <path d="M22 28 C24 16 40 14 48 16" stroke={shade(color, 60)} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* visière */}
      <rect x="36" y="26" width="34" height="20" rx="10" fill="#9fe6ff" stroke="#000" strokeWidth="4" />
      <rect x="44" y="30" width="14" height="5" rx="2.5" fill="#fff" opacity=".85" />
      {dead && <path d="M42 30 L62 44 M62 30 L42 44" stroke="#000" strokeWidth="4" />}
      <g transform="translate(0 -8)"><HatSvg hat={hat} /></g>
    </svg>
  );
}
