/**
 * useGridClock — subscribe a component to the rolling grid C(t) (DESIGN.md §10).
 *
 * Returns the current grid and tick, and re-renders when the tick rolls over.
 * Wall-clock time is read here (the one place it's allowed — the engine itself
 * stays pure and clock-free). Polls each second and only updates state when the
 * tick actually changes, so renders happen once per period, not per second.
 */

import { useEffect, useState } from "react";
import type { Grid } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { DEFAULT_PARAMS, gridAtTick, tickForTime } from "../engine/clock.js";

export interface GridClock {
  readonly grid: Grid;
  readonly tick: number;
  /** Fraction [0,1) of the way through the current period — for a countdown. */
  readonly progress: number;
}

export function useGridClock(seed: string, params: GridParams = DEFAULT_PARAMS): GridClock {
  const compute = (): GridClock => {
    const now = Date.now();
    const tick = tickForTime(now, params);
    const periodMs = params.periodSeconds * 1000;
    const progress = (now % periodMs) / periodMs;
    return { grid: gridAtTick(seed, tick, params), tick, progress };
  };

  const [clock, setClock] = useState<GridClock>(compute);

  useEffect(() => {
    const id = setInterval(() => {
      setClock((prev) => {
        const next = compute();
        // Re-render every tick for the countdown; keep the SAME grid object when
        // the tick hasn't rolled, so GridView doesn't redraw needlessly.
        if (next.tick === prev.tick) return { ...prev, progress: next.progress };
        return next;
      });
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, params.periodSeconds, params.rows, params.cols, params.emptyDensity]);

  return clock;
}
