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

/** Months between two labelled ticks: every month, every other, quarters, halves, years, … */
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60, 120];

/**
 * The months that get a label on a month axis `width` px wide, so that "2026-10" labels never
 * touch: every month when there is room, otherwise every 2nd, 3rd, 6th or 12th month, always on
 * the same months of the year (quarters start in January, April, July and October), so the
 * labels are evenly spaced and mean the same from one chart to the next. Left to itself, Recharts
 * drops the labels that would collide, which leaves uneven gaps.
 */
export function monthTicks(months: readonly string[], width: number, labelWidth = 56): string[] {
  if (months.length === 0) return [];
  // Each month has width / count px of the axis; a label needs labelWidth, so this many months.
  const perLabel = (labelWidth * months.length) / Math.max(1, width);
  const step = MONTH_STEPS.find((candidate) => candidate >= perLabel) ?? MONTH_STEPS.at(-1)!;
  if (step === 1) return [...months];
  const ticks = months.filter((month) => monthIndex(month) % step === 0);
  // A stretch too short to hold one of those months still names where it starts.
  return ticks.length > 0 ? ticks : [months[0]!];
}

/** Months since year 0: every January is a multiple of 12, so the steps follow the calendar. */
const monthIndex = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
