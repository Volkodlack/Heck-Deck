/** Réunion d'urgence : vote style "déduction sociale" (timer 60 s, suspect ou passer). */
import { useEffect, useState } from 'react';
import { serverNow, socket, useGame } from '../lib/socket';
import Avatar from './Avatar';
import ChatBox from './ChatBox';
import { SFX } from '../game/SoundEffects';

export default function VoteModal() {
  const { state, me } = useGame();
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(i); }, []);
  if (!state?.meeting) return null;
  const m = state.meeting;
  const self = state.players.find((p) => p.id === socket.id);
  const iVoted = m.votedIds.includes(socket.id ?? '');
  const canVote = !!self?.alive && !iVoted && !m.result;
  const remaining = Math.max(0, Math.ceil((m.endsAt - serverNow()) / 1000));
  const caller = state.players.find((p) => p.id === m.calledBy);
  const vote = (id: string) => { SFX.vote(); socket.emit('vote', id); };

  return (
    <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center p-3">
      <div className="grid gap-3 md:grid-cols-3 w-full max-w-6xl h-full max-h-[700px]">
        <div className="panel p-4 md:col-span-2 flex flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="font-comic text-4xl text-blood comic-stroke -rotate-2">RÉUNION D’URGENCE !</h2>
            <span className={`font-pixel text-xl ${remaining <= 10 ? 'text-blood animate-pulse' : 'text-toxic'}`}>{m.result ? 'RÉSULTAT' : `${remaining}s`}</span>
          </div>
          <p className="text-sm opacity-80">{caller?.name} a sonné la cloche. Qui est Possédé ? {me?.role === 'possessed' && <b className="text-blood">(Fais-toi discret…)</b>}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {state.players.filter((p) => p.connected || !p.alive).map((p) => {
              const votes = m.result?.tally[p.id] ?? 0;
              const eliminated = m.result?.eliminated === p.id;
              return (
                <button key={p.id} disabled={!canVote || !p.alive} onClick={() => vote(p.id)}
                  className={`relative bg-ink border-4 border-black rounded-lg p-2 flex flex-col items-center gap-1 shadow-hard-sm transition-transform hover:enabled:-rotate-2 hover:enabled:border-blood ${p.alive ? '' : 'opacity-40'} ${eliminated ? 'ring-4 ring-blood animate-shake' : ''}`}>
                  <Avatar cosmetics={p.cosmetics} size={52} dead={!p.alive} />
                  <span className="font-comic text-lg truncate max-w-full">{p.name}</span>
                  {m.votedIds.includes(p.id) && !m.result && <span className="absolute top-1 right-1 font-pixel text-[8px] bg-toxic text-black px-1 rounded">A VOTÉ</span>}
                  {m.result && votes > 0 && <span className="absolute top-1 right-1 font-pixel text-[10px] bg-blood px-1 rounded">{votes}</span>}
                  {p.revealedRole && <span className="font-pixel text-[8px] text-hexviolet">{p.revealedRole.toUpperCase()}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-auto">
            <button className="btn-ghost" disabled={!canVote} onClick={() => vote('skip')}>PASSER LE VOTE {m.result?.tally.skip ? `(${m.result.tally.skip})` : ''}</button>
            {iVoted && !m.result && <span className="font-comic text-xl text-toxic">Vote enregistré !</span>}
            {!self?.alive && <span className="font-comic text-xl opacity-70">Les fantômes ne votent pas.</span>}
            {m.result && (
              <span className="font-comic text-2xl comic-stroke">
                {m.result.eliminated ? `${state.players.find((p) => p.id === m.result!.eliminated)?.name} part au Placard à Balais !` : 'Personne n’est éliminé.'}
              </span>
            )}
          </div>
        </div>
        <ChatBox className="min-h-[200px]" disabled={!self?.alive} />
      </div>
    </div>
  );
}
