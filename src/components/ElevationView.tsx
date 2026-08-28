import { BOX_BY_ID, UNIT_CM } from '../data/catalog';
import type { Plan, Space } from '../domain/types';
import { usableDims } from '../domain/types';
import { skuColor } from './format';

interface Props {
  plan: Plan;
  space: Space;
  selectable?: boolean;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
}

/** Front elevation: how the stack uses the available headroom. */
export default function ElevationView({
  plan,
  space,
  selectable = false,
  selected = null,
  onSelect,
}: Props) {
  const usable = usableDims(space);
  const scale = 7; // px per cm
  const w = Math.max(1, usable.widthCm) * scale;
  const h = Math.max(1, usable.heightCm) * scale;

  // Front row only: boxes touching the front edge of the space.
  const front = plan.placements
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.y === 0);

  return (
    <svg
      className="elevation"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label="Front elevation of the stack"
      onPointerDown={(e) => {
        if (selectable && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <rect x={0} y={0} width={w} height={h} className="elevation__cavity" />

      {front.map(({ p, index }) => {
        const sku = BOX_BY_ID.get(p.skuId);
        if (!sku) return null;
        const boxH = sku.heightCm * scale;
        return (
          <rect
            key={index}
            x={p.x * UNIT_CM * scale + 1}
            y={h - (p.zCm + sku.heightCm) * scale + 1}
            width={p.w * UNIT_CM * scale - 2}
            height={boxH - 2}
            rx={3}
            fill={skuColor(sku)}
            className={`elevation__box${selected === index ? ' is-selected' : ''}`}
            style={{ cursor: selectable ? 'pointer' : 'default' }}
            onPointerDown={() => selectable && onSelect?.(index)}
          />
        );
      })}

      {plan.wastedHeightCm > 0.05 && (
        <text x={4} y={14} className="elevation__waste">
          {plan.wastedHeightCm.toFixed(1)} cm unused headroom
        </text>
      )}
    </svg>
  );
}
