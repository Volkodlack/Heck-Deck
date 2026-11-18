-- =====================================================================
-- HEX DECK — Schéma Supabase (plan gratuit)
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query → Run
-- (ré-exécutable : utilise IF NOT EXISTS / OR REPLACE)
--
-- Architecture : les parties sont hébergées par les joueurs (P2P ou serveur dédié).
-- Ici on ne stocke QUE les profils, la progression (XP, tutoriel, cosmétiques) et les stats.
-- Les stats classées reposent sur des rapports croisés : une partie ne compte que si au moins
-- 2 comptes différents envoient des rapports concordants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null check (char_length(username) between 2 and 16),
  cosmetics      jsonb not null default '{"color":"#c51111","hat":"none"}'::jsonb,
  unlocked_hats  text[] not null default array['tophat'],
  games_played   integer not null default 0,
  wins_survivor  integer not null default 0,
  wins_possessed integer not null default 0,
  xp             integer not null default 0,
  tutorial_done  boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table public.profiles add column if not exists xp integer not null default 0;
alter table public.profiles add column if not exists tutorial_done boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Le client ne peut modifier que son pseudo et ses cosmétiques (jamais XP / stats).
revoke update on public.profiles from authenticated;
grant update (username, cosmetics) on public.profiles to authenticated;

-- Création automatique du profil à l'inscription (email ou Google)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text;
begin
  base := left(trim(coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), '')), 16);
  -- Pseudo trop court (ex : e-mail "a@…") : on complète pour respecter la contrainte 2..16
  if char_length(base) < 2 then base := left(coalesce(nullif(base, ''), 'Joueur') || '_' || substr(md5(new.id::text), 1, 4), 16); end if;
  insert into public.profiles (id, username) values (new.id, base) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Progression : niveau & chapeaux débloqués
-- Niveau n atteint à 100·n·(n+1)/2 XP (même formule que client/src/lib/progress.ts)
-- ---------------------------------------------------------------------
create or replace function public.level_of(p_xp integer)
returns integer language sql immutable as $$
  select floor((sqrt(1 + 8 * greatest(p_xp, 0) / 100.0) - 1) / 2)::integer + 1
$$;

create or replace function public.grant_xp(p_user uuid, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
declare lvl integer;
begin
  update public.profiles set xp = xp + p_amount where id = p_user returning public.level_of(xp) into lvl;
  update public.profiles set unlocked_hats = (
    select array_agg(distinct h) from unnest(unlocked_hats ||
      case when lvl >= 2 then array['candle'] else array[]::text[] end ||
      case when lvl >= 3 then array['witch']  else array[]::text[] end ||
      case when lvl >= 5 then array['horns']  else array[]::text[] end) as h)
  where id = p_user;
end $$;
revoke execute on function public.grant_xp(uuid, integer) from public, anon, authenticated;

-- Tutoriel terminé : +100 XP la première fois
create or replace function public.complete_tutorial()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); was boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select tutorial_done into was from public.profiles where id = uid;
  if coalesce(was, false) then return; end if;
  update public.profiles set tutorial_done = true where id = uid;
  perform public.grant_xp(uid, 100);
end $$;
grant execute on function public.complete_tutorial() to authenticated;

-- ---------------------------------------------------------------------
-- Rapports de fin de partie (un par joueur connecté et par partie)
-- ---------------------------------------------------------------------
create table if not exists public.game_reports (
  id           bigserial primary key,
  game_id      uuid not null,
  reporter     uuid not null references auth.users (id) on delete cascade,
  winner_side  text not null,
  role         text not null,
  won          boolean not null,
  duration_s   integer not null,
  humans       integer not null,
  bots         integer not null,
  accounts     uuid[] not null,
  mode         text not null default 'unknown',
  credited     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (game_id, reporter)
);
create index if not exists game_reports_game on public.game_reports (game_id);
create index if not exists game_reports_reporter_day on public.game_reports (reporter, created_at);

-- Aucun accès direct : tout passe par submit_game_report (security definer).
alter table public.game_reports enable row level security;

create or replace function public.submit_game_report(
  p_game_id uuid, p_winner_side text, p_role text, p_won boolean, p_duration_s integer,
  p_humans integer, p_bots integer, p_accounts uuid[], p_mode text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sorted_accounts uuid[];
  today_reports integer;
  today_ranked integer;
  xp_gain integer;
  agreeing integer;
  ranked boolean := false;
  r record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_winner_side not in ('survivors', 'possessed', 'ghost', 'player') then raise exception 'bad winner'; end if;
  if p_role not in ('survivor', 'possessed', 'medium', 'skirmisher') then raise exception 'bad role'; end if;
  if not (uid = any (p_accounts)) then raise exception 'reporter not in game'; end if;
  if p_humans < 1 or p_humans > 8 or p_bots < 0 or p_bots > 7 or p_humans + p_bots > 8 then raise exception 'bad players'; end if;

  select count(*) into today_reports from public.game_reports where reporter = uid and created_at > now() - interval '1 day';
  if today_reports >= 40 then return jsonb_build_object('ok', false, 'reason', 'quota'); end if;

  select array_agg(a order by a) into sorted_accounts from (select distinct unnest(p_accounts) as a) s;

  insert into public.game_reports (game_id, reporter, winner_side, role, won, duration_s, humans, bots, accounts, mode)
  values (p_game_id, uid, p_winner_side, p_role, p_won, greatest(p_duration_s, 0), p_humans, p_bots, sorted_accounts, left(p_mode, 16))
  on conflict (game_id, reporter) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'duplicate'); end if;

  -- Progression : toujours de l'XP (partie courte ou contre des bots = moins d'XP)
  xp_gain := case when p_duration_s >= 120 then 20 else 5 end + case when p_won then 30 else 0 end;
  if p_bots > 0 then xp_gain := xp_gain / 2; end if;
  perform public.grant_xp(uid, xp_gain);

  -- Stats classées : sans bots, ≥ 3 humains, ≥ 3 minutes, ≥ 2 comptes concordants
  if p_bots = 0 and p_humans >= 3 and p_duration_s >= 180 then
    select count(distinct reporter) into agreeing from public.game_reports
      where game_id = p_game_id and winner_side = p_winner_side and accounts = sorted_accounts;
    if agreeing >= 2 then
      for r in select * from public.game_reports
        where game_id = p_game_id and winner_side = p_winner_side and accounts = sorted_accounts and not credited
        for update
      loop
        select count(*) into today_ranked from public.game_reports
          where reporter = r.reporter and credited and created_at > now() - interval '1 day';
        if today_ranked < 15 then
          update public.profiles set
            games_played   = games_played + 1,
            wins_survivor  = wins_survivor  + case when r.won and r.role in ('survivor', 'medium') then 1 else 0 end,
            wins_possessed = wins_possessed + case when r.won and r.role = 'possessed' then 1 else 0 end
          where id = r.reporter;
        end if;
        update public.game_reports set credited = true where id = r.id;
        if r.reporter = uid then ranked := true; end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'xp', xp_gain, 'ranked', ranked);
end $$;
grant execute on function public.submit_game_report(uuid, text, text, boolean, integer, integer, integer, uuid[], text) to authenticated;

-- Ancienne fonction (serveur central) : supprimée, les stats passent par les rapports croisés.
drop function if exists public.record_game_result(uuid, boolean, text);
