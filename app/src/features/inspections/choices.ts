/**
 * The choices of a Responsible or category select: the settings' list, in its order. A stored
 * value that is not on the list (removed from it since, or typed before Responsible became a
 * list) is offered too, marked, so it is shown as it is and a save never drops it. It stays on
 * offer while the page is open, so a slip of the keyboard can be undone.
 */

/** "Mekanik (not in the list)" */
export function offListLabel(value: string): string {
  return `${value} (not in the list)`;
}

/**
 * The values to offer besides the list: the current one and the one stored when the page opened,
 * each once, unless empty or on the list.
 */
export function offListValues(
  list: readonly string[],
  values: readonly (string | undefined)[],
): string[] {
  const found: string[] = [];
  for (const value of values) {
    if (value && !list.includes(value) && !found.includes(value)) found.push(value);
  }
  return found;
}
