/**
 * Returns the UTC timestamp three calendar months before `now`, formatted as
 * 'YYYY-MM-DD HH:MM:SS' to match how SQLite stores `created_at` (UTC, no
 * timezone suffix). The string format allows direct lexicographic comparison
 * against stored timestamps.
 */
export function threeMonthsAgoUtc(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
