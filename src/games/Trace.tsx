import { useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import type { GameProps } from './types';

const W = 340;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = 110;
type Pt = [number, number];

function makeShape(name: string): Pt[] {
  const pts: Pt[] = [];
  const n = 240;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    if (name === 'cercle') {
      pts.push([CX + R * Math.cos(t), CY + R * Math.sin(t)]);
    } else if (name === 'triangle') {
      // interpolation le long des 3 côtés
      const verts: Pt[] = [0, 1, 2].map((k) => [
        CX + R * Math.cos(-Math.PI / 2 + (k * 2 * Math.PI) / 3),
        CY + R * Math.sin(-Math.PI / 2 + (k * 2 * Math.PI) / 3),
      ]);
      const seg = Math.floor((i / n) * 3);
      const f = (i / n) * 3 - seg;
      const a = verts[seg];
      const b = verts[(seg + 1) % 3];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    } else if (name === 'etoile') {
      const verts: Pt[] = [];
      for (let k = 0; k < 10; k++) {
        const rad = k % 2 === 0 ? R : R * 0.45;
        const ang = -Math.PI / 2 + (k * Math.PI) / 5;
        verts.push([CX + rad * Math.cos(ang), CY + rad * Math.sin(ang)]);
      }
      const seg = Math.floor((i / n) * 10);
      const f = (i / n) * 10 - seg;
      const a = verts[seg];
      const b = verts[(seg + 1) % 10];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    } else {
      // coeur
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([CX + (x * R) / 17, CY - (y * R) / 17]);
    }
  }
  return pts;
}

export default function Trace({ rng, onDone }: GameProps) {
  const shape = useMemo(() => {
    const name = pick(rng, ['cercle', 'triangle', 'etoile', 'coeur']);
    return { name, pts: makeShape(name) };
  }, [rng]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [acc, setAcc] = useState<number | null>(null);
  const doneRef = useRef(false);

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
          if (doneRef.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrawing(true);
          setStroke([toLocal(e)]);
        }}
        onPointerMove={(e) => drawing && !doneRef.current && setStroke((s) => [...s, toLocal(e)])}
        onPointerUp={() => {
          setDrawing(false);
          finalize(stroke);
        }}
      >
        <path d={path(shape.pts) + ' Z'} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 6" />
        {stroke.length > 1 && <path d={path(stroke)} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />}
        {acc !== null && (
          <text x={CX} y={30} textAnchor="middle" fill="var(--text)" fontWeight={700} fontSize={22}>
            {acc.toFixed(0)} %
          </text>
        )}
      </svg>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Repassez sur le pointillé d'un seul trait. Une seule tentative !
      </p>
    </div>
  );
}
