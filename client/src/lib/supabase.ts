/**
 * Client Supabase (facultatif). Si VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY sont absents,
 * l'écran de connexion propose uniquement le mode "Invité rapide".
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cosmetics } from '@shared';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const authEnabled = !!supabase;

export interface Profile {
  id: string;
  username: string;
  cosmetics: Cosmetics;
  unlocked_hats: string[];
  games_played: number;
  wins_survivor: number;
  wins_possessed: number;
  xp: number;
  tutorial_done: boolean;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Profile) ?? null;
}

export async function saveProfile(userId: string, patch: Partial<Pick<Profile, 'username' | 'cosmetics'>>) {
  if (!supabase) return;
  await supabase.from('profiles').update(patch).eq('id', userId);
}
