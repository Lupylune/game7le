import { useMemo, useRef, useState } from 'react';
import { pick, randInt } from '../lib/rng';
import type { RNG } from '../lib/rng';
import type { GameProps } from './types';

const W = 340;
const H = 300;
type Pt = [number, number];

function area(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Aire d'une forme = contour extérieur moins ses trous. */
function aireForme(outer: Pt[], holes: Pt[][]): number {
  if (outer.length < 3) return 0;
  let a = area(outer);
  for (const h of holes) if (h.length >= 3) a -= area(h);
  return Math.max(0, a);
}

/** Découpe le polygone par le demi-plan side((p)·n - d) >= 0 (Sutherland–Hodgman). */
function clip(poly: Pt[], n: Pt, d: number): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => p[0] * n[0] + p[1] * n[1] - d;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

const N_FORMES = 3;

/** « Patate » : polygone bruité vaguement circulaire. */
function patate(rng: RNG, cx: number, cy: number, rBase: number, rVar: number, nPts: number): Pt[] {
  const p: Pt[] = [];
  for (let k = 0; k < nPts; k++) {
    const ang = (k / nPts) * Math.PI * 2 + rng() * 0.3;
    const rad = rBase + rng() * rVar;
    p.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.85]);
  }
  return p;
}

function etoile(cx: number, cy: number, rOut: number, rIn: number, branches: number, rot: number): Pt[] {
  const p: Pt[] = [];
  for (let k = 0; k < branches * 2; k++) {
    const rad = k % 2 === 0 ? rOut : rIn;
    const a = rot - Math.PI / 2 + (k * Math.PI) / branches;
    p.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return p;
}

function croix(cx: number, cy: number, r: number, w: number): Pt[] {
  return [
    [-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w],
    [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w],
  ].map(([x, y]) => [cx + x, cy + y] as Pt);
}

type Shape = { outer: Pt[]; holes: Pt[][]; target: number };

/** Génère une forme aléatoire (patate, anneau, cadre, étoile, croix, patate trouée). */
function makeShape(rng: RNG): Shape {
  const cx = W / 2;
  const cy = H / 2;
  // poids : patate ×2, patate trouée ×2, cadre/étoile/croix ×1
  const type = pick(rng, [0, 0, 1, 1, 2, 3, 4]);
  let outer: Pt[];
  const holes: Pt[][] = [];
  if (type === 0) {
    outer = patate(rng, cx, cy, 80, 55, randInt(rng, 8, 11));
  } else if (type === 1) {
    // patate avec un trou décentré
    outer = patate(rng, cx, cy, 95, 45, randInt(rng, 8, 11));
    const ox = cx + (rng() - 0.5) * 70;
    const oy = cy + (rng() - 0.5) * 50;
    holes.push(patate(rng, ox, oy, 26, 16, 8).reverse());
  } else if (type === 2) {
    // cadre rectangulaire
    const rw = 100 + rng() * 20;
    const rh = 85 + rng() * 15;
    outer = [[-rw, -rh], [rw, -rh], [rw, rh], [-rw, rh]].map(([x, y]) => [cx + x, cy + y] as Pt);
    const iw = rw * (0.35 + rng() * 0.15);
    const ih = rh * (0.35 + rng() * 0.15);
    // trou décentré, en gardant une marge à l'intérieur du cadre
    const ox = (rng() - 0.5) * 2 * (rw - iw - 12);
    const oy = (rng() - 0.5) * 2 * (rh - ih - 12);
    holes.push(
      [[-iw, -ih], [-iw, ih], [iw, ih], [iw, -ih]].map(([x, y]) => [cx + ox + x, cy + oy + y] as Pt),
    );
  } else if (type === 3) {
    // étoile
    const branches = randInt(rng, 5, 6);
    outer = etoile(cx, cy, 120, 55, branches, rng() * Math.PI);
  } else {
    // croix
    outer = croix(cx, cy, 115, 40 + rng() * 15);
  }
  const target = randInt(rng, 20, 45) / 100;
  return { outer, holes, target };
}

/** Barème par coupe (÷3 environ par rapport à l'ancienne coupe unique). */
function bareme(err: number): [number, string] {
  if (err <= 0.01) return [-7000, 'coupe parfaite'];
  if (err <= 0.03) return [-5000, 'excellente coupe'];
  if (err <= 0.06) return [-3000, 'bonne coupe'];
  if (err <= 0.1) return [0, 'coupe correcte'];
  if (err <= 0.2) return [7000, 'coupe ratée'];
  return [15000, 'coupe très ratée'];
}

type Result = {
  p1o: Pt[];
  p1h: Pt[][];
  p2o: Pt[];
  p2h: Pt[][];
  frac: number;
  nn: Pt; // normale unitaire de la coupe (direction d'écartement de la partie 1)
};

export default function Ratiole({ rng, onAdjust, onDone }: GameProps) {
  const formes = useMemo(() => Array.from({ length: N_FORMES }, () => makeShape(rng)), [rng]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [etape, setEtape] = useState(0);
  const [drag, setDrag] = useState<{ a: Pt; b: Pt } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [split, setSplit] = useState(false); // déclenche l'animation d'écartement
  const errsRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  const { outer, holes, target } = formes[etape];

  function toLocal(e: React.PointerEvent): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  }

  function finalize(a: Pt, b: Pt) {
    if (doneRef.current || result) return;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const long = Math.hypot(dx, dy);
    if (long < 10) {
      setDrag(null);
      return;
    }
    const n: Pt = [dy, -dx];
    const d = a[0] * n[0] + a[1] * n[1];
    const p1o = clip(outer, n, d);
    const p2o = clip(outer, [-n[0], -n[1]], -d);
    const p1h = holes.map((h) => clip(h, n, d));
    const p2h = holes.map((h) => clip(h, [-n[0], -n[1]], -d));
    const a1 = aireForme(p1o, p1h);
    const a2 = aireForme(p2o, p2h);
    const total = a1 + a2;
    if (total <= 0 || a1 / total < 0.005 || a2 / total < 0.005) {
      // la droite ne traverse pas la matière : on laisse retenter
      setDrag(null);
      return;
    }
    const frac = a1 / total;
    const nn: Pt = [n[0] / long, n[1] / long];
    setResult({ p1o, p1h, p2o, p2h, frac, nn });
    // laisse le rendu poser la position initiale, puis anime l'écartement
    requestAnimationFrame(() => requestAnimationFrame(() => setSplit(true)));
    const err = Math.min(Math.abs(frac - target), Math.abs(frac - (1 - target)));
    errsRef.current.push(err);
    const [adjustMs, detail] = bareme(err);
    if (etape < N_FORMES - 1) {
      // coupes intermédiaires : ajustement immédiat, puis forme suivante
      if (adjustMs !== 0) onAdjust(adjustMs, detail.charAt(0).toUpperCase() + detail.slice(1));
      setTimeout(() => {
        setSplit(false);
        setResult(null);
        setEtape(etape + 1);
      }, 1700);
    } else {
      // dernière coupe : son ajustement passe par onDone (pas de double compte)
      doneRef.current = true;
      const moy = errsRef.current.reduce((s, e) => s + e, 0) / N_FORMES;
      setTimeout(
        () =>
          onDone({
            adjustMs,
            detail: `${N_FORMES} coupes · écart moyen ${(moy * 100).toFixed(1)} pts`,
            status: moy <= 0.1 ? 'success' : 'fail',
          }),
        2000,
      );
    }
  }

  // Chemin SVG multi-contours (evenodd) : extérieur + trous.
  const pathOf = (contours: Pt[][]) =>
    contours
      .filter((c) => c.length >= 3)
      .map((c) => 'M' + c.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z')
      .join(' ');

  const ECART = 20;
  const gStyle = (dir: 1 | -1): React.CSSProperties => ({
    transform: split
      ? `translate(${result!.nn[0] * ECART * dir}px, ${result!.nn[1] * ECART * dir}px)`
      : 'translate(0px, 0px)',
    transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
    opacity: 0.6,
  });

  // Un morceau : remplissage evenodd (trous inclus) + contour clippé à la
  // matière. Sans le clip, l'arête de coupe de l'extérieur traverserait le vide
  // du trou en ligne droite et ce segment resterait tracé dans les deux
  // morceaux ; en clippant le tracé à la région pleine, la portion qui passe
  // sur le trou disparaît, et le bord du trou reçoit son propre contour.
  const morceau = (o: Pt[], h: Pt[][], couleur: string, id: string) => {
    const d = pathOf([o, ...h]);
    return (
      <>
        <clipPath id={id}>
          <path d={d} fillRule="evenodd" />
        </clipPath>
        <path d={d} fillRule="evenodd" fill={couleur} />
        <path d={d} fill="none" stroke={couleur} strokeWidth={2} clipPath={`url(#${id})`} />
      </>
    );
  };

  return (
    <div className="game-area">
      <p className="ratio-target">
        Forme {etape + 1}/{N_FORMES} · Objectif : {Math.round(target * 100)} % /{' '}
        {Math.round((1 - target) * 100)} %
      </p>
      <svg
        ref={svgRef}
        className="draw-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        onPointerDown={(e) => {
          if (doneRef.current || result) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toLocal(e);
          setDrag({ a: p, b: p });
        }}
        onPointerMove={(e) => drag && !doneRef.current && !result && setDrag({ a: drag.a, b: toLocal(e) })}
        onPointerUp={() => {
          if (drag) finalize(drag.a, drag.b);
          setDrag(null);
        }}
      >
        {!result && (
          <path d={pathOf([outer, ...holes])} fillRule="evenodd" fill="var(--accent)" opacity={0.55} stroke="var(--accent)" strokeWidth={2} />
        )}
        {result && (
          <>
            <g style={gStyle(1)}>{morceau(result.p1o, result.p1h, 'var(--success)', 'ratio-clip-1')}</g>
            <g style={gStyle(-1)}>{morceau(result.p2o, result.p2h, 'var(--warning)', 'ratio-clip-2')}</g>
            <text x={W / 2} y={24} textAnchor="middle" fill="var(--text)" fontWeight={700}>
              {Math.round(result.frac * 100)} % / {Math.round((1 - result.frac) * 100)} %
            </text>
          </>
        )}
        {drag && (
          <line
            x1={drag.a[0]}
            y1={drag.a[1]}
            x2={drag.b[0]}
            y2={drag.b[1]}
            stroke="var(--text)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </svg>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Tracez une droite qui coupe la forme selon le ratio cible — {N_FORMES} formes à la suite,
        une seule tentative chacune !
      </p>
    </div>
  );
}
