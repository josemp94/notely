import { generateKeyBetween } from "fractional-indexing";

/** Rank fraccional para ordenar hermanos sin renumerar. */
export function rankBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** Rank para añadir al final de una lista de ranks ya ordenada. */
export function rankAtEnd(lastRank: string | null): string {
  return generateKeyBetween(lastRank, null);
}
