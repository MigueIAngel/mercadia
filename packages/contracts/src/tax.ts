/**
 * Colombian IVA by top-level category: 19 % general rate, 5 % for some basic goods,
 * 0 % (exempt) for basic food. Used by catalog (display) and orders (invoicing).
 */
export const IVA_BY_CATEGORY: Record<string, number> = {
  groceries: 0.05,
  default: 0.19,
};

export function ivaRate(categorySlug: string): number {
  return IVA_BY_CATEGORY[categorySlug] ?? IVA_BY_CATEGORY.default;
}
