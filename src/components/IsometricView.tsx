import { useRef, useState } from 'react';
import type { BoxSku } from '../data/catalog';
import { BOX_BY_ID } from '../data/catalog';
import { canPlace, isSupported, otherThan, restHeight } from '../domain/edit';
import type { Placement, Plan, Space } from '../domain/types';
import { usableDims } from '../domain/types';
import { skuFaces } from './format';
import { isoBounds, isoGridDelta, isoProject } from './iso';

interface Props {
  plan: Plan;
  space: Space;
  editable?: boolean;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  onMove?: (index: number, x: number, y: number) => void;
}

const PAD_LEFT = 54;
const PAD = 18;

interface Item {
  index: number;
  placement: Placement;
  sku: BoxSku;
  floating: boolean;
}

export default function IsometricView({
  plan,
  space,
  editable = false,
  selected = null,
  onSelect,
  onMove,
}: Props) {
  const usable = usableDims(space);
  const { gridW, gridD } = plan;
  const maxCm = Math.max(usable.heightCm, plan.usedHeightCm);
  const svgRef = useRef<SVGSVGElement>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    index: number;
    dx: number;
    dy: number;
    zCm: number;
    valid: boolean;
  } | null>(null);

  const { offX, offY, width: w, height: h } = isoBounds(gridW, gridD, maxCm, PAD_LEFT, PAD);

  /** Grid cell + height in cm to a point on the padded isometric plane. */
  const at = (gx: number, gy: number, zCm: number): [number, number] => {
    const [x, y] = isoProject(gx, gy, zCm);
    return [offX + x, offY + y];
  };
  const poly = (points: [number, number][]) => points.map(([x, y]) => `${x},${y}`).join(' ');
  const items: Item[] = [];
  plan.placements.forEach((placement, index) => {
    const sku = BOX_BY_ID.get(placement.skuId);
    if (!sku) return;
    items.push({
      index,
      placement,
      sku,
      floating: !isSupported(placement, otherThan(plan.placements, index)),
    });
  });
  // Painter's algorithm: far corner first, then bottom-up within a diagonal.
  items.sort(
    (a, b) =>
      a.placement.x + a.placement.y - (b.placement.x + b.placement.y) ||
      a.placement.zCm - b.placement.zCm,
  );

  function beginDrag(index: number, e: React.PointerEvent<SVGGElement>) {
    if (!editable) return;
    onSelect?.(index);
    origin.current = { x: e.clientX, y: e.clientY };
    const zCm = plan.placements[index]?.zCm ?? 0;
    setDrag({ index, dx: 0, dy: 0, zCm, valid: true });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<SVGGElement>) {
    if (!drag) return;
    const p = plan.placements[drag.index];
    if (!p) return;

    // The SVG may be scaled down by max-width, so undo that before inverting.
    const scale = (svgRef.current?.getBoundingClientRect().width ?? w) / w;
    const [dx, dy] = isoGridDelta(
      e.clientX - origin.current.x,
      e.clientY - origin.current.y,
      scale,
    );

    // The box drops onto whatever is already at the target footprint.
    const others = otherThan(plan.placements, drag.index);
    const moved = { ...p, x: p.x + dx, y: p.y + dy };
    const valid = canPlace(moved, others, gridW, gridD, usable.heightCm);
    setDrag({
      index: drag.index,
      dx,
      dy,
      zCm: valid ? restHeight(moved, others) : p.zCm,
      valid,
    });
  }

  function endDrag() {
    if (drag && (drag.dx !== 0 || drag.dy !== 0) && drag.valid) {
      const p = plan.placements[drag.index];
      if (p) onMove?.(drag.index, p.x + drag.dx, p.y + drag.dy);
    }
    setDrag(null);
  }

  return (
    <svg
      ref={svgRef}
      className={`iso${editable ? ' is-editable' : ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Isometric view of ${space.name || 'the space'}, ${plan.boxCount} boxes`}
      onPointerDown={(e) => {
        if (editable && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <polygon
        className="iso__floor"
        points={poly([at(0, 0, 0), at(gridW, 0, 0), at(gridW, gridD, 0), at(0, gridD, 0)])}
      />

      {Array.from({ length: gridW + 1 }, (_, i) => (
        <line key={`gx${i}`} {...seg(at(i, 0, 0), at(i, gridD, 0))} className="iso__grid" />
      ))}
      {Array.from({ length: gridD + 1 }, (_, j) => (
        <line key={`gy${j}`} {...seg(at(0, j, 0), at(gridW, j, 0))} className="iso__grid" />
      ))}

      {/* Wireframe of the usable cavity, so leftover headroom is visible. */}
      <polygon
        className="iso__cavity"
        points={poly([
          at(0, 0, usable.heightCm),
          at(gridW, 0, usable.heightCm),
          at(gridW, gridD, usable.heightCm),
          at(0, gridD, usable.heightCm),
        ])}
      />
      {(
        [
          [0, 0],
          [gridW, 0],
          [gridW, gridD],
          [0, gridD],
        ] as const
      ).map(([gx, gy]) => (
        <line
          key={`post${gx}-${gy}`}
          {...seg(at(gx, gy, 0), at(gx, gy, usable.heightCm))}
          className="iso__cavity-edge"
        />
      ))}

      {items.map(({ index, placement, sku, floating }) => {
        const dragging = drag?.index === index;
        const dx = dragging ? drag.dx : 0;
        const dy = dragging ? drag.dy : 0;
        const x0 = placement.x + dx;
        const x1 = x0 + placement.w;
        const y0 = placement.y + dy;
        const y1 = y0 + placement.d;
        const z0 = dragging ? drag.zCm : placement.zCm;
        const z1 = z0 + sku.heightCm;
        const face = skuFaces(sku);
        const classes = [
          'iso__box',
          selected === index ? 'is-selected' : '',
          dragging && !drag.valid ? 'is-invalid' : '',
          floating ? 'is-floating' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <g
            key={index}
            className={classes}
            onPointerDown={(e) => beginDrag(index, e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: editable ? 'grab' : 'default' }}
          >
            <polygon
              fill={face.left}
              points={poly([at(x0, y1, z1), at(x1, y1, z1), at(x1, y1, z0), at(x0, y1, z0)])}
            />
            <polygon
              fill={face.right}
              points={poly([at(x1, y0, z1), at(x1, y1, z1), at(x1, y1, z0), at(x1, y0, z0)])}
            />
            <polygon
              fill={face.top}
              points={poly([at(x0, y0, z1), at(x1, y0, z1), at(x1, y1, z1), at(x0, y1, z1)])}
            />
            <text {...point(at((x0 + x1) / 2, (y0 + y1) / 2, z1))} className="iso__label">
              {placement.skuId}
            </text>
          </g>
        );
      })}

      <text x={4} y={13} className="iso__waste">
        {plan.usedHeightCm.toFixed(1)} cm used
        {plan.wastedHeightCm > 0.05 ? ` · ${plan.wastedHeightCm.toFixed(1)} cm free` : ''}
      </text>
    </svg>
  );
}

function seg([x1, y1]: [number, number], [x2, y2]: [number, number]) {
  return { x1, y1, x2, y2 };
}

function point([x, y]: [number, number]) {
  return { x, y };
}
