/**
 * Accueil : profil & progression, puis les modes de jeu.
 * - Solo (hors-ligne, contre des bots) et Tutoriel
 * - Héberger en ligne (P2P depuis cet appareil) / Rejoindre avec un code
 * - Serveur dédié auto-hébergé (avancé)
 */
import { useState } from 'react';
import Logo from './Logo';
import CosmeticsPicker from './CosmeticsPicker';
import type { Session } from '../lib/session';
import type { Cosmetics } from '@shared';
import { SFX } from '../game/SoundEffects';
import { hostOnline, joinOnline, playSolo, playTutorial, joinServer } from '../lib/play';
import { p2pAvailable } from '../lib/net/signaling';
import { levelOf } from '../lib/progress';

interface Props {
  session: Session;
  onCosmetics: (c: Cosmetics) => void;
  onLogout: () => void;
}

const DEFAULT_SERVER = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

export default function Home({ session, onCosmetics, onLogout }: Props) {
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [serverCode, setServerCode] = useState('');
  const [showServer, setShowServer] = useState(false);
  const stats = session.profile;
  const online = p2pAvailable();

  async function run(label: string, fn: () => Promise<unknown>) {
    SFX.unlock();
    setError(null);
    setBusy(label);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const lvl = stats ? levelOf(stats.xp ?? 0) : null;

  return (
    <div className="compact-page h-full overflow-y-auto flex flex-col items-center gap-5 p-5">
      <Logo className="w-full" />
      <div className="grid gap-5 w-full max-w-5xl md:grid-cols-3">
        {/* Profil */}
        <section className="panel p-5 flex flex-col gap-3">
          <h2 className="font-comic text-2xl text-toxic comic-stroke">{session.name}</h2>
          <CosmeticsPicker value={session.cosmetics} onChange={onCosmetics} unlockedHats={session.kind === 'user' ? stats?.unlocked_hats : undefined} />
          {stats && lvl ? (
            <div className="font-pixel text-[10px] leading-5 mt-1">
              <p className="text-hexviolet">NIVEAU {lvl.level}</p>
              <div className="h-3 bg-ink border-2 border-black rounded-full overflow-hidden my-1">
                <div className="h-full bg-toxic" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
              <p>PARTIES CLASSÉES : {stats.games_played}</p>
              <p>VICTOIRES SURVIVANT : {stats.wins_survivor}</p>
              <p>VICTOIRES POSSÉDÉ : {stats.wins_possessed}</p>
            </div>
          ) : (
            <p className="text-xs opacity-60">Mode invité : crée un compte pour garder ta progression et tes statistiques.</p>
          )}
          <div className="flex gap-3 mt-auto">
            <button className="text-sm underline opacity-70 hover:text-toxic" onClick={() => run('tuto', () => playTutorial(session))}>Revoir le tutoriel</button>
            <button className="text-sm underline opacity-70 hover:text-blood" onClick={onLogout}>Déconnexion</button>
          </div>
        </section>

        {/* Solo */}
        <section className="panel p-5 flex flex-col gap-3 -rotate-1">
          <h2 className="font-comic text-3xl text-hexviolet comic-stroke">SOLO</h2>
          <p className="text-sm opacity-80">Hors-ligne, contre des bots. Parfait pour s’entraîner.</p>
          <label className="label">Bots : {bots} {bots + 1 <= 3 ? '(Escarmouche)' : bots + 1 <= 5 ? '(1 Possédé)' : '(2 Possédés)'}</label>
          <input type="range" min={1} max={7} value={bots} onChange={(e) => setBots(Number(e.target.value))} />
          <button className="btn-violet mt-auto" disabled={!!busy} onClick={() => run('solo', () => playSolo(session, bots))}>JOUER SOLO</button>
        </section>

        {/* En ligne */}
        <section className="panel p-5 flex flex-col gap-3 rotate-1">
          <h2 className="font-comic text-3xl text-toxic comic-stroke">EN LIGNE</h2>
          {online ? (
            <>
              <p className="text-sm opacity-80">Ta partie est hébergée sur cet appareil. Tes amis la rejoignent avec le code.</p>
              <button className="btn-toxic" disabled={!!busy} onClick={() => run('host', () => hostOnline(session))}>
                {busy === 'host' ? 'OUVERTURE…' : 'HÉBERGER UNE PARTIE'}
              </button>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run('join', () => joinOnline(code, session)); }}>
                <input className="input font-pixel text-center tracking-[0.3em] uppercase !px-1" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} placeholder="CODE" />
                <button className="btn-ghost !px-3" disabled={code.length !== 6 || !!busy}>{busy === 'join' ? '…' : 'OK'}</button>
              </form>
            </>
          ) : (
            <p className="text-sm opacity-80">
              Le jeu en ligne P2P a besoin de Supabase pour la mise en relation : renseigne <code className="text-toxic">VITE_SUPABASE_URL</code> et{' '}
              <code className="text-toxic">VITE_SUPABASE_ANON_KEY</code>. Tu peux aussi utiliser un serveur dédié ci-dessous.
            </p>
          )}
          <button className="text-xs underline opacity-70 self-start" onClick={() => setShowServer((v) => !v)}>
            {showServer ? '▾' : '▸'} Serveur dédié (avancé)
          </button>
          {showServer && (
            <div className="flex flex-col gap-2">
              <input className="input !py-1 text-sm" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://192.168.1.20:3001" />
              <div className="flex gap-2">
                <input className="input !py-1 text-sm font-pixel uppercase" maxLength={6} value={serverCode}
                  onChange={(e) => setServerCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} placeholder="code (vide = créer)" />
                <button className="btn-ghost !text-sm !px-3" disabled={!serverUrl || !!busy}
                  onClick={() => run('server', () => joinServer(serverUrl, session, serverCode.length === 6 ? serverCode : undefined))}>GO</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {error && <p className="text-blood font-comic text-xl text-center">{error}</p>}
    </div>
  );
}
