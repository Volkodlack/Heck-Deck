/** Création de compte (Supabase). Le profil est créé par un trigger SQL (voir supabase/schema.sql). */
import { useState } from 'react';
import Logo from '../Logo';
import { supabase } from '../../lib/supabase';

export default function Register({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() } } });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else if (!data.session) setMsg({ ok: true, text: 'Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.' });
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col items-center justify-center gap-6 p-6">
      <Logo small className="w-full" />
      <form className="panel p-6 flex flex-col gap-3 w-full max-w-md" onSubmit={submit}>
        <h2 className="font-comic text-3xl text-toxic comic-stroke">NOUVEAU PROFIL</h2>
        <label className="label" htmlFor="u">Pseudo</label>
        <input id="u" className="input" maxLength={16} minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="label" htmlFor="e">Email</label>
        <input id="e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label" htmlFor="p">Mot de passe (6+ caractères)</label>
        <input id="p" type="password" minLength={6} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {msg && <p className={msg.ok ? 'text-toxic text-sm' : 'text-blood text-sm'}>{msg.text}</p>}
        <button className="btn-toxic mt-2" disabled={busy}>{busy ? '…' : 'CRÉER MON COMPTE'}</button>
        <button type="button" className="text-sm underline opacity-80 hover:text-toxic" onClick={onBack}>← Retour</button>
      </form>
    </div>
  );
}
