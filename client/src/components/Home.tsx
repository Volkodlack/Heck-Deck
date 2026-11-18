/** Accueil après connexion : profil, cosmétiques, création / jonction de salle privée. */
import { useState } from 'react';
import Logo from './Logo';
import CosmeticsPicker from './CosmeticsPicker';
import { socket } from '../lib/socket';
import type { Session } from '../lib/session';
import type { Cosmetics } from '@shared';
import { SFX } from '../game/SoundEffects';

interface Props {
  session: Session;
  onCosmetics: (c: Cosmetics) => void;
  onLogout: () => void;
}

export default function Home({ session, onCosmetics, onLogout }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const payload = { name: session.name, cosmetics: session.cosmetics, accessToken: session.accessToken };
  const stats = session.profile;

  function create() {
    SFX.unlock();
    socket.emit('lobby:create', payload, (r) => !r.ok && setError(r.error ?? 'Erreur'));
  }
  function join(e: React.FormEvent) {
    e.preventDefault();
    SFX.unlock();
    socket.emit('lobby:join', { ...payload, code: code.toUpperCase() }, (r) => !r.ok && setError(r.error ?? 'Erreur'));
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col items-center justify-center gap-6 p-6">
      <Logo className="w-full" />
      <div className="grid gap-6 w-full max-w-4xl md:grid-cols-3">
        <section className="panel p-5 flex flex-col gap-3 md:col-span-1">
          <h2 className="font-comic text-2xl text-toxic comic-stroke">{session.name}</h2>
          <CosmeticsPicker value={session.cosmetics} onChange={onCosmetics} unlockedHats={session.kind === 'user' ? stats?.unlocked_hats : undefined} />
          {stats ? (
            <ul className="font-pixel text-[10px] leading-5 mt-2">
              <li>PARTIES : {stats.games_played}</li>
              <li>VICTOIRES SURVIVANT : {stats.wins_survivor}</li>
              <li>VICTOIRES POSSÉDÉ : {stats.wins_possessed}</li>
            </ul>
          ) : (
            <p className="text-xs opacity-60">Mode invité — crée un compte pour garder tes statistiques.</p>
          )}
          <button className="text-sm underline opacity-70 hover:text-blood self-start" onClick={onLogout}>Se déconnecter</button>
        </section>

        <section className="panel p-5 flex flex-col gap-4 justify-center -rotate-1">
          <h2 className="font-comic text-3xl text-hexviolet comic-stroke">CRÉER UNE SALLE</h2>
          <p className="text-sm opacity-80">Salle privée de 2 à 8 joueurs. Partage le code à 6 lettres.</p>
          <button className="btn-violet" onClick={create}>NOUVEAU MANOIR</button>
        </section>

        <form className="panel p-5 flex flex-col gap-4 justify-center rotate-1" onSubmit={join}>
          <h2 className="font-comic text-3xl text-toxic comic-stroke">REJOINDRE</h2>
          <input className="input font-pixel text-center tracking-[0.4em] uppercase" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} placeholder="ABCDEF" />
          <button className="btn-toxic" disabled={code.length !== 6}>ENTRER</button>
        </form>
      </div>
      {error && <p className="text-blood font-comic text-xl">{error}</p>}
    </div>
  );
}
