/**
 * Carte à jouer SVG stylisée (comics) : contour noir épais, ombre dure, coins arrondis.
 * Cartes Maudites (As, 2) : aura verte toxique animée. Poltergeist (Joker) : illustration procédurale.
 */
import { RANK_LABEL, SUIT_SYMBOL, isHex, type Card } from '@shared';

const SUIT_COLOR: Record<string, string> = { H: '#e0123a', D: '#e0123a', S: '#141414', C: '#141414', X: '#6b2fbb' };

interface Props {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  width?: number;
  style?: React.CSSProperties;
}

export default function PlayingCard({ card, faceDown, selected, disabled, onClick, width = 74, style }: Props) {
  const hex = card && isHex(card);
  const h = width * 1.4;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative shrink-0 rounded-[10px] transition-transform duration-150 ${selected ? '-translate-y-5 rotate-2' : 'hover:-translate-y-2'} ${hex && !faceDown ? 'animate-aura' : ''} disabled:cursor-default`}
      style={{ width, height: h, ...style }}
      aria-label={card ? `${RANK_LABEL[card.rank]} ${card.suit}` : 'carte'}
    >
      <svg viewBox="0 0 100 140" width={width} height={h} className="drop-shadow-[4px_4px_0_#000]">
        <defs>
          <pattern id="hx-back" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill="#2b1a40" />
            <rect width="7" height="14" fill="#3a2458" />
          </pattern>
          <radialGradient id="hx-toxic" cx=".5" cy=".5" r=".7">
            <stop offset="0" stopColor="#eaffd6" />
            <stop offset="1" stopColor="#b9ff8a" />
          </radialGradient>
        </defs>
        {faceDown || !card ? (
          <g>
            <rect x="3" y="3" width="94" height="134" rx="10" fill="url(#hx-back)" stroke="#000" strokeWidth="5" />
            <rect x="14" y="14" width="72" height="112" rx="6" fill="none" stroke="#7dff3a" strokeWidth="3" />
            <text x="50" y="80" textAnchor="middle" fontFamily="Bangers, Impact" fontSize="30" fill="#7dff3a" stroke="#000" strokeWidth="2" paintOrder="stroke">HEX</text>
          </g>
        ) : card.rank === 16 ? (
          <g>
            <rect x="3" y="3" width="94" height="134" rx="10" fill="#e8dcff" stroke="#000" strokeWidth="5" />
            {/* Poltergeist procédural */}
            <path d="M28 105 C22 40 78 40 72 105 Q66 96 60 105 Q54 96 50 105 Q44 96 40 105 Q34 96 28 105 Z" fill="#fff" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
            <ellipse cx="42" cy="66" rx="5" ry="8" fill="#000" />
            <ellipse cx="58" cy="66" rx="5" ry="8" fill="#000" />
            <ellipse cx="50" cy="84" rx="6" ry="8" fill="#000" />
            <text x="50" y="30" textAnchor="middle" fontFamily="Bangers, Impact" fontSize="17" fill="#6b2fbb" stroke="#000" strokeWidth="1" paintOrder="stroke">POLTERGEIST</text>
            <text x="50" y="128" textAnchor="middle" fontFamily="Bangers, Impact" fontSize="12" fill="#000">BRÛLE LE PLI</text>
          </g>
        ) : (
          <g>
            <rect x="3" y="3" width="94" height="134" rx="10" fill={hex ? 'url(#hx-toxic)' : '#f5ecd7'} stroke={hex ? '#1f5f00' : '#000'} strokeWidth="5" />
            <text x="12" y="30" fontFamily="Bangers, Impact" fontSize="26" fill={SUIT_COLOR[card.suit]} stroke="#000" strokeWidth="1" paintOrder="stroke">{RANK_LABEL[card.rank]}</text>
            <text x="12" y="50" fontSize="20" fill={SUIT_COLOR[card.suit]}>{SUIT_SYMBOL[card.suit]}</text>
            <g transform="rotate(180 50 70)">
              <text x="12" y="30" fontFamily="Bangers, Impact" fontSize="26" fill={SUIT_COLOR[card.suit]} stroke="#000" strokeWidth="1" paintOrder="stroke">{RANK_LABEL[card.rank]}</text>
              <text x="12" y="50" fontSize="20" fill={SUIT_COLOR[card.suit]}>{SUIT_SYMBOL[card.suit]}</text>
            </g>
            <text x="50" y="88" textAnchor="middle" fontSize="48" fill={SUIT_COLOR[card.suit]} stroke="#000" strokeWidth="2" paintOrder="stroke">{SUIT_SYMBOL[card.suit]}</text>
            {hex && <text x="50" y="118" textAnchor="middle" fontFamily="Bangers, Impact" fontSize="13" fill="#1f5f00">☠ MAUDITE ☠</text>}
          </g>
        )}
        {selected && <rect x="3" y="3" width="94" height="134" rx="10" fill="none" stroke="#8b2cff" strokeWidth="6" />}
      </svg>
    </button>
  );
}
