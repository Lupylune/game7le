-- Schéma Supabase pour Game7le : comptes (pseudos) + runs (résultats quotidiens).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase (Database → SQL Editor).

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
  finished_at timestamptz not null default now(),
  primary key (pseudo, date)
);

alter table comptes enable row level security;
alter table runs enable row level security;

-- Lecture publique : classement global, aucune donnée sensible.
create policy "comptes: lecture publique" on comptes for select using (true);
create policy "runs: lecture publique" on runs for select using (true);

-- Pas de policy insert/update/delete sur les tables : les écritures ne passent
-- que par submit_run() ci-dessous (SECURITY DEFINER). Il n'y a pas
-- d'authentification (pseudo choisi librement, comme en local) — ce verrou
-- empêche les écritures directes arbitraires mais n'empêche pas qu'un client
-- soumette un run sous un pseudo qui n'est pas « le sien ».

drop function if exists submit_run(text, date, integer, jsonb);

create or replace function submit_run(
  p_pseudo text,
  p_date date,
  p_total_ms integer,
  p_lines jsonb,
  p_flawless boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into comptes (pseudo) values (p_pseudo)
    on conflict (pseudo) do nothing;

  insert into runs (pseudo, date, total_ms, lines, flawless)
    values (p_pseudo, p_date, p_total_ms, p_lines, p_flawless)
  on conflict (pseudo, date) do update
    set total_ms = excluded.total_ms,
        lines = excluded.lines,
        flawless = excluded.flawless,
        finished_at = now()
    where runs.total_ms > excluded.total_ms;
end;
$$;

revoke all on function submit_run(text, date, integer, jsonb, boolean) from public;
grant execute on function submit_run(text, date, integer, jsonb, boolean) to anon, authenticated;
