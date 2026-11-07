export function quantile(values: readonly number[], p: number): number;
export function deriveToneCutoffs(
  columns: readonly string[],
  rows: readonly (readonly number[])[],
  plain: number,
  strong: number,
): Record<string, { low: number; lowStrong: number; high: number; highStrong: number }>;
