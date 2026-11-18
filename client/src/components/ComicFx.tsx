/** Onomatopée BD en overlay DOM (SVG) : "BOUM!", "SABOTAGE!", "HEXED!"… */
export function ComicBurst({ text, color = '#ffd23a', size = 1 }: { text: string; color?: string; size?: number }) {
  const spikes = 16;
  const pts = Array.from({ length: spikes * 2 }, (_, i) => {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 62 : 100;
    return `${150 + Math.cos(a) * r * 1.4},${100 + Math.sin(a) * r * 0.85}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 300 200" className="animate-pop pointer-events-none" style={{ width: 320 * size }}>
      <polygon points={pts} fill="#000" transform="translate(8 8)" />
      <polygon points={pts} fill={color} stroke="#000" strokeWidth="7" strokeLinejoin="round" />
      <text x="150" y="118" textAnchor="middle" fontFamily="Bangers, Impact" fontSize={text.length > 10 ? 34 : 50} fill="#fff" stroke="#000" strokeWidth="8" paintOrder="stroke" transform="rotate(-6 150 100)">
        {text}
      </text>
    </svg>
  );
}

const COLORS: Record<string, string> = { boom: '#ff7a1a', sabotage: '#ff2e55', curse: '#7dff3a', bell: '#ffcf3a', eliminated: '#8b2cff', win: '#7dff3a', hexed: '#7dff3a' };
export const fxColor = (type: string) => COLORS[type] ?? '#ffd23a';
