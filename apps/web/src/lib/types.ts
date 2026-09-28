import type { Currency, Role } from '@mercadia/contracts';

export type Localized = { en: string; es: string };

export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  category: string;
  image: string | null;
  price: number;
  compareAt: number | null;
  currency: Currency;
  rating: { avg: number; count: number };
  store: { id: string; name: string; slug: string };
  inStock: boolean;
}

export interface Variant {
  sku: string;
  options: Record<string, string>;
  stock: number;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  subcategory?: string;
  tags: string[];
  images: string[];
  options: { name: string; values: string[] }[];
  variants: Variant[];
  specs: {
    weightGrams?: number;
    dimensionsCm?: { width: number; height: number; depth: number };
    warranty?: string;
    shipping?: string;
    returnPolicy?: string;
  };
  taxRate: number;
  salesCount: number;
  store: ProductSummary['store'] & { city?: string; logoUrl?: string | null; accentColor?: string };
}

export interface Category {
  slug: string;
  name: Localized;
  icon: string;
  count: number;
  subcategories: { slug: string; name: Localized; count: number }[];
}

export interface SearchResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pages: number;
  currency: Currency;
  facets: {
    brands: { name: string; count: number }[];
    categories: { slug: string; count: number }[];
    price: { min: number; max: number } | null;
  };
}

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  city: string;
  logoUrl: string | null;
  accentColor: string;
  ownerName?: string;
  createdAt?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  currency: Currency;
  roles: Role[];
  totpEnabled: boolean;
  store: { id: string; slug: string; name: string } | null;
}

export interface HomeData {
  currency: Currency;
  categories: Category[];
  bestSellers: ProductSummary[];
  deals: ProductSummary[];
  newArrivals: ProductSummary[];
  topRated: ProductSummary[];
  stores: StoreSummary[];
}
