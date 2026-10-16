export interface FragmentGrid { cols: number; rows: number }

/** Columns × rows for cutting a picture into `count` pieces, close to a 3:2 photo. */
export function fragmentGrid(count: number): FragmentGrid {
  const cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count * 1.5))));
  return { cols, rows: Math.ceil(count / cols) };
}

/** CSS background-position that shows piece `i` when the image is sized to cols×rows of the box. */
export function fragmentPosition(i: number, { cols, rows }: FragmentGrid): string {
  const pct = (v: number, n: number) => (n > 1 ? +((v / (n - 1)) * 100).toFixed(3) : 0);
  return `${pct(i % cols, cols)}% ${pct(Math.floor(i / cols), rows)}%`;
}
