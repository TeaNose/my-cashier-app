/**
 * Converts a string to title case, capitalizing the first letter of each word.
 * Useful for displaying values stored in lowercase (e.g. "soft drinks" -> "Soft Drinks").
 */
export function titleCase(value: string): string {
  if (!value) return value;
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
