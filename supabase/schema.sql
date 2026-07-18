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
  -- Défi hebdomadaire difficile (date = lundi de la semaine) ; false = run
  -- quotidien classique. Dimension supplémentaire de la PK : un défi et un
  -- run quotidien du même jour coexistent.
  defi boolean not null default false,
  finished_at timestamptz not null default now(),
  primary key (pseudo, date, en_direct, defi)
);

-- Migration d'une base créée avec un ancien schéma (une ligne par jour sans
-- en_direct, puis sans defi) : ajout des colonnes manquantes, reclassement
-- d'après finished_at, élargissement de la PK. Idempotente ; sans effet sur
-- une base neuve.
--
-- Le reclassement en_direct = (finished_at::date = date) n'est valable que
-- pour l'ancien schéma sans en_direct (une ligne par jour) : sous le modèle
-- en_direct, un rejeu du jour même est légitimement en archive (en_direct =
-- false) alors que son finished_at tombe le jour du puzzle. Le rejouer casse
-- donc la PK (collision avec le vrai run en direct). On ne l'exécute qu'à la
-- toute première transition, détectée par l'absence préalable de la colonne.
do $$
declare
  v_avait_en_direct boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'runs' and column_name = 'en_direct'
  );
begin
  alter table runs add column if not exists en_direct boolean not null default true;
  alter table runs add column if not exists defi boolean not null default false;
  if not v_avait_en_direct then
    update runs set en_direct = ((finished_at at time zone 'Europe/Paris')::date = date);
  end if;
end $$;
alter table runs drop constraint if exists runs_pkey;
alter table runs add primary key (pseudo, date, en_direct, defi);

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

