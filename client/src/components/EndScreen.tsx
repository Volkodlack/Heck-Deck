/** Écran de fin : camp vainqueur, révélation de tous les rôles, rejouer. */
import { resetRoom, socket, useGame } from '../lib/socket';
import Avatar from './Avatar';
import { ComicBurst } from './ComicFx';

const SIDE = { survivors: 'LES SURVIVANTS GAGNENT', possessed: 'LES POSSÉDÉS GAGNENT', ghost: 'LE FANTÔME GAGNE', player: 'VICTOIRE' } as const;
const ROLE_FR = { survivor: 'Survivant', possessed: 'Possédé', medium: 'Médium', skirmisher: 'Joueur' } as const;

export default function EndScreen() {
  const { state } = useGame();
  if (!state?.winner) return null;
  const w = state.winner;
  const iWon = w.playerIds.includes(socket.id ?? '');
  const isHost = state.hostId === socket.id;
  return (
    <div className="compact-ui absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4 p-4">
      <ComicBurst text={iWon ? 'VICTOIRE!' : 'DÉFAITE…'} color={iWon ? '#7dff3a' : '#ff2e55'} size={1.4} />
      <h2 className="font-comic text-4xl comic-stroke text-center">{SIDE[w.side]}</h2>
      <p className="opacity-80 text-center">{w.reason}</p>
      <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
        {state.players.map((p) => (
          <div key={p.id} className={`panel p-2 flex flex-col items-center w-32 ${w.playerIds.includes(p.id) ? 'ring-4 ring-toxic' : ''}`}>
            <Avatar cosmetics={p.cosmetics} size={48} dead={!p.alive} />
            <span className="font-comic text-lg truncate max-w-full">{p.name}</span>
            <span className={`font-pixel text-[8px] ${p.revealedRole === 'possessed' ? 'text-blood' : 'text-toxic'}`}>{p.revealedRole ? ROLE_FR[p.revealedRole] : '?'}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {isHost && <button className="btn-toxic" onClick={() => socket.emit('lobby:start')}>REJOUER</button>}
        <button className="btn-ghost" onClick={() => { socket.emit('lobby:leave'); resetRoom(); }}>QUITTER</button>
      </div>
      {!isHost && <p className="text-sm opacity-60">L’hôte peut relancer une partie.</p>}
    </div>
  );
}
