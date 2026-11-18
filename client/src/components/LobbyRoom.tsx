/** Salle d'attente : code de salle, joueurs, réglages (hôte), cosmétiques et chat d'avant-partie. */
import Logo from './Logo';
import Avatar from './Avatar';
import ChatBox from './ChatBox';
import CosmeticsPicker from './CosmeticsPicker';
import { resetRoom, socket, toast, useGame } from '../lib/socket';
import { rolePlan, type Cosmetics } from '@shared';

export default function LobbyRoom({ cosmetics, onCosmetics }: { cosmetics: Cosmetics; onCosmetics: (c: Cosmetics) => void }) {
  const { state } = useGame();
  if (!state) return null;
  const isHost = state.hostId === socket.id;
  const players = state.players.filter((p) => p.connected);
  const plan = rolePlan(players.length, state.settings.mediumEnabled);
  const modeLabel = players.length < 2 ? 'En attente de joueurs…'
    : plan.skirmish ? 'ESCARMOUCHE — le Fantôme IA patrouille'
    : `${plan.possessed} POSSÉDÉ${plan.possessed > 1 ? 'S' : ''}${plan.medium ? ' + 1 MÉDIUM' : ''}`;

  const copy = () => { navigator.clipboard?.writeText(state.code); toast('Code copié !'); };

  return (
    <div className="h-full flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <Logo small className="w-60" />
        <button onClick={copy} className="panel px-5 py-2 font-pixel text-2xl tracking-[0.3em] text-toxic hover:rotate-1" title="Copier le code">
          {state.code}
        </button>
        <button className="btn-ghost !text-base" onClick={() => { socket.emit('lobby:leave'); resetRoom(); }}>QUITTER</button>
      </header>

      <div className="grid gap-4 md:grid-cols-3 flex-1 min-h-0">
        <section className="panel p-4 md:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-comic text-3xl comic-stroke">JOUEURS {players.length}/{state.settings.maxPlayers}</h2>
            <span className="font-pixel text-[10px] text-toxic">{modeLabel}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 overflow-y-auto">
            {players.map((p) => (
              <div key={p.id} className={`bg-ink border-4 border-black rounded-lg p-2 flex flex-col items-center ${p.id === socket.id ? 'ring-4 ring-toxic' : ''}`}>
                <Avatar cosmetics={p.cosmetics} size={56} />
                <span className="font-comic text-lg truncate max-w-full">{p.name}</span>
                {p.isHost && <span className="font-pixel text-[8px] text-hexviolet">HÔTE</span>}
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-end gap-6 justify-between">
            <div>
              <p className="label mb-2">Ton personnage</p>
              <CosmeticsPicker value={cosmetics} onChange={(c) => { onCosmetics(c); socket.emit('lobby:cosmetics', c); }} />
            </div>
            {isHost ? (
              <div className="flex flex-col gap-2">
                <label className="label">Joueurs max : {state.settings.maxPlayers}</label>
                <input type="range" min={2} max={8} value={state.settings.maxPlayers}
                  onChange={(e) => socket.emit('lobby:settings', { maxPlayers: Number(e.target.value) })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={state.settings.mediumEnabled} onChange={(e) => socket.emit('lobby:settings', { mediumEnabled: e.target.checked })} />
                  Rôle neutre « Médium » (6+ joueurs)
                </label>
                <button className="btn-toxic" disabled={players.length < 2} onClick={() => socket.emit('lobby:start')}>LANCER LA PARTIE</button>
              </div>
            ) : (
              <p className="font-comic text-xl opacity-80 animate-pulse">L’hôte prépare le rituel…</p>
            )}
          </div>
        </section>
        <ChatBox className="min-h-[240px]" />
      </div>
    </div>
  );
}
