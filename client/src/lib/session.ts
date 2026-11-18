/** Session joueur : invité (localStorage) ou compte Supabase. */
import type { Cosmetics } from '@shared';
import type { Profile } from './supabase';

export interface Session {
  kind: 'guest' | 'user';
  name: string;
  cosmetics: Cosmetics;
  userId?: string;
  accessToken?: string;
  profile?: Profile | null;
}

const KEY = 'hexdeck:guest';

export function loadGuest(): Pick<Session, 'name' | 'cosmetics'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { name: '', cosmetics: { color: '#c51111', hat: 'none' } };
}

export function saveGuest(s: Pick<Session, 'name' | 'cosmetics'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ name: s.name, cosmetics: s.cosmetics })); } catch { /* ignore */ }
}
