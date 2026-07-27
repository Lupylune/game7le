import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { shuffle } from '../lib/rng';
import type { RNG } from '../lib/rng';
import type { GameProps } from './types';
import { LOGOS } from '../data/coloris-logos';

/**
 * Coloris — réplique du jeu « color2 » de dialed.gg. Un sujet reconnaissable
 * s'affiche dans une mauvaise couleur ; le joueur retrouve sa vraie couleur en
 * réglant trois curseurs HSB (Teinte / Saturation / Luminosité). Le score
 * dépend de la proximité (distance RGB) avec la couleur canonique du sujet.
 *
 * Jeu de connaissance (pas de mémorisation) : on sait de quelle couleur est une
 * banane, il faut la « composer » précisément aux curseurs.
 */

const N_FACILE = 3;
const N_DIFFICILE = 5;

// Drapeau décrit par bandes : une bande `null` est la couleur à deviner (elle
// prend la teinte du joueur), les autres sont fixes. `disque` (optionnel) ajoute
// un disque central au-dessus d'un fond uni (ex. Japon).
export interface DrapeauDef {
  sens: 'v' | 'h'; // bandes verticales ou horizontales
  bandes: (string | null)[];
  disque?: string | null;
}

export interface Sujet {
  nom: string;
  cible: string; // couleur canonique (hex)
  /** Asset SVG sous public/coloris/ (logo) ; « currentColor » y marque la couleur
   *  à deviner. Chargé à la volée pour ne pas alourdir le bundle. */
  fichier?: string;
  /** Drapeau dessiné à la main (une bande masquée à retrouver). */
  drapeau?: DrapeauDef;
}

// Logos de marques (src/data/coloris-logos.ts) : on affiche l'asset avec une de
// ses couleurs retirée (rendue en « currentColor »), le joueur la recompose. Le
// SVG vit dans public/coloris/.
const LOGO_SUJETS: Sujet[] = LOGOS;

// Cache mémoire des SVG déjà téléchargés (par chemin d'asset).
const svgCache = new Map<string, string>();
const svgEnCours = new Map<string, Promise<string>>();
function chargeSvg(fichier: string): Promise<string> {
  if (svgCache.has(fichier)) return Promise.resolve(svgCache.get(fichier)!);
  let p = svgEnCours.get(fichier);
  if (!p) {
    p = fetch(import.meta.env.BASE_URL + fichier)
      .then((r) => r.text())
      .then((t) => {
        svgCache.set(fichier, t);
        return t;
      });
    svgEnCours.set(fichier, p);
  }
  return p;
}

