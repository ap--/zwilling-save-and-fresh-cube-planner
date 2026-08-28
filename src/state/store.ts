import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Objective, Placement, Space } from '../domain/types';

const STORAGE_KEY = 'zwilling-cube-planner/v1';

export interface PlannerState {
  spaces: Space[];
  objective: Objective;
  /** Hand-placed boxes, keyed by space id. Absent means "use the solver's plan". */
  edits: Record<string, Placement[]>;
}

const DEFAULT_STATE: PlannerState = { spaces: [], objective: 'volume', edits: {} };

function isSpace(value: unknown): value is Space {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    (s.kind === 'drawer' || s.kind === 'shelf') &&
    typeof s.widthCm === 'number' &&
    typeof s.depthCm === 'number' &&
    typeof s.heightCm === 'number' &&
    typeof s.marginCm === 'number'
  );
}

function isPlacement(value: unknown): value is Placement {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.skuId === 'string' &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.zCm === 'number' &&
    typeof p.w === 'number' &&
    typeof p.d === 'number'
  );
}

/** Parses untrusted JSON (localStorage or an imported file) into planner state. */
export function parseState(text: string): PlannerState {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null) throw new Error('Not a planner file.');
  const raw = data as Record<string, unknown>;
  const spaces = Array.isArray(raw.spaces) ? raw.spaces.filter(isSpace) : [];
  const objective =
    raw.objective === 'price' || raw.objective === 'count' || raw.objective === 'volume'
      ? raw.objective
      : 'volume';

  // Edits saved before boxes could stack freely are dropped rather than migrated.
  const edits: Record<string, Placement[]> = {};
  const knownIds = new Set(spaces.map((s) => s.id));
  if (typeof raw.edits === 'object' && raw.edits !== null) {
    for (const [id, boxes] of Object.entries(raw.edits as Record<string, unknown>)) {
      if (knownIds.has(id) && Array.isArray(boxes) && boxes.every(isPlacement)) {
        edits[id] = boxes;
      }
    }
  }
  return { spaces, objective, edits };
}

function load(): PlannerState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? parseState(text) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export function newSpace(name: string): Space {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'drawer',
    widthCm: 60,
    depthCm: 45,
    heightCm: 20,
    marginCm: 0,
  };
}

export function usePlanner() {
  const [state, setState] = useState<PlannerState>(load);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or blocked — the app still works for this session
    }
  }, [state]);

  const addSpace = useCallback((name: string) => {
    const space = newSpace(name);
    setState((s) => ({ ...s, spaces: [...s.spaces, space] }));
    setSelectedId(space.id);
    return space;
  }, []);

  const updateSpace = useCallback((id: string, patch: Partial<Space>) => {
    setState((s) => {
      // Hand-placed boxes are tied to the old grid, so resizing invalidates them.
      const resized =
        patch.widthCm !== undefined ||
        patch.depthCm !== undefined ||
        patch.heightCm !== undefined ||
        patch.marginCm !== undefined;
      const edits = { ...s.edits };
      if (resized) delete edits[id];
      return {
        ...s,
        edits,
        spaces: s.spaces.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
      };
    });
  }, []);

  const removeSpace = useCallback((id: string) => {
    setState((s) => {
      const edits = { ...s.edits };
      delete edits[id];
      return { ...s, edits, spaces: s.spaces.filter((sp) => sp.id !== id) };
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const setEdits = useCallback((id: string, placements: Placement[]) => {
    setState((s) => ({ ...s, edits: { ...s.edits, [id]: placements } }));
  }, []);

  const clearEdits = useCallback((id: string) => {
    setState((s) => {
      const edits = { ...s.edits };
      delete edits[id];
      return { ...s, edits };
    });
  }, []);

  const setObjective = useCallback((objective: Objective) => {
    setState((s) => ({ ...s, objective }));
  }, []);

  const replaceAll = useCallback((next: PlannerState) => {
    setState(next);
    setSelectedId(next.spaces[0]?.id ?? null);
  }, []);

  const selected = useMemo(
    () => state.spaces.find((s) => s.id === selectedId) ?? null,
    [state.spaces, selectedId],
  );

  return {
    ...state,
    selected,
    selectedId,
    setSelectedId,
    addSpace,
    updateSpace,
    removeSpace,
    setEdits,
    clearEdits,
    setObjective,
    replaceAll,
  };
}

export function downloadJson(state: PlannerState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cube-plan.json';
  a.click();
  URL.revokeObjectURL(url);
}