-- Quota de soumissions par adresse IP et par heure : borne le débit d'un
-- spammeur (pollution du 2026-07-18 : ~4 runs/s sous des pseudos aléatoires).
-- Table privée (RLS activée sans policy : aucun accès par l'API publique),
-- seule submit_run() (SECURITY DEFINER) y écrit ; purge opportuniste à
-- chaque appel, aucune IP n'est conservée plus de 2 h.
create table if not exists quota_ip (
  ip text not null,
  heure timestamptz not null,
  runs integer not null default 0,
  pseudos integer not null default 0,
  primary key (ip, heure)
);
alter table quota_ip enable row level security;

drop function if exists submit_run(text, date, integer, jsonb);
drop function if exists submit_run(text, date, integer, jsonb, boolean);
drop function if exists submit_run(text, date, integer, jsonb, boolean, boolean);

create or replace function submit_run(
  p_pseudo text,
  p_date date,
  p_total_ms integer,
  p_lines jsonb,
  p_flawless boolean default false,
  p_en_direct boolean default true,
  p_defi boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  -- Les 13 ids du pool de jeux (src/games/index.ts) — à tenir en phase.
  v_ids constant text[] := array[
    'lemot', 'croises', 'paire', 'sudoku', 'reines', 'demineur', 'nonogramme',
    'ratiole', 'melimelo', 'chromal', 'trace', 'dactylo', 'echecs'
  ];
  -- Pool du défi hebdomadaire difficile : sans paire, ratiole ni trace
  -- (src/games/index.ts, JEUX_DEFI) — à tenir en phase.
  v_ids_defi constant text[] := array[
    'lemot', 'croises', 'sudoku', 'reines', 'demineur', 'nonogramme',
    'melimelo', 'chromal', 'dactylo', 'echecs'
  ];
  v_pool text[];
  v_ligne jsonb;
  v_somme_ms numeric := 0;
  v_flawless boolean;
  v_direct boolean;
  v_ip text;
  v_nouveau boolean;
  v_runs integer;
  v_pseudos integer;
begin
  -- Validation serveur : l'API est appelable par n'importe qui avec la clé
  -- anon publique, on ne fait donc confiance à rien de ce qu'envoie le
  -- client. Sans authentification on ne peut pas empêcher une falsification
  -- plausible, mais tout payload malformé ou invraisemblable est rejeté.
  -- Les seuils sont volontairement larges : côté client l'envoi est
  -- silencieux (fire-and-forget), un rejet à tort perdrait un run légitime.
  p_pseudo := trim(p_pseudo);
  if p_pseudo is null or char_length(p_pseudo) not between 2 and 20
     or p_pseudo ~ '[[:cntrl:]]' then
    raise exception 'pseudo invalide';
  end if;

  -- Pas de run avant le lancement du jeu ni daté dans le futur.
  if p_date is null or p_date < date '2026-07-01' or p_date > v_aujourdhui then
    raise exception 'date invalide';
  end if;

  -- Défi hebdomadaire : la date est le lundi de la semaine du défi.
  if p_defi and extract(isodow from p_date) <> 1 then
    raise exception 'date invalide';
  end if;

  if p_total_ms is null or p_total_ms not between 0 and 86400000 then
    raise exception 'temps invalide';
  end if;

  -- Rate-limit par IP : 20 runs et 5 nouveaux pseudos max par heure. Large
  -- pour un foyer entier (un run légitime dure plusieurs minutes), fatal pour
  -- un script. L'en-tête est posé par l'infra Supabase (non forgeable de
  -- l'extérieur) ; absent hors API (tests SQL locaux), le quota est ignoré.
  v_ip := split_part(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json
      ->> 'x-forwarded-for',
    ',', 1);
  if v_ip is not null and v_ip <> '' then
    delete from quota_ip where heure < now() - interval '2 hours';
    v_nouveau := not exists (select 1 from comptes where pseudo = p_pseudo);
    insert into quota_ip as q (ip, heure, runs, pseudos)
      values (v_ip, date_trunc('hour', now()), 1, v_nouveau::int)
    on conflict (ip, heure) do update
      set runs = q.runs + 1, pseudos = q.pseudos + excluded.pseudos
    returning q.runs, q.pseudos into v_runs, v_pseudos;
    if v_runs > 20 or v_pseudos > 5 then
      raise exception 'trop de soumissions';
    end if;
  end if;

  -- lines : exactement 7 épreuves, payload borné.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) <> 7
     or pg_column_size(p_lines) > 8192 then
    raise exception 'lignes invalides';
  end if;

  v_pool := case when p_defi then v_ids_defi else v_ids end;
  for v_ligne in select jsonb_array_elements(p_lines) loop
    -- Chaque champ est vérifié explicitement ; un champ manquant rend la
    -- condition NULL, d'où le `coalesce(…, false)` qui vaut alors rejet.
    if not coalesce(
      jsonb_typeof(v_ligne) = 'object'
      and v_ligne->>'id' = any (v_pool)
      and v_ligne->>'status' in ('success', 'fail', 'skip')
      and jsonb_typeof(v_ligne->'adjustMs') = 'number'
      and abs((v_ligne->>'adjustMs')::numeric) <= 600000
      and jsonb_typeof(v_ligne->'ms') = 'number'
      -- Durée par épreuve : sous 1 s ce n'est pas un humain qui a joué.
      and (v_ligne->>'ms')::numeric between 1000 and 86400000
      and char_length(coalesce(v_ligne->>'nom', '')) <= 40
      and char_length(coalesce(v_ligne->>'detail', '')) <= 200
    , false) then
      raise exception 'ligne invalide';
    end if;
    v_somme_ms := v_somme_ms + (v_ligne->>'ms')::numeric;
  end loop;

  -- 7 épreuves distinctes, et un temps de jeu cumulé humainement plausible.
  if (select count(distinct l->>'id') from jsonb_array_elements(p_lines) l) <> 7 then
    raise exception 'lignes invalides';
  end if;
  -- 30 s cumulées minimum pour 7 épreuves (< 4,3 s/épreuve en moyenne, très
  -- en deçà du record humain plausible ; les runs légitimes observés sont
  -- tous > 50 s). L'attaquant du 2026-07-18 avait recalibré ses payloads
  -- juste au-dessus de l'ancien plancher de 5 s.
  if v_somme_ms < 30000 then
    raise exception 'temps invraisemblable';
  end if;

  -- Le sans-faute est recalculé côté serveur (mêmes règles que RunPage.tsx) :
  -- le flag client ne peut que le retirer, jamais l'accorder indûment.
  -- Épreuves corsées : le défi difficile laisse 8 minutes au lieu de 5.
  v_flawless := p_flawless
    and p_total_ms < (case when p_defi then 480000 else 300000 end)
    and not exists (
      select 1 from jsonb_array_elements(p_lines) l
      where l->>'status' <> 'success' or (l->>'adjustMs')::numeric > 0
    );

  -- Le flag client est plafonné côté serveur : un run ne peut être « en
  -- direct » que soumis le jour même du puzzle (fuseau de référence du jeu) —
  -- ou dans la semaine du défi pour le défi difficile — et seule la première
  -- tentative compte : tout rejeu bascule dans le créneau archive.
  v_direct := p_en_direct
    and (case
      when p_defi then v_aujourdhui between p_date and p_date + 6
      else p_date = v_aujourdhui
    end)
    and not exists (
      select 1 from runs
      where pseudo = p_pseudo and date = p_date and en_direct and defi = p_defi
    );

  insert into comptes (pseudo) values (p_pseudo)
    on conflict (pseudo) do nothing;

  -- Meilleur temps par jour et par type : un run d'archive n'écrase jamais le
  -- run joué en direct, et réciproquement.
  insert into runs (pseudo, date, total_ms, lines, flawless, en_direct, defi)
    values (p_pseudo, p_date, p_total_ms, p_lines, v_flawless, v_direct, p_defi)
  on conflict (pseudo, date, en_direct, defi) do update
    set total_ms = excluded.total_ms,
        lines = excluded.lines,
        flawless = excluded.flawless,
        finished_at = now()
    where runs.total_ms > excluded.total_ms;
end;
$$;

revoke all on function submit_run(text, date, integer, jsonb, boolean, boolean, boolean) from public;
grant execute on function submit_run(text, date, integer, jsonb, boolean, boolean, boolean) to anon, authenticated;
