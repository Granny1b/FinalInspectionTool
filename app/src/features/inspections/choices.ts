/**
 * The choices of a Responsible or category select: the settings' list, in its order. A stored
 * value that is not on the list (removed from it since, or typed before Responsible became a
 * list) is offered too, marked, so it is shown as it is and a save never drops it.
 */

/** "Mekanik (not in the list)" */
export function offListLabel(value: string): string {
  return `${value} (not in the list)`;
}

/** The value to offer besides the list, or null when it is empty or on the list. */
export function offListValue(list: readonly string[], value: string | undefined): string | null {
  return value && !list.includes(value) ? value : null;
}
