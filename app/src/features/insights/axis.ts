/** Whole, round steps for a count axis: 1, 2, 5, 10, 20, 50, … */
function* steps(): Generator<number> {
  for (let magnitude = 1; ; magnitude *= 10) {
    yield magnitude;
    yield 2 * magnitude;
    yield 5 * magnitude;
  }
}

/** The highest value sits at most this high up the axis, so its point or column and the label
 * on it clear the top gridline. */
const HEADROOM = 1.15;

/**
 * The ticks of a count axis from 0: three to five whole, round steps, the top one above the
 * highest value with room to spare. Left to itself, Recharts fits the axis to the data, and the
 * highest month then sits on the chart's top edge.
 */
export function countTicks(max: number): number[] {
  const top = Math.max(0, max) * HEADROOM;
  let step = 1;
  for (step of steps()) if (Math.ceil(top / step) <= 5) break;
  const count = Math.max(3, Math.ceil(top / step));
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}
