/**
 * Tutoriel interactif (premier lancement) : une vraie partie hors-ligne contre 3 bots,
 * avec des étapes qui se valident toutes seules en observant ce que fait le joueur.
 */
import { useEffect, useRef, useState } from 'react';
import { onFx, resetRoom, socket, useGame } from '../lib/socket';
import { markTutorialDone } from '../lib/progress';
import type { Session } from '../lib/session';
import { isTouchDevice } from '../game/touch';

// Sur mobile : en haut au centre (les boutons d'action sont en bas à droite)
const POS = () => (isTouchDevice() ? 'top-16 left-1/2 -translate-x-1/2' : 'top-28 right-3');

interface Ctx { moved: number; searched: boolean; seated: boolean; played: number; leftTable: boolean; meeting: boolean; voted: boolean }

const STEPS: { title: string; text: string; done: (c: Ctx) => boolean }[] = [
  { title: 'Bienvenue au manoir', text: 'Déplace-toi avec ZQSD (WASD ou les flèches). Ta lampe n’éclaire qu’autour de toi : le reste du manoir est plongé dans le noir.', done: (c) => c.moved > 180 },
  { title: 'Fouille les meubles', text: 'Approche-toi d’un meuble jusqu’à ce qu’il brille en vert, puis appuie sur E. Tu peux trouver une Lampe UV, du Sel, ou échanger ta pire carte.', done: (c) => c.searched },
  { title: 'Table de Rituel', text: 'Trouve une table ronde marquée d’un pentagramme et assieds-toi avec E. Dès qu’un autre joueur s’assoit, la ronde de cartes commence.', done: (c) => c.seated },
  { title: 'La Ronde de Défausse', text: 'Pose une carte, une paire ou un brelan PLUS FORT que le coup précédent, ou passe. Les 2 et les Poltergeists brûlent le pli (BOUM!) et te font rejouer. Pose 2 fois pour continuer.', done: (c) => c.played >= 2 },
  { title: 'Attention aux cartes Maudites', text: 'Les As et les 2 sont Maudits : si tu vides ta main en finissant sur l’un d’eux, la Panique du manoir grimpe de 20 %. Quitte maintenant la table (bouton rouge en haut).', done: (c) => c.leftTable },
  { title: 'Il y a un Possédé parmi nous', text: 'Un bot est Possédé : il sabote et refile des cartes Maudites en douce. Va dans le Hall et sonne la Cloche (E) pour convoquer une réunion.', done: (c) => c.meeting },
  { title: 'Le vote', text: 'Discute dans le chat et vote pour ton suspect, ou passe le vote. Celui qui a la majorité finit au Placard à Balais et son rôle est révélé.', done: (c) => c.voted },
  { title: 'Tu es prêt !', text: 'Survivants : videz vos mains ou démasquez les Possédés avant que la Panique n’atteigne 100 %. Tu peux finir cette partie ou retourner au menu.', done: () => false },
];

export default function Tutorial({ session }: { session: Session | null }) {
  const { state, me } = useGame();
  const [step, setStep] = useState(0);
  const [hidden, setHidden] = useState(false);
  const ctx = useRef<Ctx>({ moved: 0, searched: false, seated: false, played: 0, leftTable: false, meeting: false, voted: false });
  const last = useRef<{ x: number; y: number; hand: number; seated: boolean } | null>(null);

  useEffect(() => onFx((f) => { if (f.type === 'search' && (!f.only || f.only === socket.id)) ctx.current.searched = true; }), []);

  // Observation de l'état du jeu
  useEffect(() => {
    const self = state?.players.find((p) => p.id === socket.id);
    if (!state || !self || !me) return;
    const c = ctx.current;
    const l = last.current;
    if (l) {
      if (!self.seatedAt && !l.seated) c.moved += Math.hypot(self.x - l.x, self.y - l.y);
      if (self.seatedAt && me.hand.length < l.hand) c.played++;
      if (l.seated && !self.seatedAt && c.played > 0) c.leftTable = true;
    }
    if (self.seatedAt) c.seated = true;
    if (state.phase === 'meeting') c.meeting = true;
    if (state.meeting?.votedIds.includes(socket.id ?? '') || state.meeting?.result) c.voted = c.meeting;
    last.current = { x: self.x, y: self.y, hand: me.hand.length, seated: !!self.seatedAt };
    // Avance automatiquement tant que les étapes sont validées
    let s = step;
    while (s < STEPS.length - 1 && STEPS[s].done(c)) s++;
    if (s !== step) setStep(s);
  }, [state, me, step]);

  // Fin du tutoriel = dernière étape atteinte ou partie terminée
  const finished = step === STEPS.length - 1 || state?.phase === 'ended';
  useEffect(() => { if (finished) void markTutorialDone(session); }, [finished, session]);

  const quit = () => { void markTutorialDone(session); socket.emit('lobby:leave'); resetRoom(); };
  const cur = STEPS[step];

  if (hidden) {
    return <button className={`absolute ${POS()} z-[60] btn-violet !text-sm compact-ui`} onClick={() => setHidden(false)}>📖 TUTO {step + 1}/{STEPS.length}</button>;
  }
  return (
    <div className={`absolute ${POS()} z-[60] w-80 panel p-4 flex flex-col gap-2 compact-ui`} style={{ borderColor: '#7dff3a' }}>
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[9px] text-toxic">TUTORIEL · {step + 1}/{STEPS.length}</span>
        <button className="text-xs opacity-70 hover:text-toxic" onClick={() => setHidden(true)}>réduire</button>
      </div>
      <h3 className="font-comic text-2xl comic-stroke text-hexviolet">{cur.title}</h3>
      <p className="text-sm leading-snug">{cur.text}</p>
      <div className="flex gap-1 mt-1">
        {STEPS.map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full border border-black ${i < step ? 'bg-toxic' : i === step ? 'bg-hexviolet' : 'bg-ink'}`} />)}
      </div>
      <div className="flex justify-between mt-1">
        <button className="text-xs underline opacity-70 hover:text-blood" onClick={quit}>{finished ? 'Retour au menu' : 'Passer le tutoriel'}</button>
        {!finished && <button className="text-xs underline opacity-70" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Étape suivante →</button>}
      </div>
    </div>
  );
}
