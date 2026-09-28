export interface SellerProduct {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  currency: 'COP' | 'USD';
  status: 'draft' | 'active' | 'archived' | 'blocked';
  totalStock: number;
  salesCount: number;
  lowStock: boolean;
  store: { slug: string };
}