// Drapeaux : une bande est retirée (null = couleur du joueur), le joueur la
// retrouve. Le nom indique quelle couleur deviner.
const B = '#ffffff';
const DRAPEAUX: Sujet[] = [
  { nom: 'Drapeau du Japon (le rouge)', cible: '#bc002d', drapeau: { sens: 'h', bandes: [B], disque: null } },
  { nom: 'Drapeau de la France (le bleu)', cible: '#0055a4', drapeau: { sens: 'v', bandes: [null, B, '#ef4135'] } },
  { nom: "Drapeau de l'Irlande (le vert)", cible: '#169b62', drapeau: { sens: 'v', bandes: [null, B, '#ff883e'] } },
  { nom: "Drapeau de l'Italie (le vert)", cible: '#009246', drapeau: { sens: 'v', bandes: [null, B, '#ce2b37'] } },
  { nom: "Drapeau de la Côte d'Ivoire (l'orange)", cible: '#f77f00', drapeau: { sens: 'v', bandes: [null, B, '#009e60'] } },
  { nom: 'Drapeau de la Belgique (le jaune)', cible: '#fdda24', drapeau: { sens: 'v', bandes: ['#000000', null, '#ed2939'] } },
  { nom: 'Drapeau de la Roumanie (le jaune)', cible: '#fcd116', drapeau: { sens: 'v', bandes: ['#002b7f', null, '#ce1126'] } },
  { nom: "Drapeau de l'Allemagne (le rouge)", cible: '#dd0000', drapeau: { sens: 'h', bandes: ['#000000', null, '#ffce00'] } },
  { nom: 'Drapeau des Pays-Bas (le rouge)', cible: '#ae1c28', drapeau: { sens: 'h', bandes: [null, B, '#21468b'] } },
  { nom: "Drapeau de l'Autriche (le rouge)", cible: '#ed2939', drapeau: { sens: 'h', bandes: [null, B, null] } },
  { nom: 'Drapeau de la Hongrie (le vert)', cible: '#436f4d', drapeau: { sens: 'h', bandes: ['#cd2a3e', B, null] } },
  { nom: "Drapeau de l'Ukraine (le bleu)", cible: '#0057b7', drapeau: { sens: 'h', bandes: [null, '#ffd700'] } },
  { nom: 'Drapeau de la Pologne (le rouge)', cible: '#dc143c', drapeau: { sens: 'h', bandes: [B, null] } },
  { nom: "Drapeau de l'Espagne (le rouge)", cible: '#c60b1e', drapeau: { sens: 'h', bandes: [null, '#ffc400', null] } },
  { nom: 'Drapeau de la Russie (le bleu)', cible: '#0039a6', drapeau: { sens: 'h', bandes: [B, null, '#d52b1e'] } },
  { nom: 'Drapeau de la Colombie (le jaune)', cible: '#fcd116', drapeau: { sens: 'h', bandes: [null, '#003893', '#ce1126'] } },
  { nom: 'Drapeau de la Lituanie (le vert)', cible: '#006a44', drapeau: { sens: 'h', bandes: ['#fdb913', null, '#c1272d'] } },
  { nom: 'Drapeau de la Bulgarie (le vert)', cible: '#00966e', drapeau: { sens: 'h', bandes: [B, null, '#d62612'] } },
  { nom: "Drapeau de l'Estonie (le bleu)", cible: '#0072ce', drapeau: { sens: 'h', bandes: [null, '#000000', B] } },
  { nom: "Drapeau de l'Arménie (l'orange)", cible: '#f2a800', drapeau: { sens: 'h', bandes: ['#d90012', '#0033a0', null] } },
  { nom: 'Drapeau du Gabon (le jaune)', cible: '#fcd116', drapeau: { sens: 'h', bandes: ['#009e60', null, '#3a75c4'] } },
  { nom: 'Drapeau du Mali (le jaune)', cible: '#fcd116', drapeau: { sens: 'v', bandes: ['#14b53a', null, '#ce1126'] } },
  { nom: 'Drapeau de la Guinée (le jaune)', cible: '#fcd116', drapeau: { sens: 'v', bandes: ['#ce1126', null, '#009460'] } },
  { nom: 'Drapeau du Tchad (le jaune)', cible: '#fecb00', drapeau: { sens: 'v', bandes: ['#002664', null, '#c60c30'] } },
  { nom: 'Drapeau du Nigéria (le vert)', cible: '#008751', drapeau: { sens: 'v', bandes: [null, B, null] } },
  { nom: 'Drapeau du Pérou (le rouge)', cible: '#d91023', drapeau: { sens: 'v', bandes: [null, B, null] } },
  { nom: "Drapeau de l'Indonésie (le rouge)", cible: '#ce1126', drapeau: { sens: 'h', bandes: [null, B] } },
  { nom: 'Drapeau du Bangladesh (le disque)', cible: '#f42a41', drapeau: { sens: 'h', bandes: ['#006a4e'], disque: null } },
  { nom: 'Drapeau des Palaos (le disque)', cible: '#ffde00', drapeau: { sens: 'h', bandes: ['#4aadd6'], disque: null } },
  { nom: 'Drapeau de la Thaïlande (le bleu)', cible: '#2d2a4a', drapeau: { sens: 'h', bandes: ['#a51931', B, null, B, '#a51931'] } },
  { nom: 'Drapeau du Costa Rica (le rouge)', cible: '#ce1126', drapeau: { sens: 'h', bandes: ['#002b7f', B, null, B, '#002b7f'] } },
  { nom: 'Drapeau du Yémen (le rouge)', cible: '#ce1126', drapeau: { sens: 'h', bandes: [null, B, '#000000'] } },
  { nom: 'Drapeau de la Bolivie (le jaune)', cible: '#f9e300', drapeau: { sens: 'h', bandes: ['#d52b1e', null, '#007934'] } },
];

// Pool complet : logos de marques + drapeaux (mêmes sujets en facile et en
// difficile, le mode difficile en tire simplement davantage).
const POOL: Sujet[] = [...LOGO_SUJETS, ...DRAPEAUX];

