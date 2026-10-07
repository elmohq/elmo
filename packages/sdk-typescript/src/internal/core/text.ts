export function toText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : String(value);
}
