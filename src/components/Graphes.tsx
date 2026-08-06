import { useEffect, useRef, useState } from 'react';
import type { PointDensite, PointJour, Tranche } from '../lib/statsGlobales';
import { formatDateCourte } from '../lib/stats';
import { formatMs } from '../lib/time';

/**
 * Graphes de la page Statistiques, en SVG inline (aucune dépendance).
 *
 * Conventions communes, tenues d'un graphe à l'autre :
 * - le bleu (`--chart-com`) est toujours la communauté, le terracotta
 *   (`--chart-moi`) toujours vous — jamais l'inverse, jamais une couleur par
 *   rang (une même entité garde sa teinte quel que soit le tri) ;
 * - marques fines : traits de 2 px, points de r=4 cerclés de 2 px de fond pour
 *   rester lisibles quand ils se croisent, barres d'au plus 24 px séparées par
 *   2 px de fond (jamais de contour autour d'une marque) ;
 * - grille et axes en filets pleins de 1 px, couleur `--border`, jamais en
 *   pointillés ; les valeurs sont portées par l'axe, les étiquettes directes
 *   restent rares (extrêmes et repères seulement) ;
 * - le survol (souris) et les flèches ←/→ (clavier) donnent le même détail, et
 *   chaque graphe est doublé d'un tableau dépliable : l'infobulle n'est jamais
 *   le seul chemin vers un chiffre.
 *
 * Les deux teintes sont validées (bandes de clarté, plancher de chroma,
 * séparation protanope/deutéranope ΔE ≥ 15, contraste ≥ 3:1 sur la surface des
 * cartes) dans les thèmes clair et sombre — voir les tokens dans `styles.css`.
 */

/**
 * Géométrie du dessin. Le SVG s'étire à la largeur disponible, donc son
 * `viewBox` fixe l'échelle du texte : au-dessus de 640 px on dessine large
 * (720 unités ≈ 1 unité par pixel), en dessous on resserre le cadre pour que
 * les graduations gardent leur taille apparente au lieu de rétrécir avec lui.
 */
function dimensions(compact: boolean) {
  const W = compact ? 400 : 720;
  const H = compact ? 230 : 250;
  const M = compact
    ? { haut: 12, droite: 12, bas: 30, gauche: 42 }
    : { haut: 14, droite: 16, bas: 36, gauche: 54 };
  return { W, H, M, PW: W - M.gauche - M.droite, PH: H - M.haut - M.bas };
}

/** Vrai sur petit écran (même seuil que le CSS), réactif au redimensionnement. */
function useCompact(): boolean {
  const requete = '(max-width: 640px)';
  const [compact, setCompact] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const mq = window.matchMedia(requete);
    const maj = () => setCompact(mq.matches);
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  return compact;
}

/** Graduations rondes de 0 à `max` (axe des effectifs). */
function graduations(max: number, cible = 4): number[] {
  if (max <= 0) return [0];
  const brut = max / cible;
  const mag = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 5, 10].map((m) => m * mag).find((p) => p >= brut) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + pas / 2; v += pas) out.push(v);
  return out;
}

/** Temps compact pour un axe : `7:30` (m:ss), sans centièmes. */
function axeTemps(ms: number): string {
  const totalS = Math.round(ms / 1000);
  return `${Math.floor(totalS / 60)}:${String(totalS % 60).padStart(2, '0')}`;
}

