/** Écran de jeu : canvas + HUD + bascule vers le plateau de cartes / le vote / la fin. */
import { useState } from 'react';
import GameCanvas, { type Prompt } from '../game/GameCanvas';
import { socket, useGame } from '../lib/socket';
import HUD from './HUD';
import CardTableModal from './CardTableModal';
import VoteModal from './VoteModal';
import EndScreen from './EndScreen';
import Tutorial from './Tutorial';
import TouchControls from './TouchControls';
import { isTouchDevice } from '../game/touch';
import type { Session } from '../lib/session';

export default function GameScreen({ session }: { session: Session | null }) {
  const { state, tutorial } = useGame();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  if (!state) return null;
  const self = state.players.find((p) => p.id === socket.id);
  const seated = !!self?.seatedAt;
  const meeting = state.phase === 'meeting';
  const ended = state.phase === 'ended';

  return (
    <div className={`relative w-full h-full overflow-hidden ${state.sabotage.lightsOutUntil > state.now ? 'animate-shake' : ''}`}>
      <GameCanvas inputLocked={seated || meeting || ended} onPrompt={setPrompt} />
      <HUD prompt={seated || meeting ? null : prompt} />
      {isTouchDevice() && <TouchControls hidden={seated || meeting || ended} />}
      {seated && state.phase === 'explore' && <CardTableModal />}
      {meeting && <VoteModal />}
      {ended && <EndScreen />}
      {tutorial && <Tutorial session={session} />}
    </div>
  );
}