/** Sujets tirés au sort pour une partie (même seed = mêmes sujets pour tous). */
export function genColoris(rng: RNG, difficile?: boolean): Sujet[] {
  const n = difficile ? N_DIFFICILE : N_FACILE;
  return shuffle(rng, POOL).slice(0, n);
}

// --- Conversions couleur ---
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgbCss = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

/** Proximité 0–100 % entre deux couleurs (distance RGB, seuil resserré). */
function proximite(a: [number, number, number], b: [number, number, number]): number {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return Math.max(0, Math.min(100, 100 * (1 - d / 200)));
}

// --- Rendu des sujets ---
// Asset SVG (logo/personnage) : téléchargé à la volée puis rendu inline ; la
// couleur retirée (« currentColor ») prend la teinte réglée par le joueur.
function LogoView({ fichier, color }: { fichier: string; color: string }) {
  const [markup, setMarkup] = useState(() => svgCache.get(fichier) ?? '');
  useEffect(() => {
    let vivant = true;
    chargeSvg(fichier).then((m) => {
      if (vivant) setMarkup(m);
    });
    return () => {
      vivant = false;
    };
  }, [fichier]);
  return <div className="coloris-logo" style={{ color }} dangerouslySetInnerHTML={{ __html: markup }} />;
}

// Une bande blanche (ou très claire) reçoit un liseré pour rester visible.
const estClair = (c: string) => /^#f{3}$/i.test(c) || /^#f{6}$/i.test(c);

// Drapeau dessiné à partir de ses bandes ; la bande à deviner prend `color`.
function DrapeauView({ def, color }: { def: DrapeauDef; color: string }) {
  const X = 12;
  const Y = 24;
  const W = 76;
  const H = 52;
  const n = def.bandes.length;
  const bandes = def.disque === undefined
    ? def.bandes.map((b, i) => {
        const fill = b === null ? color : b;
        const commun = { fill, stroke: b !== null && estClair(b) ? 'rgba(0,0,0,.12)' : undefined };
        return def.sens === 'v' ? (
          <rect key={i} x={X + (i * W) / n} y={Y} width={W / n} height={H} {...commun} />
        ) : (
          <rect key={i} x={X} y={Y + (i * H) / n} width={W} height={H / n} {...commun} />
        );
      })
    : null;
  return (
    <svg viewBox="0 0 100 100" className="coloris-svg" width={160} height={160}>
      {def.disque !== undefined ? (
        <>
          <rect x={X} y={Y} width={W} height={H} fill={def.bandes[0] ?? '#fff'} stroke="rgba(0,0,0,.12)" />
          <circle cx="50" cy="50" r="16" fill={def.disque === null ? color : def.disque} />
        </>
      ) : (
        bandes
      )}
      <rect x={X} y={Y} width={W} height={H} fill="none" stroke="rgba(0,0,0,.18)" />
    </svg>
  );
}

function SujetView({ sujet, color }: { sujet: Sujet; color: string }) {
  if (sujet.fichier) return <LogoView fichier={sujet.fichier} color={color} />;
  if (sujet.drapeau) return <DrapeauView def={sujet.drapeau} color={color} />;
  return null;
}

