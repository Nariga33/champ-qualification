import { CATEGORY_META_BY_OP, type Operation } from "./types";

const map = new Map<string, string>();
for (const op of Object.keys(CATEGORY_META_BY_OP) as Operation[]) {
  for (const c of CATEGORY_META_BY_OP[op]) map.set(c.key, c.label);
}
export function labelForCategory(key: string): string {
  return map.get(key) ?? key;
}
export const ALL_CATEGORY_KEYS: string[] = Array.from(map.keys());