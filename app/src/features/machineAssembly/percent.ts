/** "42%": how much is signed. */
export function percentText(signed: number, steps: number): string {
  return `${steps === 0 ? 0 : Math.floor((signed / steps) * 100)}%`;
}
