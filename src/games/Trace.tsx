import { useEffect, useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import type { GameProps } from './types';

// « Comète » qui parcourt la forme : taille du segment visible et durée du tour
const SEGMENT = 18;
const PARCOURS_MS = 2600;
const PAUSE_MS = 400; // respiration avant le départ du segment

const W = 340;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = 110;
type Pt = [number, number];

/** Interpole n points le long d'un polygone fermé. */
function polygone(verts: Pt[], n: number): Pt[] {
  const pts: Pt[] = [];
  const m = verts.length;
  for (let i = 0; i < n; i++) {
    const seg = Math.floor((i / n) * m);
    const f = (i / n) * m - seg;
    const a = verts[seg];
    const b = verts[(seg + 1) % m];
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return pts;
}

/** Sommets donnés en coordonnées relatives au centre (échelle R). */
const abs = (v: Pt[]): Pt[] => v.map(([x, y]) => [CX + x * R, CY + y * R]);

const FORMES = [
  'cercle',
  'triangle',
  'etoile',
  'coeur',
  'carre',
  'losange',
  'croix',
  'maison',
  'sablier',
  'eclair',
  'lune',
  'infini',
];

function makeShape(name: string): Pt[] {
  const pts: Pt[] = [];
  const n = 240;

  if (name === 'triangle') {
    return polygone(
      abs([0, 1, 2].map((k) => {
        const ang = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        return [Math.cos(ang), Math.sin(ang)] as Pt;
      })),
      n,
    );
  }
  if (name === 'etoile') {
    const verts: Pt[] = [];
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 === 0 ? 1 : 0.45;
      const ang = -Math.PI / 2 + (k * Math.PI) / 5;
      verts.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
    }
    return polygone(abs(verts), n);
  }
  if (name === 'carre') {
    return polygone(abs([[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]), n);
  }
  if (name === 'losange') {
    return polygone(abs([[0, -1], [0.72, 0], [0, 1], [-0.72, 0]]), n);
  }
  if (name === 'croix') {
    const w = 0.38;
    return polygone(
      abs([
        [-w, -1], [w, -1], [w, -w], [1, -w], [1, w], [w, w],
        [w, 1], [-w, 1], [-w, w], [-1, w], [-1, -w], [-w, -w],
      ]),
      n,
    );
  }
  if (name === 'maison') {
    return polygone(abs([[-0.85, 0.9], [-0.85, -0.15], [0, -0.95], [0.85, -0.15], [0.85, 0.9]]), n);
  }
  if (name === 'sablier') {
    return polygone(abs([[-0.7, -0.95], [0.7, -0.95], [-0.7, 0.95], [0.7, 0.95]]), n);
  }
  if (name === 'eclair') {
    return polygone(
      abs([[-0.15, -1], [0.5, -1], [0.1, -0.2], [0.55, -0.2], [-0.5, 1], [-0.1, 0.05], [-0.55, 0.05]]),
      n,
    );
  }

  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    if (name === 'cercle') {
      pts.push([CX + R * Math.cos(t), CY + R * Math.sin(t)]);
    } else if (name === 'lune') {
      // croissant : grand arc du cercle unité + arc du cercle intérieur (décalé)
      const cx2 = 0.5;
      const r2 = 0.8;
      const x = (1 - r2 * r2 + cx2 * cx2) / (2 * cx2); // pointes (intersections)
      const y = Math.sqrt(Math.max(0, 1 - x * x));
      const a1 = Math.atan2(y, x); // pointe, sur le cercle extérieur
      const b1 = Math.atan2(y, x - cx2); // pointe, sur le cercle intérieur
      const part = 0.62; // part du parcours passée sur l'arc extérieur
      const f = i / n;
      if (f < part) {
        const ang = a1 + ((2 * Math.PI - 2 * a1) * f) / part;
        pts.push([CX + R * Math.cos(ang), CY + R * Math.sin(ang)]);
      } else {
        const ang = 2 * Math.PI - b1 - ((2 * Math.PI - 2 * b1) * (f - part)) / (1 - part);
        pts.push([CX + R * (cx2 + r2 * Math.cos(ang)), CY + R * r2 * Math.sin(ang)]);
      }
    } else if (name === 'infini') {
      // lemniscate de Bernoulli
      const d = 1 + Math.sin(t) ** 2;
      pts.push([CX + (R * 1.25 * Math.cos(t)) / d, CY + (R * 1.25 * Math.sin(t) * Math.cos(t)) / d]);
    } else {
      // coeur
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([CX + (x * R) / 17, CY - (y * R) / 17]);
    }
  }
  return pts;
}

export default function Trace({ rng, onAdjust, onDone }: GameProps) {
  const shape = useMemo(() => {
    const name = pick(rng, FORMES);
    return { name, pts: makeShape(name) };
  }, [rng]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [acc, setAcc] = useState<number | null>(null);
  const doneRef = useRef(false);

  // Un segment parcourt la forme puis tout disparaît : on dessine de mémoire.
  // La position est dérivée du temps écoulé (et non incrémentée tick par
  // tick) pour rester correcte même sous l'horloge simulée des tests e2e.
  // head : tête du segment (index dans pts), -1 = séquence terminée
  const [head, setHead] = useState(0);
  const [replays, setReplays] = useState(0); // « Revoir le tracé » relance la séquence
  const n = shape.pts.length;
  useEffect(() => {
    setHead(0);
    const debut = performance.now() + PAUSE_MS;
    const t = setInterval(() => {
      const p = (performance.now() - debut) / PARCOURS_MS;
      if (p >= 1 + SEGMENT / n) {
        setHead(-1);
        clearInterval(t);
      } else {
        setHead(Math.max(0, Math.floor(p * n)));
      }
    }, 25);
    return () => clearInterval(t);
  }, [replays, n]);
  const revealing = head !== -1;
  const segment = revealing ? shape.pts.slice(Math.max(0, head - SEGMENT), Math.min(head, n)) : [];

  function toLocal(e: React.PointerEvent): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  }

  function finalize(pts: Pt[]) {
    if (doneRef.current) return;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (pts.length < 15 || len < R) {
      setStroke([]); // trop court : on laisse retenter
      return;
    }
    doneRef.current = true;
    const meanDist = (from: Pt[], to: Pt[]) => {
      let sum = 0;
      for (const p of from) {
        let best = Infinity;
        for (const q of to) {
          const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
          if (d < best) best = d;
        }
        sum += Math.sqrt(best);
      }
      return sum / from.length;
    };
    const dev = (meanDist(pts, shape.pts) + meanDist(shape.pts, pts)) / 2;
    const accuracy = Math.max(0, Math.min(100, 100 * (1 - dev / (0.3 * R))));
    setAcc(accuracy);
    const adjustMs = Math.round(90 - 1.3 * accuracy) * 1000;
    setTimeout(
      () =>
        onDone({
          adjustMs,
          detail: `précision ${accuracy.toFixed(0)} %`,
          status: adjustMs <= 0 ? 'success' : 'fail',
        }),
      1600,
    );
  }

  const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  return (
    <div className="game-area">
      <svg
        ref={svgRef}
        className="draw-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        onPointerDown={(e) => {
          if (doneRef.current || revealing) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrawing(true);
          setStroke([toLocal(e)]);
        }}
        onPointerMove={(e) => drawing && !doneRef.current && setStroke((s) => [...s, toLocal(e)])}
        onPointerUp={() => {
          if (!drawing) return;
          setDrawing(false);
          finalize(stroke);
        }}
      >
        {segment.length > 1 && (
          <path d={path(segment)} fill="none" stroke="var(--text-muted)" strokeWidth={2.5} strokeLinecap="round" />
        )}
        {stroke.length > 1 && <path d={path(stroke)} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />}
        {acc !== null && (
          <text x={CX} y={30} textAnchor="middle" fill="var(--text)" fontWeight={700} fontSize={22}>
            {acc.toFixed(0)} %
          </text>
        )}
      </svg>
      {!revealing && acc === null && !drawing && (
        <div className="game-actions">
          <button
            className="btn btn-sm"
            onClick={() => {
              onAdjust(10000, 'Tracé revu');
              setStroke([]);
              setReplays((r) => r + 1);
            }}
          >
            Revoir le tracé (+10 s)
          </button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        {revealing
          ? 'Mémorisez la forme que dessine le segment…'
          : "Reproduisez la forme de mémoire, d'un seul trait. Une seule tentative !"}
      </p>
    </div>
  );
}
