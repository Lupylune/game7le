import { useMemo, useRef, useState } from 'react';
import { randInt } from '../lib/rng';
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

export default function Ratiole({ rng, onDone }: GameProps) {
  const { poly, target } = useMemo(() => {
    const nPts = randInt(rng, 8, 11);
    const cx = W / 2;
    const cy = H / 2;
    const poly: Pt[] = [];
    for (let k = 0; k < nPts; k++) {
      const ang = (k / nPts) * Math.PI * 2 + rng() * 0.3;
      const rad = 80 + rng() * 55;
      poly.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.85]);
    }
    const target = randInt(rng, 20, 45) / 100;
    return { poly, target };
  }, [rng]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ a: Pt; b: Pt } | null>(null);
  const [result, setResult] = useState<{ p1: Pt[]; p2: Pt[]; frac: number } | null>(null);
  const doneRef = useRef(false);

  function toLocal(e: React.PointerEvent): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  }

  function finalize(a: Pt, b: Pt) {
    if (doneRef.current) return;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 10) {
      setDrag(null);
      return;
    }
    const n: Pt = [dy, -dx];
    const d = a[0] * n[0] + a[1] * n[1];
    const p1 = clip(poly, n, d);
    const p2 = clip(poly, [-n[0], -n[1]], -d);
    const a1 = p1.length >= 3 ? area(p1) : 0;
    const a2 = p2.length >= 3 ? area(p2) : 0;
    const total = a1 + a2;
    if (a1 / total < 0.005 || a2 / total < 0.005) {
      // la droite ne traverse pas la forme : on laisse retenter
      setDrag(null);
      return;
    }
    const frac = a1 / total;
    setResult({ p1, p2, frac });
    doneRef.current = true;
    const err = Math.min(Math.abs(frac - target), Math.abs(frac - (1 - target)));
    let adjustMs: number;
    let detail: string;
    if (err <= 0.01) {
      adjustMs = -21000;
      detail = 'coupe parfaite';
    } else if (err <= 0.03) {
      adjustMs = -15000;
      detail = 'excellente coupe';
    } else if (err <= 0.06) {
      adjustMs = -8000;
      detail = 'bonne coupe';
    } else if (err <= 0.1) {
      adjustMs = 0;
      detail = 'coupe correcte';
    } else if (err <= 0.2) {
      adjustMs = 20000;
      detail = 'coupe ratée';
    } else {
      adjustMs = 45000;
      detail = 'coupe très ratée';
    }
    setTimeout(
      () => onDone({ adjustMs, detail: `${detail} (écart ${(err * 100).toFixed(1)} pts)`, status: adjustMs <= 0 ? 'success' : 'fail' }),
      1800,
    );
  }

  const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <div className="game-area">
      <p className="ratio-target">
        Objectif : {Math.round(target * 100)} % / {Math.round((1 - target) * 100)} %
      </p>
      <svg
        ref={svgRef}
        className="draw-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        onPointerDown={(e) => {
          if (doneRef.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toLocal(e);
          setDrag({ a: p, b: p });
        }}
        onPointerMove={(e) => drag && !doneRef.current && setDrag({ a: drag.a, b: toLocal(e) })}
        onPointerUp={() => {
          if (drag) finalize(drag.a, drag.b);
          setDrag(null);
        }}
      >
        {!result && <polygon points={pts(poly)} fill="var(--accent)" opacity={0.55} stroke="var(--accent)" strokeWidth={2} />}
        {result && (
          <>
            <polygon points={pts(result.p1)} fill="var(--success)" opacity={0.6} stroke="var(--success)" />
            <polygon points={pts(result.p2)} fill="var(--warning)" opacity={0.6} stroke="var(--warning)" />
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
        Tracez une droite qui coupe la forme selon le ratio cible. Une seule tentative !
      </p>
    </div>
  );
}
