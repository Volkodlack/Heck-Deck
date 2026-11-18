import type { Cosmetics } from '@shared';
import Avatar, { HATS, PALETTE } from './Avatar';

export default function CosmeticsPicker({ value, onChange, unlockedHats }: { value: Cosmetics; onChange: (c: Cosmetics) => void; unlockedHats?: string[] }) {
  // En mode invité tout est disponible ; avec un compte, seuls les chapeaux débloqués (+ "none").
  const hats = unlockedHats ? HATS.filter((h) => h.id === 'none' || unlockedHats.includes(h.id)) : HATS;
  return (
    <div className="flex gap-4 items-center">
      <div className="animate-float"><Avatar cosmetics={value} size={72} /></div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1 max-w-[220px]">
          {PALETTE.map((c) => (
            <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => onChange({ ...value, color: c })}
              className={`w-7 h-7 rounded-full border-4 ${value.color === c ? 'border-toxic scale-110' : 'border-black'}`} style={{ background: c }} />
          ))}
        </div>
        <select className="input !py-1 text-sm" value={value.hat} onChange={(e) => onChange({ ...value, hat: e.target.value as Cosmetics['hat'] })}>
          {hats.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </div>
    </div>
  );
}
