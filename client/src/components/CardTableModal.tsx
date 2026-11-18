/**
 * Ronde de Défausse (jeu du Puant) à une Table de Rituel.
 * La validation affichée ici n'est qu'une AIDE : le serveur revalide chaque coup.
 */
import { useEffect, useMemo, useState } from 'react';
import { RANK_LABEL, cardLabel, sortHand, validatePlay, type PlayerPublic } from '@shared';
import { socket, useGame } from '../lib/socket';
import PlayingCard from './PlayingCard';
import Avatar from './Avatar';
import { ComicBurst, fxColor } from './ComicFx';

export default function CardTableModal() {
  const { state, me, fx } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const self = state?.players.find((p) => p.id === socket.id);
  const table = state?.tables.find((t) => t.id === self?.seatedAt);
  const hand = useMemo(() => sortHand(me?.hand ?? []), [me?.hand]);

  // Nettoie la sélection si des cartes ont quitté la main.
  useEffect(() => { setSelected((s) => s.filter((id) => hand.some((c) => c.id === id))); }, [hand]);

  if (!state || !self || !table || !me) return null;
  const byId = (id: string) => state.players.find((p) => p.id === id) as PlayerPublic | undefined;
  const myTurn = table.turn === self.id && table.active;
  const chosen = hand.filter((c) => selected.includes(c.id));
  const check = chosen.length ? validatePlay(chosen, table.lastPlay) : null;
  const opponents = table.seats.filter((s) => s !== self.id).map(byId).filter(Boolean) as PlayerPublic[];
  const tableFx = fx.filter((f) => f.tableId === table.id && f.text);

  const toggle = (id: string) => {
    const card = hand.find((c) => c.id === id)!;
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      const first = hand.find((c) => c.id === s[0]);
      return first && first.rank === card.rank ? [...s, id] : [id];
    });
  };

  const play = () => { socket.emit('table:play', selected); setSelected([]); };

  return (
    <div className="compact-ui absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-2">
      <div className="panel w-full max-w-5xl h-full max-h-[720px] flex flex-col relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #2a5a2a 0%, #123012 55%, #0b1a0b 100%)' }}>
        {/* Bandeau */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b-4 border-black">
          <h2 className="font-comic text-2xl text-toxic comic-stroke">RONDE DE DÉFAUSSE</h2>
          <span className="font-pixel text-[10px]">{table.active ? (myTurn ? '▶ À TOI DE JOUER' : `Tour de ${byId(table.turn ?? '')?.name ?? '…'}`) : 'En attente d’un 2ᵉ joueur…'}</span>
          <button className="btn-blood !text-base !py-1" onClick={() => socket.emit('table:leave')}>QUITTER LA TABLE</button>
        </div>

        {/* Adversaires */}
        <div className="flex justify-center gap-8 pt-4 flex-wrap">
          {opponents.map((p) => (
            <div key={p.id} className={`flex flex-col items-center ${table.turn === p.id ? 'scale-110' : 'opacity-80'} transition-transform`}>
              <Avatar cosmetics={p.cosmetics} size={44} />
              <span className={`font-comic text-lg ${table.turn === p.id ? 'text-toxic' : ''}`}>{p.name}{table.passed.includes(p.id) ? ' (passe)' : ''}</span>
              <div className="flex -space-x-7 mt-1">
                {Array.from({ length: Math.min(p.handCount, 10) }).map((_, i) => <PlayingCard key={i} faceDown width={38} />)}
              </div>
              <span className="font-pixel text-[9px] mt-1">{p.handCount} carte(s)</span>
            </div>
          ))}
        </div>

        {/* Pli central */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 relative">
          {table.lastPlay ? (
            <>
              <div className="flex gap-2 -rotate-3">
                {table.lastPlay.cards.map((c) => <PlayingCard key={c.id} card={c} width={80} />)}
              </div>
              <span className="font-comic text-lg bg-black/60 px-3 rounded">posé par {byId(table.lastPlay.playerId)?.name}</span>
            </>
          ) : (
            <span className="font-comic text-3xl opacity-60 comic-stroke">{myTurn ? 'OUVRE LE PLI !' : 'Pli vide'}</span>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {tableFx.slice(-1).map((f) => <ComicBurst key={f.key} text={f.text!} color={fxColor(f.type)} />)}
          </div>
        </div>

        {/* Ma main */}
        <div className="bg-black/50 border-t-4 border-black p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-sm">
              {check ? (check.ok ? <span className="text-toxic">{check.burns ? '💥 Ce coup brûle le pli !' : `Pose : ${chosen.map(cardLabel).join(' ')}`}</span> : <span className="text-blood">{check.reason}</span>)
                : table.lastPlay ? `Bats ${table.lastPlay.cards.length}× ${RANK_LABEL[table.lastPlay.cards[0].rank]} ou passe. Les 2 et Poltergeists brûlent le pli.` : 'Choisis 1 à 4 cartes de même valeur.'}
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost !text-base !py-1" disabled={!myTurn || !table.lastPlay} onClick={() => socket.emit('table:pass')}>PASSER</button>
              <button className="btn-toxic !text-base !py-1" disabled={!myTurn || !check?.ok} onClick={play}>JOUER</button>
            </div>
          </div>
          <div className="flex justify-center -space-x-6 overflow-x-auto pt-6 pb-1">
            {hand.map((c) => <PlayingCard key={c.id} card={c} selected={selected.includes(c.id)} onClick={() => toggle(c.id)} />)}
          </div>
          <p className="text-[11px] opacity-60 text-center mt-1">Astuce : finir sa main sur un As ou un 2 (carte maudite) déclenche une Malédiction (+20 % de Panique).</p>
        </div>
      </div>
    </div>
  );
}
