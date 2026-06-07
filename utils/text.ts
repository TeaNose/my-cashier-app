/**
 * Converts a string to all uppercase for display.
 * Safe for null/empty values. Names, SKUs and categories are stored uppercase,
 * but applying this at display sites also normalizes any legacy mixed-case data.
 */
export function upperCase(value: string | null | undefined): string {
  if (!value) return value ?? '';
  return value.toUpperCase();
}