export default function Coloris({ rng, difficile, onDone }: GameProps) {
  const sujets = useMemo(() => genColoris(rng, difficile), [rng, difficile]);
  // Couleur leurre (fausse) de départ pour chaque sujet, seedée après le tirage.
  const leurres = useMemo(
    () =>
      sujets.map(() => ({
        h: Math.floor(rng() * 360),
        s: 45 + Math.floor(rng() * 45),
        v: 45 + Math.floor(rng() * 45),
      })),
    [sujets, rng],
  );

  const [index, setIndex] = useState(0);
  const [hsv, setHsv] = useState(leurres[0]);
  // Phase de révélation après validation : compare la couleur du joueur à la vraie.
  const [reveal, setReveal] = useState<{ pick: string; vraie: string; prox: number } | null>(null);
  const proxRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  // Précharge les assets de la partie pour éviter un flash au changement de sujet.
  useEffect(() => {
    for (const s of sujets) if (s.fichier) chargeSvg(s.fichier);
  }, [sujets]);

  const sujet = sujets[index];
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const color = rgbCss(rgb);

  // Pendant la révélation, on laisse admirer la correction ~1,8 s puis on enchaîne.
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => {
      if (index + 1 < sujets.length) {
        setIndex(index + 1);
        setHsv(leurres[index + 1]);
        setReveal(null);
      } else {
        doneRef.current = true;
        const moy = proxRef.current.reduce((a, b) => a + b, 0) / proxRef.current.length;
        const adjustMs = Math.round(30 - 0.45 * moy) * 1000;
        onDone({
          adjustMs,
          detail: `proximité moyenne ${moy.toFixed(0)} %`,
          status: adjustMs <= 0 ? 'success' : 'fail',
        });
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [reveal, index, sujets.length, leurres, onDone]);

  function valider() {
    if (doneRef.current || reveal) return;
    const prox = proximite(rgb, hexToRgb(sujet.cible));
    proxRef.current.push(prox);
    setReveal({ pick: color, vraie: sujet.cible, prox });
  }

  // Dégradés d'aperçu des curseurs (teinte fixe pour S et L).
  const teinteGrad =
    'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
  const satGrad = `linear-gradient(to right,${rgbCss(hsvToRgb(hsv.h, 0, hsv.v))},${rgbCss(hsvToRgb(hsv.h, 100, hsv.v))})`;
  const lumGrad = `linear-gradient(to right,#000,${rgbCss(hsvToRgb(hsv.h, hsv.s, 100))})`;

  const dernier = index + 1 >= sujets.length;

  return (
    <div
      className="game-area coloris"
      style={{ '--pick': reveal ? reveal.vraie : color } as CSSProperties}
    >
      <div className="coloris-progress" aria-hidden>
        {sujets.map((_, i) => (
          <span
            key={i}
            className={`coloris-dot${i === index ? ' est-actif' : i < index ? ' est-fait' : ''}`}
          />
        ))}
      </div>
      {reveal ? (
        <div className="coloris-reveal" key={index}>
          <div className="coloris-compare">
            <div className="coloris-cmp">
              <div className="coloris-frame coloris-frame-sm" style={{ '--pick': reveal.pick } as CSSProperties}>
                <SujetView sujet={sujet} color={reveal.pick} />
              </div>
              <span className="coloris-cmp-label">Votre couleur</span>
            </div>
            <div className="coloris-cmp">
              <div className="coloris-frame coloris-frame-sm" style={{ '--pick': reveal.vraie } as CSSProperties}>
                <SujetView sujet={sujet} color={reveal.vraie} />
              </div>
              <span className="coloris-cmp-label">Vraie couleur</span>
            </div>
          </div>
          <div className="coloris-prox">
            <div className="coloris-prox-bar">
              <span style={{ width: `${reveal.prox}%` }} />
            </div>
            <span className="coloris-prox-val">{Math.round(reveal.prox)} % de proximité</span>
          </div>
        </div>
      ) : (
        <>
          <div className="coloris-stage">
            <div className="coloris-frame">
              <SujetView sujet={sujet} color={color} />
            </div>
          </div>
          <div className="coloris-sliders">
            <label>
              <span className="coloris-slider-head">
                <span>Teinte</span>
                <span className="coloris-val">{Math.round(hsv.h)}°</span>
              </span>
              <input
                type="range" min={0} max={360} value={hsv.h} style={{ background: teinteGrad }}
                onChange={(e) => setHsv((c) => ({ ...c, h: +e.target.value }))}
              />
            </label>
            <label>
              <span className="coloris-slider-head">
                <span>Saturation</span>
                <span className="coloris-val">{Math.round(hsv.s)}%</span>
              </span>
              <input
                type="range" min={0} max={100} value={hsv.s} style={{ background: satGrad }}
                onChange={(e) => setHsv((c) => ({ ...c, s: +e.target.value }))}
              />
            </label>
            <label>
              <span className="coloris-slider-head">
                <span>Luminosité</span>
                <span className="coloris-val">{Math.round(hsv.v)}%</span>
              </span>
              <input
                type="range" min={0} max={100} value={hsv.v} style={{ background: lumGrad }}
                onChange={(e) => setHsv((c) => ({ ...c, v: +e.target.value }))}
              />
            </label>
          </div>
          <div className="game-actions">
            <button className="btn btn-primary" onClick={valider}>
              {dernier ? 'Terminer' : 'Valider'}
            </button>
          </div>
          <p className="muted coloris-hint">
            Retrouvez la vraie couleur du sujet. Une seule tentative par sujet !
          </p>
        </>
      )}
    </div>
  );
}
