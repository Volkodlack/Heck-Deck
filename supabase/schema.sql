-- =====================================================================
-- HEX DECK — Schéma Supabase (plan gratuit)
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- Profils joueurs (1 ligne par compte auth.users)
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null check (char_length(username) between 2 and 16),
  cosmetics      jsonb not null default '{"color":"#c51111","hat":"none"}'::jsonb,
  unlocked_hats  text[] not null default array['tophat'],
  games_played   integer not null default 0,
  wins_survivor  integer not null default 0,
  wins_possessed integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Lecture publique des profils (pseudos / cosmétiques visibles en jeu)
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

-- Chacun ne peut modifier QUE son pseudo et ses cosmétiques
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Les statistiques ne sont pas modifiables par le client : on retire le droit UPDATE sur ces colonnes.
revoke update on public.profiles from authenticated;
grant update (username, cosmetics) on public.profiles to authenticated;

-- Création automatique du profil à l'inscription (email ou Google)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Joueur'), 16)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enregistrement d'un résultat de partie (appelé UNIQUEMENT par le serveur avec la clé service_role)
-- Débloque aussi des chapeaux au fil des victoires.
create or replace function public.record_game_result(p_user uuid, p_won boolean, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare total_wins integer;
begin
  update public.profiles set
    games_played   = games_played + 1,
    wins_survivor  = wins_survivor  + case when p_won and p_role in ('survivor', 'medium') then 1 else 0 end,
    wins_possessed = wins_possessed + case when p_won and p_role = 'possessed' then 1 else 0 end
  where id = p_user
  returning wins_survivor + wins_possessed into total_wins;

  update public.profiles set unlocked_hats = (
    select array_agg(distinct h) from unnest(unlocked_hats ||
      case when total_wins >= 1 then array['candle'] else array[]::text[] end ||
      case when total_wins >= 3 then array['witch']  else array[]::text[] end ||
      case when total_wins >= 5 then array['horns']  else array[]::text[] end) as h)
  where id = p_user;
end $$;

revoke execute on function public.record_game_result(uuid, boolean, text) from public, anon, authenticated;
