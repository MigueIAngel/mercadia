export interface DemoCategory {
  slug: string;
  name: { en: string; es: string };
  icon: string;
  /** DummyJSON categories grouped under this one. */
  sources: string[];
}

export const CATEGORIES: DemoCategory[] = [
  {
    slug: 'electronics',
    name: { en: 'Electronics', es: 'Tecnología' },
    icon: 'smartphone',
    sources: ['smartphones', 'laptops', 'tablets', 'mobile-accessories'],
  },
  {
    slug: 'home',
    name: { en: 'Home & Kitchen', es: 'Hogar y cocina' },
    icon: 'sofa',
    sources: ['furniture', 'home-decoration', 'kitchen-accessories'],
  },
  {
    slug: 'beauty',
    name: { en: 'Beauty', es: 'Belleza' },
    icon: 'sparkles',
    sources: ['beauty', 'skin-care', 'fragrances'],
  },
  {
    slug: 'fashion',
    name: { en: 'Fashion', es: 'Moda' },
    icon: 'shirt',
    sources: ['mens-shirts', 'tops', 'womens-dresses', 'mens-shoes', 'womens-shoes', 'womens-bags'],
  },
  {
    slug: 'accessories',
    name: { en: 'Watches & Jewellery', es: 'Relojes y joyería' },
    icon: 'watch',
    sources: ['mens-watches', 'womens-watches', 'womens-jewellery', 'sunglasses'],
  },
  {
    slug: 'groceries',
    name: { en: 'Groceries', es: 'Mercado' },
    icon: 'shopping-basket',
    sources: ['groceries'],
  },
  {
    slug: 'sports',
    name: { en: 'Sports', es: 'Deportes' },
    icon: 'dumbbell',
    sources: ['sports-accessories'],
  },
  {
    slug: 'motor',
    name: { en: 'Motor', es: 'Motor' },
    icon: 'bike',
    sources: ['motorcycle', 'vehicle'],
  },
];

export const SUBCATEGORY_NAMES: Record<string, { en: string; es: string }> = {
  smartphones: { en: 'Smartphones', es: 'Celulares' },
  laptops: { en: 'Laptops', es: 'Portátiles' },
  tablets: { en: 'Tablets', es: 'Tabletas' },
  'mobile-accessories': { en: 'Mobile accessories', es: 'Accesorios para celular' },
  furniture: { en: 'Furniture', es: 'Muebles' },
  'home-decoration': { en: 'Home decor', es: 'Decoración' },
  'kitchen-accessories': { en: 'Kitchen', es: 'Cocina' },
  beauty: { en: 'Makeup', es: 'Maquillaje' },
  'skin-care': { en: 'Skin care', es: 'Cuidado de la piel' },
  fragrances: { en: 'Fragrances', es: 'Perfumes' },
  'mens-shirts': { en: "Men's shirts", es: 'Camisas de hombre' },
  tops: { en: 'Tops', es: 'Blusas y tops' },
  'womens-dresses': { en: 'Dresses', es: 'Vestidos' },
  'mens-shoes': { en: "Men's shoes", es: 'Zapatos de hombre' },
  'womens-shoes': { en: "Women's shoes", es: 'Zapatos de mujer' },
  'womens-bags': { en: 'Bags', es: 'Bolsos' },
  'mens-watches': { en: "Men's watches", es: 'Relojes de hombre' },
  'womens-watches': { en: "Women's watches", es: 'Relojes de mujer' },
  'womens-jewellery': { en: 'Jewellery', es: 'Joyería' },
  sunglasses: { en: 'Sunglasses', es: 'Gafas de sol' },
  groceries: { en: 'Groceries', es: 'Mercado' },
  'sports-accessories': { en: 'Sports gear', es: 'Artículos deportivos' },
  motorcycle: { en: 'Motorcycles', es: 'Motos' },
  vehicle: { en: 'Vehicles', es: 'Vehículos' },
};

export function parentCategory(source: string): DemoCategory {
  const found = CATEGORIES.find((c) => c.sources.includes(source));
  if (!found) throw new Error(`Unknown category ${source}`);
  return found;
}
