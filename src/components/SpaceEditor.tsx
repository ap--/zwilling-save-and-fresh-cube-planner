import { UNIT_CM } from '../data/catalog';
import type { Space, SpaceKind } from '../domain/types';
import { usableDims } from '../domain/types';

interface Props {
  space: Space;
  onChange: (patch: Partial<Space>) => void;
  onRemove: () => void;
}

const FIELDS = [
  { key: 'widthCm', label: 'Width' },
  { key: 'depthCm', label: 'Depth' },
  { key: 'heightCm', label: 'Height' },
] as const;

export default function SpaceEditor({ space, onChange, onRemove }: Props) {
  const usable = usableDims(space);
  const cellsW = Math.floor(usable.widthCm / UNIT_CM);
  const cellsD = Math.floor(usable.depthCm / UNIT_CM);
  const leftoverW = usable.widthCm - cellsW * UNIT_CM;
  const leftoverD = usable.depthCm - cellsD * UNIT_CM;

  return (
    <section className="editor">
      <div className="editor__row">
        <label className="field field--grow">
          <span>Name</span>
          <input
            value={space.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Drawer left of the hob"
          />
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={space.kind}
            onChange={(e) => onChange({ kind: e.target.value as SpaceKind })}
          >
            <option value="drawer">Drawer</option>
            <option value="shelf">Shelf / counter</option>
          </select>
        </label>
        <button type="button" className="btn btn--danger" onClick={onRemove}>
          Delete
        </button>
      </div>

      <div className="editor__row">
        {FIELDS.map((f) => (
          <label className="field" key={f.key}>
            <span>{f.label} (cm)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={space[f.key]}
              onChange={(e) => onChange({ [f.key]: Number(e.target.value) || 0 })}
            />
          </label>
        ))}
        <label className="field">
          <span>Clearance (cm)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={space.marginCm}
            onChange={(e) => onChange({ marginCm: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <p className="editor__hint">
        Usable {usable.widthCm.toFixed(1)} × {usable.depthCm.toFixed(1)} ×{' '}
        {usable.heightCm.toFixed(1)} cm → grid <strong>{cellsW} × {cellsD}</strong> cells of{' '}
        {UNIT_CM} cm.
        {(leftoverW > 0.5 || leftoverD > 0.5) && (
          <> {leftoverW.toFixed(1)} cm × {leftoverD.toFixed(1)} cm falls outside the grid.</>
        )}
      </p>
    </section>
  );
}
