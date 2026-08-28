import { useMemo, useRef, useState } from 'react';
import ElevationView from './components/ElevationView';
import IsometricView from './components/IsometricView';
import ShoppingList, { mergeCounts } from './components/ShoppingList';
import SpaceEditor from './components/SpaceEditor';
import TopView, { gridSizeCm } from './components/TopView';
import { eur, litres } from './components/format';
import { BOXES } from './data/catalog';
import {
  fillEmpty,
  firstFreeSpot,
  otherThan,
  planFrom,
  restHeight,
  settle,
  swapCandidates,
} from './domain/edit';
import { OBJECTIVES, planForObjective } from './domain/solve';
import type { Objective, Placement } from './domain/types';
import { usableDims } from './domain/types';
import { downloadJson, parseState, usePlanner } from './state/store';

const OBJECTIVE_LABEL: Record<Objective, string> = {
  volume: 'Most storage',
  price: 'Lowest price',
  count: 'Fewest boxes',
};

const VIEWS = [
  { id: '3d', label: '3D' },
  { id: 'layers', label: 'Top' },
  { id: 'front', label: 'Front' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

export default function App() {
  const planner = usePlanner();
  const { spaces, objective, edits, selected } = planner;
  const [newName, setNewName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [view, setView] = useState<ViewId>('3d');
  const fileInput = useRef<HTMLInputElement>(null);

  const plans = useMemo(
    () =>
      spaces.map((s) => {
        const auto = planForObjective(s, objective);
        const manual = edits[s.id];
        return manual ? planFrom(s, manual, objective, auto.gridW, auto.gridD) : auto;
      }),
    [spaces, objective, edits],
  );
  const totals = useMemo(() => mergeCounts(plans.map((p) => p.counts)), [plans]);
  const selectedIndex = selected ? spaces.findIndex((s) => s.id === selected.id) : -1;
  const selectedPlan = selectedIndex >= 0 ? plans[selectedIndex]! : null;
  const isEditing = selected ? edits[selected.id] !== undefined : false;
  const usableHeightCm = selected ? usableDims(selected).heightCm : 0;

  const picked =
    isEditing && pick !== null && selectedPlan ? selectedPlan.placements[pick] : undefined;

  /**
   * Replaces the current space's hand-edited box list. Everything is settled on the
   * way in, so what we store is always a stack that could really stand up.
   */
  function setBoxes(next: Placement[]) {
    if (!selected) return;
    planner.setEdits(selected.id, settle(next));
  }

  function movePlacement(index: number, x: number, y: number) {
    if (!selectedPlan) return;
    const boxes = selectedPlan.placements;
    const moved = boxes[index];
    if (!moved) return;
    const foot = { ...moved, x, y };
    // Drop it onto whatever it now sits above, matching the preview shown while dragging.
    const dropped = { ...foot, zCm: restHeight(foot, otherThan(boxes, index)) };
    setBoxes(boxes.map((p, j) => (j === index ? dropped : p)));
  }

  function addBox(skuId: string) {
    if (!selectedPlan) return;
    const spot = firstFreeSpot(
      skuId,
      selectedPlan.placements,
      selectedPlan.gridW,
      selectedPlan.gridD,
      usableHeightCm,
    );
    if (spot) setBoxes([...selectedPlan.placements, spot]);
  }

  async function handleImport(file: File) {
    try {
      planner.replaceAll(parseState(await file.text()));
      setImportError(null);
    } catch {
      setImportError('That file could not be read as a saved plan.');
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>ZWILLING CUBE Planner</h1>
        <div className="topbar__actions">
          <label className="field">
            <span>Optimise for</span>
            <select
              value={objective}
              onChange={(e) => planner.setObjective(e.target.value as Objective)}
            >
              {OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {OBJECTIVE_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => downloadJson({ spaces, objective, edits })}
          >
            Export
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {importError && <p className="banner banner--error">{importError}</p>}

      <div className="layout">
        <aside className="sidebar">
          <h2>Spaces</h2>
          <ul className="space-list">
            {spaces.map((s, i) => {
              const plan = plans[i]!;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`space-list__item${s.id === planner.selectedId ? ' is-active' : ''}`}
                    onClick={() => planner.setSelectedId(s.id)}
                  >
                    <strong>{s.name || 'Untitled space'}</strong>
                    <span className="muted small">
                      {s.widthCm} × {s.depthCm} × {s.heightCm} cm
                    </span>
                    <span className="muted small">
                      {plan.boxCount} boxes · {litres(plan.capacityL)} · {eur(plan.priceEur)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            className="add-space"
            onSubmit={(e) => {
              e.preventDefault();
              planner.addSpace(newName.trim() || `Space ${spaces.length + 1}`);
              setNewName('');
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New space name"
            />
            <button type="submit" className="btn btn--primary">
              Add
            </button>
          </form>
        </aside>

        <main className="content">
          {!selected || !selectedPlan ? (
            <p className="muted">Select a space, or add one to get started.</p>
          ) : (
            <>
              <SpaceEditor
                space={selected}
                onChange={(patch) => planner.updateSpace(selected.id, patch)}
                onRemove={() => planner.removeSpace(selected.id)}
              />

              {selectedPlan.placements.length === 0 ? (
                <p className="banner">
                  Nothing fits here. The smallest CUBE box needs 10.7 × 10.7 cm of floor and
                  7.6 cm of height.
                </p>
              ) : (
                <>
                  <div className="stats">
                    <div>
                      <span className="stats__value">{litres(selectedPlan.capacityL)}</span>
                      <span className="muted small">usable storage</span>
                    </div>
                    <div>
                      <span className="stats__value">{eur(selectedPlan.priceEur)}</span>
                      <span className="muted small">at single prices</span>
                    </div>
                    <div>
                      <span className="stats__value">{selectedPlan.boxCount}</span>
                      <span className="muted small">boxes</span>
                    </div>
                    <div>
                      <span className="stats__value">
                        {selectedPlan.wastedHeightCm.toFixed(1)} cm
                      </span>
                      <span className="muted small">unused headroom</span>
                    </div>
                  </div>

                  <section>
                    <h2>
                      Plan{' '}
                      <span className="muted small">
                        grid {gridSizeCm(selectedPlan.gridW, selectedPlan.gridD)}
                      </span>
                    </h2>

                    <div className="toolbar">
                      <div className="segmented">
                        {VIEWS.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className={`btn btn--small${view === v.id ? ' is-on' : ''}`}
                            onClick={() => setView(v.id)}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                      {isEditing ? (
                        <>
                          <span className="badge">Editing by hand</span>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              planner.clearEdits(selected.id);
                              setPick(null);
                            }}
                          >
                            Reset to auto plan
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => planner.setEdits(selected.id, selectedPlan.placements)}
                        >
                          Edit by hand
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <>
                        <div className="toolbar">
                          <span className="muted small">Add a box</span>
                          {BOXES.map((sku) => {
                            const spot = firstFreeSpot(
                              sku.id,
                              selectedPlan.placements,
                              selectedPlan.gridW,
                              selectedPlan.gridD,
                              usableHeightCm,
                            );
                            return (
                              <button
                                key={sku.id}
                                type="button"
                                className="btn btn--small"
                                disabled={!spot}
                                title={
                                  spot
                                    ? `${sku.heightCm} cm tall — drops in at ${spot.zCm.toFixed(1)} cm`
                                    : 'No room left for this box'
                                }
                                onClick={() => addBox(sku.id)}
                              >
                                + {sku.id}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={() =>
                              setBoxes(
                                fillEmpty(
                                  selectedPlan.placements,
                                  selectedPlan.gridW,
                                  selectedPlan.gridD,
                                  usableHeightCm,
                                ),
                              )
                            }
                          >
                            Fill empty space
                          </button>
                        </div>

                        <div className="toolbar">
                          {picked && pick !== null ? (
                            <>
                              <span className="muted small">
                                Selected {picked.skuId} at column {picked.x + 1}, row{' '}
                                {picked.y + 1}
                                {picked.zCm > 0 ? `, stacked at ${picked.zCm.toFixed(1)} cm` : ''}
                              </span>
                              {swapCandidates(
                                selectedPlan.placements,
                                pick,
                                selectedPlan.gridW,
                                selectedPlan.gridD,
                                usableHeightCm,
                              ).map((c) => (
                                <button
                                  key={`${c.sku.id}-${c.rotated}`}
                                  type="button"
                                  className="btn btn--small"
                                  title={`${c.sku.heightCm} cm tall`}
                                  onClick={() =>
                                    setBoxes(
                                      selectedPlan.placements.map((p, i) =>
                                        i === pick
                                          ? {
                                              skuId: c.sku.id,
                                              x: p.x,
                                              y: p.y,
                                              zCm: p.zCm,
                                              w: c.w,
                                              d: c.d,
                                              rotated: c.rotated,
                                            }
                                          : p,
                                      ),
                                    )
                                  }
                                >
                                  {c.sku.id}
                                  {c.rotated ? ' ⟳' : ''}
                                  <span className="muted"> {c.sku.heightCm}cm</span>
                                </button>
                              ))}
                              <button
                                type="button"
                                className="btn btn--small btn--danger"
                                onClick={() => {
                                  setBoxes(selectedPlan.placements.filter((_, i) => i !== pick));
                                  setPick(null);
                                }}
                              >
                                Remove
                              </button>
                            </>
                          ) : (
                            <span className="muted small">
                              {view === 'front'
                                ? 'Click a box to swap its size or remove it. The front view only shows the front row — use 3D or Top to move boxes.'
                                : 'Drag a box onto another to stack it — it drops onto whatever is below and turns red if it would overhang. Click one to swap its size or remove it.'}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {view === '3d' && (
                      <IsometricView
                        plan={selectedPlan}
                        space={selected}
                        editable={isEditing}
                        selected={pick}
                        onSelect={setPick}
                        onMove={movePlacement}
                      />
                    )}

                    {view === 'front' && (
                      <ElevationView
                        plan={selectedPlan}
                        space={selected}
                        selectable={isEditing}
                        selected={pick}
                        onSelect={setPick}
                      />
                    )}

                    {view === 'layers' && (
                      <TopView
                        placements={selectedPlan.placements}
                        gridW={selectedPlan.gridW}
                        gridD={selectedPlan.gridD}
                        usableHeightCm={usableHeightCm}
                        editable={isEditing}
                        selected={pick}
                        onSelect={setPick}
                        onMove={movePlacement}
                      />
                    )}
                  </section>
                </>
              )}
            </>
          )}

          <section>
            <h2>Shopping list — all spaces</h2>
            <ShoppingList counts={totals} />
          </section>
        </main>
      </div>
    </div>
  );
}
