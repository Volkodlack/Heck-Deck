/**
 * Accès Supabase côté serveur (facultatif).
 * Sans SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, le jeu fonctionne en mode invité uniquement
 * et les statistiques ne sont simplement pas enregistrées.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../../shared/src/index';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** Vérifie un jeton d'accès envoyé par le client et renvoie l'id utilisateur. */
export async function verifyToken(token?: string): Promise<string | null> {
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

/** Incrémente les statistiques du profil (appel RPC défini dans supabase/schema.sql). */
export async function recordResult(userId: string, won: boolean, role: Role) {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_game_result', { p_user: userId, p_won: won, p_role: role });
  if (error) console.warn('[db] record_game_result:', error.message);
}
