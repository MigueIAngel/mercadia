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

export interface CartLine {
  productId: string;
  sku: string;
  title: string;
  image: string | null;
  options: Record<string, string>;
  quantity: number;
  unitPrice: number;
  total: number;
  available: boolean;
  stock: number;
}

export interface CartStore {
  storeId: string;
  storeName: string;
  lines: CartLine[];
  subtotal: number;
  tax: number;
  shipping?: number;
  etaDays?: number;
  carrier?: string;
  total?: number;
}

export interface CartView {
  currency: 'COP' | 'USD';
  stores: CartStore[];
  unavailable: { productId: string; sku: string; reason: string }[];
  subtotal: number;
  tax: number;
  count: number;
  shippingTotal?: number;
  total?: number;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  department: string;
  country: string;
  isDefault: boolean;
}

export interface OrderLineView {
  id: number;
  productId: string;
  sku: string;
  title: string;
  image: string | null;
  options: Record<string, string>;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SellerOrderView {
  id: string;
  storeId: string;
  storeName: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  commission: number;
  refunded: number;
  trackingNumber: string | null;
  lines: OrderLineView[];
}

export interface OrderView {
  id: string;
  number: number;
  status: string;
  currency: 'COP' | 'USD';
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  cancelReason: string | null;
  shippingAddress: Omit<Address, 'id' | 'label' | 'isDefault'>;
  createdAt: string;
  paymentDeadline: string;
  sellerOrders: SellerOrderView[];
  history: {
    id: number;
    status: string;
    note: string | null;
    at: string;
    sellerOrderId: string | null;
  }[];
}

export interface TrackingView {
  trackingNumber: string;
  carrier: string;
  service: string;
  status: string;
  origin: string;
  destinationCity: string;
  estimatedDelivery: string;
  deliveredAt: string | null;
  events: { status: string; location: string; at: string }[];
  sellerOrderId?: string;
}

export interface DisputeView {
  id: string;
  orderId: string;
  sellerOrderId: string;
  reason: string;
  description: string;
  requestedAmount: number;
  maxAmount: number;
  currency: 'COP' | 'USD';
  status: 'open' | 'seller_rejected' | 'escalated' | 'resolved';
  resolution: 'refund' | 'partial_refund' | 'rejected' | null;
  refundAmount: number | null;
  sellerDeadline: string;
  createdAt: string;
  viewerRole?: 'buyer' | 'seller' | 'admin';
  messages?: { id: number; authorRole: string; text: string; at: string }[];
}
