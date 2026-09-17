export type ClassValue = string | number | false | null | undefined;

/** Join class names, skipping falsy values */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
