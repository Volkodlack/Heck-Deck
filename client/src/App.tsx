/**
 * HEX DECK — Racine de l'application : authentification → accueil → lobby → partie.
 */
import { useEffect, useRef, useState } from 'react';
import type { Cosmetics, FxEvent } from '@shared';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Home from './components/Home';
import LobbyRoom from './components/LobbyRoom';
import GameScreen from './components/GameScreen';
import { fetchProfile, saveProfile, supabase } from './lib/supabase';
import { loadGuest, saveGuest, type Session } from './lib/session';
import { onFx, socket, useGame } from './lib/socket';
import { playTutorial } from './lib/play';
import { reportGame, tutorialDone } from './lib/progress';
import { SFX } from './game/SoundEffects';
import { voice } from './game/VoiceChat';
import { setHosting } from './lib/native';

const FX_SOUND: Partial<Record<FxEvent['type'], () => void>> = {
  boom: () => SFX.boom(), sabotage: () => SFX.sabotage(), hexed: () => SFX.hexed(), curse: () => SFX.curse(),
  bell: () => SFX.bell(), search: () => SFX.search(), blocked: () => SFX.error(), eliminated: () => SFX.eliminated(),
  ghost: () => SFX.ghost(), pass: () => SFX.pass(), play: () => SFX.card(), win: () => SFX.win(),
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<'login' | 'register'>('login');
  const { state, me } = useGame();
  const voiceStarted = useRef(false);
  const tutoLaunched = useRef(false);

  /* ---------- Auth Supabase ---------- */
  useEffect(() => {
    if (!supabase) return;
    const apply = async (s: Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>['data']['session']) => {
      if (!s) { setSession((cur) => (cur?.kind === 'user' ? null : cur)); return; }
      const profile = await fetchProfile(s.user.id);
      setSession({
        kind: 'user', userId: s.user.id, accessToken: s.access_token, profile,
        name: profile?.username ?? (s.user.user_metadata?.username as string) ?? s.user.email?.split('@')[0] ?? 'Joueur',
        cosmetics: profile?.cosmetics ?? { color: '#c51111', hat: 'none' },
      });
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => void apply(s));
    return () => data.subscription.unsubscribe();
  }, []);

  /* ---------- Sons des effets serveur ---------- */
  useEffect(() => onFx((f) => { if (!f.only || f.only === socket.id) FX_SOUND[f.type]?.(); }), []);

  /* ---------- Tutoriel automatique au premier lancement ---------- */
  useEffect(() => {
    if (!session || state || tutoLaunched.current) return;
    // Attendre le profil pour un compte (tutorial_done peut venir de la base)
    if (session.kind === 'user' && session.profile === undefined) return;
    tutoLaunched.current = true;
    if (!tutorialDone(session)) void playTutorial(session);
  }, [session, state]);

  /* ---------- Rapport de fin de partie (progression & stats croisées) ---------- */
  useEffect(() => {
    if (state?.phase === 'ended' && me && socket.id) void reportGame(state, me, socket.id, session, socket.kind);
  }, [state?.phase, state?.gameId]);

  /* ---------- Android : service au premier plan pendant qu'on héberge ---------- */
  useEffect(() => {
    void setHosting(!!state && socket.kind === 'host', state ? `Salle ${state.code} · ${state.players.filter((p) => p.connected && !p.isBot).length} joueur(s)` : '');
  }, [state?.code, state?.players.length]);

  /* ---------- Voix (parties en ligne uniquement) & ambiance ---------- */
  useEffect(() => {
    const online = socket.kind === 'host' || socket.kind === 'guest' || socket.kind === 'server';
    if (state && online && !voiceStarted.current) { voiceStarted.current = true; void voice.start(); }
    if (!state && voiceStarted.current) { voiceStarted.current = false; voice.stop(); }
    if (state && state.phase !== 'lobby') SFX.startAmbience(); else SFX.stopAmbience();
  }, [state?.code, state?.phase]);

  const peerKey = state?.players.filter((p) => p.connected && !p.isBot).map((p) => p.id).sort().join(',') ?? '';
  useEffect(() => {
    if (state && state.phase !== 'lobby') voice.syncPeers(peerKey.split(',').filter(Boolean));
  }, [peerKey, state?.phase]);

  function updateCosmetics(c: Cosmetics) {
    if (!session) return;
    const next = { ...session, cosmetics: c };
    setSession(next);
    if (next.kind === 'guest') saveGuest(next);
    else if (next.userId) void saveProfile(next.userId, { cosmetics: c });
  }

  async function logout() {
    if (session?.kind === 'user') await supabase?.auth.signOut();
    setSession(null);
  }

  if (!session) {
    return view === 'register'
      ? <Register onBack={() => setView('login')} />
      : <Login onGoRegister={() => setView('register')} onGuest={(name) => {
          const g = { ...loadGuest(), name };
          saveGuest(g);
          SFX.unlock();
          setSession({ kind: 'guest', ...g });
        }} />;
  }

  if (!state) return <Home session={session} onCosmetics={updateCosmetics} onLogout={logout} />;
  if (state.phase === 'lobby') return <LobbyRoom cosmetics={session.cosmetics} onCosmetics={updateCosmetics} />;
  return <GameScreen session={session} />;
}
