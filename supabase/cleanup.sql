-- Nettoyage one-shot des runs frauduleux (pollution constatée le 2026-07-18 :
-- ~2 100 runs forgés à total_ms=0 / lines bidons, soumis via l'API publique).
-- À exécuter dans l'éditeur SQL Supabase APRÈS avoir rejoué schema.sql (sinon
-- le submit_run non durci laisse la pollution revenir aussitôt).
--
-- Les critères sont exactement ceux de la validation de submit_run() : tout
-- run qui serait rejeté aujourd'hui à la soumission est supprimé. Cela inclut
-- les runs de l'ancien format (lines sans champ ms), tous soumis sous des
-- pseudos de test (Jesuisfaker, test, Testeur…).

begin;

-- 1. Date hors plage (avant lancement ou dans le futur), total aberrant, ou
-- défi hebdomadaire dont la date n'est pas un lundi.
delete from runs
where date not between date '2026-07-01' and (now() at time zone 'Europe/Paris')::date
   or total_ms not between 0 and 86400000
   or (defi and extract(isodow from date) <> 1);

-- 2. Structure des lines invalide : pas un tableau de 7 épreuves distinctes
-- aux ids connus (pool restreint pour le défi difficile : sans paire, ratiole
-- ni trace), ou une ligne dont un champ manque / est hors bornes.
delete from runs r
where jsonb_typeof(r.lines) <> 'array'
   or jsonb_array_length(r.lines) <> 7
   or (
     select count(distinct l->>'id')
     from jsonb_array_elements(r.lines) l
     where l->>'id' = any (case when r.defi
       then array[
         'lemot', 'croises', 'sudoku', 'reines', 'demineur', 'nonogramme',
         'melimelo', 'chromal', 'dactylo', 'echecs'
       ]
       else array[
         'lemot', 'croises', 'paire', 'sudoku', 'reines', 'demineur',
         'nonogramme', 'ratiole', 'melimelo', 'chromal', 'trace', 'dactylo',
         'echecs'
       ] end)
   ) <> 7
   or exists (
     select 1 from jsonb_array_elements(r.lines) l
     where not coalesce(
       l->>'status' in ('success', 'fail', 'skip')
       and jsonb_typeof(l->'adjustMs') = 'number'
       and abs((l->>'adjustMs')::numeric) <= 600000
       and jsonb_typeof(l->'ms') = 'number'
       and (l->>'ms')::numeric between 1000 and 86400000
     , false)
   );

-- 3. Temps de jeu cumulé invraisemblable (les casts sont sûrs : l'étape 2 a
-- éliminé toute ligne dont ms n'est pas un nombre).
delete from runs r
where (
  select sum((l->>'ms')::numeric)
  from jsonb_array_elements(r.lines) l
) < 30000;

-- 4. Sans-faute recalculé sur les survivants (mêmes règles que submit_run :
-- 5 minutes, 8 pour le défi difficile).
update runs r
set flawless = false
where flawless
  and (
    total_ms >= (case when defi then 480000 else 300000 end)
    or exists (
      select 1 from jsonb_array_elements(r.lines) l
      where l->>'status' <> 'success' or (l->>'adjustMs')::numeric > 0
    )
  );

-- 5. Comptes orphelins (créés par le spam, plus aucun run).
delete from comptes c
where not exists (select 1 from runs r where r.pseudo = c.pseudo);

select
  (select count(*) from runs) as runs_restants,
  (select count(*) from comptes) as comptes_restants;

commit;