/** Jour au format court `6/8`, pour l'axe des dates. */
function axeJour(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** Indices régulièrement espacés (au plus `max`), pour n'étiqueter qu'une partie de l'axe. */
function indicesEtiquettes(n: number, max: number): Set<number> {
  if (n <= max) return new Set(Array.from({ length: n }, (_, i) => i));
  const pas = Math.ceil(n / max);
  const out: number[] = [];
  for (let i = 0; i < n; i += pas) out.push(i);
  // Le dernier point est toujours étiqueté ; si l'avant-dernière étiquette
  // tombe trop près, elle cède la place plutôt que de se coller à elle.
  if (out[out.length - 1] !== n - 1) {
    if (n - 1 - out[out.length - 1] < pas / 2) out.pop();
    out.push(n - 1);
  }
  return new Set(out);
}

function Grille({
  ys,
  format,
  d,
}: {
  ys: { v: number; y: number }[];
  format: (v: number) => string;
  d: ReturnType<typeof dimensions>;
}) {
  return (
    <g>
      {ys.map(({ v, y }) => (
        <g key={v}>
          <line x1={d.M.gauche} x2={d.W - d.M.droite} y1={y} y2={y} className="g-grille" />
          <text x={d.M.gauche - 8} y={y + 4} className="g-tick" textAnchor="end">
            {format(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Tableau de secours d'un graphe : tout chiffre reste atteignable sans survol. */
function VueTableau({
  entetes,
  lignes,
}: {
  entetes: string[];
  lignes: (string | number)[][];
}) {
  return (
    <details className="g-donnees">
      <summary>Voir les données</summary>
      <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              {entetes.map((e) => (
                <th key={e}>{e}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Distribution des temps de run, en courbe continue (densité lissée) plutôt
 * qu'en barres : la forme de la population se lit d'un coup d'œil et les
 * repères — médiane, votre moyenne — se posent n'importe où sur l'axe, pas
 * seulement au bord d'une tranche.
 *
 * Une seule série (la communauté), donc pas de légende : le titre dit ce qui est
 * tracé. Le lissage ne remplace pas les données brutes — l'infobulle et le
 * tableau donnent toujours les effectifs réels par tranche.
 */
export function CourbeDistribution({
  tranches,
  courbe,
  pas,
  medianeMs,
  moiMs,
  moiPercentileP,
  pseudo,
}: {
  tranches: Tranche[];
  courbe: PointDensite[];
  pas: number;
  medianeMs: number;
  moiMs: number | null;
  moiPercentileP: number | null;
  pseudo: string;
}) {
  const [actif, setActif] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const compact = useCompact();
  const d = dimensions(compact);
  const { W, H, M, PW, PH } = d;
  if (tranches.length === 0 || courbe.length === 0) return null;

  // L'axe vertical est gradué en effectifs : la courbe est mise à l'échelle des
  // tranches (« runs par tranche »), donc les deux se lisent ensemble.
  const maxN = Math.max(...tranches.map((t) => t.n), ...courbe.map((c) => c.n));
  const ticks = graduations(maxN);
  const hautTick = ticks[ticks.length - 1];
  const y = (v: number) => M.haut + PH - (v / hautTick) * PH;
  const debut = courbe[0].ms;
  const fin = courbe[courbe.length - 1].ms;
  const x = (ms: number) =>
    M.gauche + ((Math.min(fin, Math.max(debut, ms)) - debut) / (fin - debut)) * PW;
  const moiAvant = moiMs != null && moiMs < medianeMs;

  const ligne = courbe
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.ms).toFixed(1)} ${y(c.n).toFixed(1)}`)
    .join(' ');
  // L'aire est le même tracé refermé sur la ligne de base : un lavis, pas un bloc
  const aire = `${ligne} L${x(fin).toFixed(1)} ${M.haut + PH} L${x(debut).toFixed(1)} ${M.haut + PH} Z`;

  // Le pointeur (et les flèches du clavier) accrochent une tranche : c'est
  // l'unité dans laquelle les effectifs sont réels.
  const survol = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const ms = debut + ((px - M.gauche) / PW) * (fin - debut);
    const i = tranches.findIndex((t) => ms >= t.debut && ms < t.fin);
    setActif(i >= 0 ? i : null);
  };

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActif((a) => {
      const base = a ?? 0;
      return Math.max(0, Math.min(tranches.length - 1, base + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  const t = actif != null ? tranches[actif] : null;
  const total = tranches.reduce((s, tr) => s + tr.n, 0);
  const etiquettes = indicesEtiquettes(tranches.length, compact ? 5 : 8);

  return (
    <figure className="graphe">
      <figcaption>
        <span className="g-titre">Distribution des temps de run</span>
        <span className="g-sous">
          Courbe lissée des {total} runs — hauteur = nombre de runs par tranche de {axeTemps(pas)}.
          Repères : médiane de la communauté{moiMs != null && <> et votre moyenne</>}.
        </span>
      </figcaption>
      <div className="g-cadre">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="g-svg"
          tabIndex={0}
          role="img"
          aria-label={`Distribution des temps de run : ${tranches
            .filter((tr) => tr.n > 0)
            .map((tr) => `${tr.n} runs entre ${axeTemps(tr.debut)} et ${axeTemps(tr.fin)}`)
            .join(', ')}. Flèches gauche et droite pour parcourir les tranches.`}
          onPointerMove={survol}
          onPointerLeave={() => setActif(null)}
          onKeyDown={clavier}
        >
          <Grille ys={ticks.map((v) => ({ v, y: y(v) }))} format={(v) => String(Math.round(v))} d={d} />
          {/* Bande de la tranche survolée : la marque répond au pointeur */}
          {t && (
            <rect
              x={x(t.debut)}
              y={M.haut}
              width={Math.max(1, x(t.fin) - x(t.debut))}
              height={PH}
              className="g-bande"
            />
          )}
          <path d={aire} className="g-aire" />
          <path d={ligne} className="g-ligne com" fill="none" />
          {/* Repères : médiane (encre discrète) et votre moyenne (votre teinte).
              Les deux étiquettes partent de part et d'autre de leur trait pour ne
              pas se chevaucher quand les repères sont proches, et se posent en bas
              du cadre — là où la courbe culmine, la place est libre, et
              l'infobulle (ancrée en haut) ne les masque pas. */}
          <line
            x1={x(medianeMs)}
            x2={x(medianeMs)}
            y1={M.haut}
            y2={M.haut + PH}
            className="g-repere"
          />
          <text
            x={x(medianeMs) + (moiAvant ? 5 : -5)}
            y={M.haut + PH - 6}
            className="g-tick g-etiq"
            textAnchor={moiAvant ? 'start' : 'end'}
          >
            médiane
          </text>
          {moiMs != null && (
            <>
              <line
                x1={x(moiMs)}
                x2={x(moiMs)}
                y1={M.haut}
                y2={M.haut + PH}
                className="g-repere moi"
              />
              <text
                x={x(moiMs) + (moiAvant ? -5 : 5)}
                y={M.haut + PH - 6}
                className="g-tick moi g-etiq"
                textAnchor={moiAvant ? 'end' : 'start'}
              >
                vous
              </text>
            </>
          )}
          <line
            x1={M.gauche}
            x2={W - M.droite}
            y1={M.haut + PH}
            y2={M.haut + PH}
            className="g-axe"
          />
          {tranches.map((tr, i) =>
            etiquettes.has(i) ? (
              <text
                key={tr.debut}
                x={x(tr.debut)}
                y={M.haut + PH + 18}
                className="g-tick"
                textAnchor="middle"
              >
                {axeTemps(tr.debut)}
              </text>
            ) : null,
          )}
          {/* Sur petit écran, la place manque sous l'axe : le sous-titre dit
              déjà ce que porte l'abscisse. */}
          {!compact && (
            <text x={W - M.droite} y={H - 4} className="g-axe-nom" textAnchor="end">
              temps du run →
            </text>
          )}
        </svg>
        {t && (
          <div
            className="g-bulle"
            style={{ left: `${((x(t.debut) + x(t.fin)) / 2 / W) * 100}%` }}
            role="status"
          >
            <strong>
              {t.n} run{t.n > 1 ? 's' : ''}
            </strong>
            <span>
              {axeTemps(t.debut)} → {axeTemps(t.fin)} · {Math.round((t.n / total) * 100)} %
            </span>
          </div>
        )}
      </div>
      <VueTableau
        entetes={['Tranche', 'Runs']}
        lignes={tranches.map((tr) => [`${axeTemps(tr.debut)} → ${axeTemps(tr.fin)}`, tr.n])}
      />
      <p className="g-note">
        Médiane de la communauté {formatMs(medianeMs)}
        {moiMs != null && (
          <>
            {' · '}votre moyenne {formatMs(moiMs)} ({pseudo})
            {moiPercentileP != null && <> — plus rapide que {moiPercentileP} % des runs</>}
          </>
        )}
        .
      </p>
    </figure>
  );
}

/**
 * Courbe jour après jour : la communauté et, en surimpression, vos temps.
 * Deux séries ⇒ légende toujours présente, doublée d'étiquettes directes au
 * dernier point (l'identité ne repose donc jamais sur la couleur seule).
 */
export function CourbeJours({
  points,
  titre,
  sousTitre,
  pseudo,
}: {
  points: PointJour[];
  titre: string;
  sousTitre: string;
  pseudo: string;
}) {
  const [actif, setActif] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const compact = useCompact();
  const d = dimensions(compact);
  const { W, H, M, PW, PH } = d;
  if (points.length === 0) return null;

  const aMoi = points.some((p) => p.moiMs != null);
  const valeurs = [...points.map((p) => p.ms), ...points.flatMap((p) => (p.moiMs != null ? [p.moiMs] : []))];
  const maxV = Math.max(...valeurs);
  const ticks = graduations(maxV, 4);
  const hautTick = ticks[ticks.length - 1];
  const y = (v: number) => M.haut + PH - (v / hautTick) * PH;
  const x = (i: number) =>
    points.length === 1 ? M.gauche + PW / 2 : M.gauche + (i / (points.length - 1)) * PW;
  const etiquettes = indicesEtiquettes(points.length, compact ? 5 : 8);
  const chemin = (get: (p: PointJour) => number | null) => {
    const segments: string[] = [];
    let ouvert = false;
    points.forEach((p, i) => {
      const v = get(p);
      if (v == null) {
        ouvert = false;
        return;
      }
      segments.push(`${ouvert ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
      ouvert = true;
    });
    return segments.join(' ');
  };
  // Points assez peu nombreux pour porter un marqueur sans se marcher dessus
  const marqueurs = points.length <= 40;
  const dernierMoi = aMoi ? points.reduce((acc, p, i) => (p.moiMs != null ? i : acc), -1) : -1;
  // Étiquettes de fin : quand les deux séries finissent sur la même colonne, la
  // plus haute prend l'étiquette au-dessus et l'autre en dessous — elles
  // s'écartent au lieu de converger, et restent chacune collée à sa courbe.
  const memeFin = dernierMoi === points.length - 1;
  const comDessus = !memeFin || y(points[points.length - 1].ms) <= y(points[dernierMoi].moiMs!);
  const etiqCom = {
    x: x(points.length - 1) - 6,
    y: y(points[points.length - 1].ms) + (comDessus ? -12 : 22),
  };
  const etiqMoi =
    dernierMoi >= 0
      ? {
          x: x(dernierMoi) - 6,
          y: y(points[dernierMoi].moiMs!) + (memeFin && !comDessus ? -12 : memeFin ? 22 : -12),
        }
      : null;
  // Dernière garde-fou : si les deux étiquettes se chevauchent malgré tout (les
  // séries ne finissent pas le même jour, par exemple), la vôtre s'efface — la
  // légende, l'infobulle et le tableau la portent déjà.
  const afficheEtiqMoi =
    etiqMoi != null &&
    (Math.abs(etiqCom.x - etiqMoi.x) > 44 || Math.abs(etiqCom.y - etiqMoi.y) > 14);

  const bouge = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    // Le viseur accroche le point le plus proche : on vise un jour, pas un pixel
    let best = 0;
    let d = Infinity;
    points.forEach((_, i) => {
      const dd = Math.abs(x(i) - px);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    setActif(best);
  };

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActif((a) => {
      const base = a ?? 0;
      return Math.max(0, Math.min(points.length - 1, base + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  const p = actif != null ? points[actif] : null;

  return (
    <figure className="graphe">
      <figcaption>
        <span className="g-titre">{titre}</span>
        <span className="g-sous">{sousTitre}</span>
      </figcaption>
      <div className="g-legende">
        <span className="g-cle">
          <svg viewBox="0 0 16 8" width="16" height="8" aria-hidden>
            <line x1="1" y1="4" x2="15" y2="4" className="g-ligne com" />
          </svg>
          Communauté
        </span>
        {aMoi && (
          <span className="g-cle">
            <svg viewBox="0 0 16 8" width="16" height="8" aria-hidden>
              <line x1="1" y1="4" x2="15" y2="4" className="g-ligne moi" />
            </svg>
            {pseudo}
          </span>
        )}
      </div>
      <div className="g-cadre">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="g-svg"
          tabIndex={0}
          role="img"
          aria-label={`${titre} — ${points.length} jours, de ${axeTemps(
            Math.min(...points.map((q) => q.ms)),
          )} à ${axeTemps(Math.max(...points.map((q) => q.ms)))} côté communauté. Flèches gauche et droite pour parcourir les jours.`}
          onPointerMove={bouge}
          onPointerLeave={() => setActif(null)}
          onKeyDown={clavier}
        >
          <Grille ys={ticks.map((v) => ({ v, y: y(v) }))} format={axeTemps} d={d} />
          {actif != null && (
            <line
              x1={x(actif)}
              x2={x(actif)}
              y1={M.haut}
              y2={M.haut + PH}
              className="g-viseur"
            />
          )}
          <path d={chemin((q) => q.ms)} className="g-ligne com" fill="none" />
          {aMoi && <path d={chemin((q) => q.moiMs)} className="g-ligne moi" fill="none" />}
          {marqueurs &&
            points.map((q, i) => (
              <circle key={q.date} cx={x(i)} cy={y(q.ms)} r={4} className="g-point com" />
            ))}
          {aMoi &&
            marqueurs &&
            points.map((q, i) =>
              q.moiMs != null ? (
                <circle key={q.date} cx={x(i)} cy={y(q.moiMs)} r={4} className="g-point moi" />
              ) : null,
            )}
          {/* Étiquettes directes : le dernier point de chaque série, rien d'autre —
              l'axe, l'infobulle et le tableau portent les autres valeurs. */}
          <text x={etiqCom.x} y={etiqCom.y} className="g-fin" textAnchor="end">
            {axeTemps(points[points.length - 1].ms)}
          </text>
          {afficheEtiqMoi && (
            <text x={etiqMoi!.x} y={etiqMoi!.y} className="g-fin" textAnchor="end">
              {axeTemps(points[dernierMoi].moiMs!)}
            </text>
          )}
          <line
            x1={M.gauche}
            x2={W - M.droite}
            y1={M.haut + PH}
            y2={M.haut + PH}
            className="g-axe"
          />
          {points.map((q, i) =>
            etiquettes.has(i) ? (
              <text
                key={q.date}
                x={x(i)}
                y={M.haut + PH + 18}
                className="g-tick"
                textAnchor="middle"
              >
                {axeJour(q.date)}
              </text>
            ) : null,
          )}
        </svg>
        {p && (
          <div className="g-bulle" style={{ left: `${(x(actif!) / W) * 100}%` }} role="status">
            <span className="g-bulle-date">{formatDateCourte(p.date)}</span>
            <span className="g-bulle-ligne">
              <strong>{formatMs(p.ms)}</strong> communauté ({p.n})
            </span>
            {p.moiMs != null && (
              <span className="g-bulle-ligne">
                <strong>{formatMs(p.moiMs)}</strong> vous
              </span>
            )}
          </div>
        )}
      </div>
      <VueTableau
        entetes={['Jour', 'Communauté', 'Mesures', 'Vous']}
        lignes={points.map((q) => [
          formatDateCourte(q.date),
          formatMs(q.ms),
          q.n,
          q.moiMs != null ? formatMs(q.moiMs) : '—',
        ])}
      />
    </figure>
  );
}
