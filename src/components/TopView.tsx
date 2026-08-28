import { useRef, useState } from 'react';
import { BOX_BY_ID, UNIT_CM } from '../data/catalog';
import { canPlace, levelsOf, otherThan, restHeight } from '../domain/edit';
import type { Placement } from '../domain/types';
import { skuColor } from './format';

interface Props {
  placements: Placement[];
  gridW: number;
  gridD: number;
  usableHeightCm: number;
  editable?: boolean | undefined;
  selected?: number | null | undefined;
  onSelect?: ((index: number | null) => void) | undefined;
  onMove?: ((index: number, x: number, y: number) => void) | undefined;
}

const CELL = 46;

/** Top-down plan, one grid per stacking level. */
export default function TopView({
  placements,
  gridW,
  gridD,
  usableHeightCm,
  editable = false,
  selected = null,
  onSelect,
  onMove,
}: Props) {
  const levels = levelsOf(placements);

  return (
    <div className="levels">
      {levels.map((zCm) => (
        <figure key={zCm}>
          <LevelGrid
            placements={placements}
            zCm={zCm}
            gridW={gridW}
            gridD={gridD}
            usableHeightCm={usableHeightCm}
            editable={editable}
            selected={selected}
            onSelect={onSelect}
            onMove={onMove}
          />
          <figcaption className="muted small">
            {zCm === 0 ? 'On the floor' : `Stacked at ${zCm.toFixed(1)} cm`} ·{' '}
            {placements.filter((p) => Math.abs(p.zCm - zCm) < 0.01).length} boxes
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

interface LevelProps extends Props {
  zCm: number;
}

function LevelGrid({
  placements,
  zCm,
  gridW,
  gridD,
  usableHeightCm,
  editable = false,
  selected = null,
  onSelect,
  onMove,
}: LevelProps) {
  const w = gridW * CELL;
  const h = gridD * CELL;
  const [drag, setDrag] = useState<{ index: number; dx: number; dy: number; valid: boolean } | null>(
    null,
  );
  const origin = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const onThisLevel = placements
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => Math.abs(p.zCm - zCm) < 0.01);

  function beginDrag(index: number, e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    onSelect?.(index);
    origin.current = { x: e.clientX, y: e.clientY };
    setDrag({ index, dx: 0, dy: 0, valid: true });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<SVGGElement>) {
    if (!drag) return;
    const p = placements[drag.index];
    if (!p) return;
    // The SVG may be scaled down by max-width, so undo that before snapping.
    const step = (CELL * (svgRef.current?.getBoundingClientRect().width ?? w)) / w;
    const dx = Math.round((e.clientX - origin.current.x) / step);
    const dy = Math.round((e.clientY - origin.current.y) / step);
    const others = otherThan(placements, drag.index);
    const moved = { ...p, x: p.x + dx, y: p.y + dy };
    setDrag({
      index: drag.index,
      dx,
      dy,
      // A move is only valid if the box still lands on this level.
      valid:
        canPlace(moved, others, gridW, gridD, usableHeightCm) &&
        Math.abs(restHeight(moved, others) - zCm) < 0.01,
    });
  }

  function endDrag() {
    if (drag) {
      const p = placements[drag.index];
      if (p && drag.valid && (drag.dx !== 0 || drag.dy !== 0)) {
        onMove?.(drag.index, p.x + drag.dx, p.y + drag.dy);
      }
    }
    setDrag(null);
  }

  return (
    <svg
      ref={svgRef}
      className={`layer-grid${editable ? ' is-editable' : ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Level at ${zCm} cm, ${onThisLevel.length} boxes`}
      onPointerDown={(e) => {
        if (editable && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <rect x={0} y={0} width={w} height={h} className="layer-grid__floor" />

      {Array.from({ length: gridW - 1 }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={h} />
      ))}
      {Array.from({ length: gridD - 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * CELL} x2={w} y2={(i + 1) * CELL} />
      ))}

      {onThisLevel.map(({ p, index }) => {
        const sku = BOX_BY_ID.get(p.skuId);
        if (!sku) return null;
        const dragging = drag?.index === index;
        const pad = 2;
        const x = (p.x + (dragging ? drag.dx : 0)) * CELL + pad;
        const y = (p.y + (dragging ? drag.dy : 0)) * CELL + pad;
        const boxW = p.w * CELL - 2 * pad;
        const boxD = p.d * CELL - 2 * pad;
        const classes = [
          'layer-grid__box',
          selected === index ? 'is-selected' : '',
          dragging && !drag.valid ? 'is-invalid' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <g
            key={index}
            onPointerDown={(e) => beginDrag(index, e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: editable ? 'grab' : 'default' }}
          >
            <rect
              x={x}
              y={y}
              width={boxW}
              height={boxD}
              rx={5}
              fill={skuColor(sku)}
              className={classes}
            />
            <text x={x + boxW / 2} y={y + boxD / 2} className="layer-grid__label">
              {p.skuId}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function gridSizeCm(gridW: number, gridD: number): string {
  return `${(gridW * UNIT_CM).toFixed(1)} × ${(gridD * UNIT_CM).toFixed(1)} cm`;
}
