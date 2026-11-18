/**
 * Écran de connexion : Email/Mot de passe, Google OAuth (Supabase) et "Invité rapide".
 */
import { useState } from 'react';
import Logo from '../Logo';
import { authEnabled, supabase } from '../../lib/supabase';
import { loadGuest } from '../../lib/session';

interface Props {
  onGuest: (name: string) => void;
  onGoRegister: () => void;
}

export default function Login({ onGuest, onGoRegister }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState(loadGuest().name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  async function google() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) setError(error.message);
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col items-center justify-center gap-6 p-6">
      <Logo className="w-full animate-float" />
      <div className="grid gap-6 w-full max-w-3xl md:grid-cols-2">
        {/* Invité rapide */}
        <form className="panel p-6 flex flex-col gap-3 -rotate-1" onSubmit={(e) => { e.preventDefault(); if (guestName.trim()) onGuest(guestName.trim()); }}>
          <h2 className="font-comic text-3xl text-toxic comic-stroke">INVITÉ RAPIDE</h2>
          <p className="text-sm opacity-80">Un pseudo et tu entres dans le manoir. Pas de stats sauvegardées.</p>
          <label className="label" htmlFor="guest">Pseudo</label>
          <input id="guest" className="input" maxLength={16} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Spectre_59" autoFocus />
          <button className="btn-toxic mt-2" disabled={!guestName.trim()}>ENTRER !</button>
        </form>

        {/* Compte */}
        <form className="panel p-6 flex flex-col gap-3 rotate-1" onSubmit={signIn}>
          <h2 className="font-comic text-3xl text-hexviolet comic-stroke">CONNEXION</h2>
          {!authEnabled ? (
            <p className="text-sm opacity-80">
              Les comptes sont désactivés : renseigne <code className="text-toxic">VITE_SUPABASE_URL</code> et{' '}
              <code className="text-toxic">VITE_SUPABASE_ANON_KEY</code> dans <code>.env</code> pour activer profils & statistiques.
            </p>
          ) : (
            <>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <label className="label" htmlFor="pw">Mot de passe</label>
              <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error && <p className="text-blood text-sm">{error}</p>}
              <button className="btn-violet mt-2" disabled={busy}>{busy ? '…' : 'SE CONNECTER'}</button>
              <button type="button" className="btn-ghost" onClick={google}>CONTINUER AVEC GOOGLE</button>
              <button type="button" className="text-sm underline opacity-80 hover:text-toxic" onClick={onGoRegister}>Pas encore de compte ? Créer un profil</button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
