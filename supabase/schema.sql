-- Schéma Supabase pour Game7le : comptes (pseudos) + runs (résultats quotidiens).
-- À exécuter dans l'éditeur SQL du projet Supabase (Database → SQL Editor).
-- Rejouable tel quel sur une base existante (créations conditionnelles,
-- migrations idempotentes, policies et fonction recréées).

create table if not exists comptes (
  pseudo text primary key check (char_length(pseudo) between 2 and 20),
  created_at timestamptz not null default now()
);

create table if not exists runs (
  pseudo text not null references comptes (pseudo) on delete cascade,
  date date not null,
  total_ms integer not null check (total_ms >= 0),
  lines jsonb not null,
  flawless boolean not null default false,
  -- Joué le jour même du puzzle (false : archive rejouée après coup). Une
  -- ligne par jour ET par type : le meilleur temps en direct et le meilleur
  -- temps en archive coexistent sans s'écraser.
  en_direct boolean not null default true,
  finished_at timestamptz not null default now(),
  primary key (pseudo, date, en_direct)
);

-- Migration d'une base créée avec l'ancien schéma (une ligne par jour, sans
-- en_direct) : reclassement d'après finished_at, puis élargissement de la PK.
-- Idempotente ; sans effet sur une base neuve.
alter table runs add column if not exists en_direct boolean not null default true;
update runs set en_direct = ((finished_at at time zone 'Europe/Paris')::date = date)
  where en_direct is distinct from ((finished_at at time zone 'Europe/Paris')::date = date);
alter table runs drop constraint runs_pkey;
alter table runs add primary key (pseudo, date, en_direct);

alter table comptes enable row level security;
alter table runs enable row level security;

-- Lecture publique : classement global, aucune donnée sensible.
drop policy if exists "comptes: lecture publique" on comptes;
drop policy if exists "runs: lecture publique" on runs;
create policy "comptes: lecture publique" on comptes for select using (true);
create policy "runs: lecture publique" on runs for select using (true);

-- Pas de policy insert/update/delete sur les tables : les écritures ne passent
-- que par submit_run() ci-dessous (SECURITY DEFINER). Il n'y a pas
-- d'authentification (pseudo choisi librement, comme en local) — ce verrou
-- empêche les écritures directes arbitraires mais n'empêche pas qu'un client
-- soumette un run sous un pseudo qui n'est pas « le sien ».

drop function if exists submit_run(text, date, integer, jsonb);
drop function if exists submit_run(text, date, integer, jsonb, boolean);

create or replace function submit_run(
  p_pseudo text,
  p_date date,
  p_total_ms integer,
  p_lines jsonb,
  p_flawless boolean default false,
  p_en_direct boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Le flag client est plafonné côté serveur : un run ne peut être « en
  -- direct » que soumis le jour même du puzzle (fuseau de référence du jeu).
  v_direct boolean := p_en_direct and p_date = (now() at time zone 'Europe/Paris')::date;
begin
  insert into comptes (pseudo) values (p_pseudo)
    on conflict (pseudo) do nothing;

  -- Meilleur temps par jour et par type : un run d'archive n'écrase jamais le
  -- run joué en direct, et réciproquement.
  insert into runs (pseudo, date, total_ms, lines, flawless, en_direct)
    values (p_pseudo, p_date, p_total_ms, p_lines, p_flawless, v_direct)
  on conflict (pseudo, date, en_direct) do update
    set total_ms = excluded.total_ms,
        lines = excluded.lines,
        flawless = excluded.flawless,
        finished_at = now()
    where runs.total_ms > excluded.total_ms;
end;
$$;

revoke all on function submit_run(text, date, integer, jsonb, boolean, boolean) from public;
grant execute on function submit_run(text, date, integer, jsonb, boolean, boolean) to anon, authenticated;
