/**
 * Logo HEX DECK — SVG 100 % procédural, style comics/arcade façon Scott Pilgrim :
 * lettres inclinées, contour noir épais, ombre portée dure, dégradé néon violet → vert toxique.
 */
export default function Logo({ className = '', small = false }: { className?: string; small?: boolean }) {
  return (
    <svg viewBox="0 0 640 220" className={className} role="img" aria-label="HEX DECK" style={{ maxWidth: small ? 260 : 620 }}>
      <defs>
        <linearGradient id="hx-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c86bff" />
          <stop offset=".45" stopColor="#8b2cff" />
          <stop offset=".55" stopColor="#3dff8f" />
          <stop offset="1" stopColor="#b6ff3a" />
        </linearGradient>
        <linearGradient id="hx-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="hx-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Éclat de fond façon onomatopée */}
      <polygon
        points="40,120 90,40 150,80 210,10 260,70 330,20 380,75 460,15 500,80 600,50 560,120 620,180 520,170 470,215 400,175 320,210 260,170 180,205 140,165 50,195 80,140"
        fill="#140c1c" stroke="#000" strokeWidth="8" strokeLinejoin="round"
      />

      <g transform="skewX(-12) translate(40 0)" fontFamily="Bangers, Impact, sans-serif" fontSize="118" textAnchor="middle" letterSpacing="4">
        {/* Ombre portée dure */}
        <text x="330" y="158" fill="#000" stroke="#000" strokeWidth="18" strokeLinejoin="round" transform="translate(10 10)">HEX DECK</text>
        {/* Contour épais */}
        <text x="330" y="158" fill="none" stroke="#000" strokeWidth="18" strokeLinejoin="round">HEX DECK</text>
        {/* Remplissage néon */}
        <text x="330" y="158" fill="url(#hx-grad)" filter="url(#hx-glow)">HEX DECK</text>
        <text x="330" y="158" fill="url(#hx-shine)">HEX DECK</text>
      </g>

      {/* Petites étincelles toxiques */}
      {[[70, 70], [590, 40], [560, 190], [110, 190]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 14} L${x + 4} ${y - 4} L${x + 14} ${y} L${x + 4} ${y + 4} L${x} ${y + 14} L${x - 4} ${y + 4} L${x - 14} ${y} L${x - 4} ${y - 4} Z`}
          fill={i % 2 ? '#7dff3a' : '#c86bff'} stroke="#000" strokeWidth="3" />
      ))}
    </svg>
  );
}
