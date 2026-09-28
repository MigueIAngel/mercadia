import { demoId } from './ids.js';

/** Password for every demo account (shown on the login page). */
export const DEMO_PASSWORD = 'Mercadia2026!';

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  roles: ('buyer' | 'seller' | 'admin')[];
  locale: 'es' | 'en';
}

export interface DemoStore {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  city: string;
  description: { en: string; es: string };
  /** DummyJSON categories this store sells. */
  sources: string[];
  accent: string;
}

const user = (
  key: string,
  name: string,
  roles: DemoUser['roles'],
  locale: 'es' | 'en' = 'es',
): DemoUser => ({
  id: demoId('user', key),
  email: `${key}@mercadia.dev`,
  name,
  roles,
  locale,
});

export const ADMIN = user('admin', 'Admin Mercadia', ['buyer', 'admin']);
export const BUYERS = [
  user('laura', 'Laura Gómez', ['buyer']),
  user('andres', 'Andrés Pérez', ['buyer']),
  user('sofia', 'Sofía Martínez', ['buyer'], 'en'),
];

const store = (
  slug: string,
  name: string,
  owner: string,
  city: string,
  sources: string[],
  accent: string,
  en: string,
  es: string,
) => ({
  store: {
    id: demoId('store', slug),
    ownerId: demoId('user', owner),
    slug,
    name,
    city,
    sources,
    accent,
    description: { en, es },
  } satisfies DemoStore,
  owner: user(owner, ownerName[owner], ['buyer', 'seller']),
});

const ownerName: Record<string, string> = {
  camilo: 'Camilo Restrepo',
  valentina: 'Valentina Ríos',
  mariana: 'Mariana Ospina',
  daniel: 'Daniel Herrera',
  julian: 'Julián Castro',
  isabela: 'Isabela Vargas',
  rosa: 'Rosa Montoya',
  santiago: 'Santiago Mejía',
};

const DEFINITIONS = [
  store(
    'tecnonova',
    'TecnoNova',
    'camilo',
    'Bogotá',
    ['smartphones', 'laptops', 'tablets', 'mobile-accessories'],
    '#6366f1',
    'Phones, laptops and the accessories that go with them.',
    'Celulares, portátiles y todos sus accesorios.',
  ),
  store(
    'casa-viva',
    'Casa Viva',
    'valentina',
    'Medellín',
    ['furniture', 'home-decoration', 'kitchen-accessories'],
    '#f97316',
    'Furniture, decor and kitchenware for every room.',
    'Muebles, decoración y cocina para cada rincón de tu casa.',
  ),
  store(
    'belleza-pura',
    'Belleza Pura',
    'mariana',
    'Cali',
    ['beauty', 'skin-care', 'fragrances'],
    '#ec4899',
    'Makeup, skin care and fragrances from brands you trust.',
    'Maquillaje, cuidado de la piel y perfumes de marcas reconocidas.',
  ),
  store(
    'urbano-moda',
    'Urbano Moda',
    'daniel',
    'Barranquilla',
    ['mens-shirts', 'tops', 'womens-dresses', 'womens-bags'],
    '#14b8a6',
    'Everyday clothing and bags with a Caribbean touch.',
    'Ropa y bolsos para el día a día con toque caribeño.',
  ),
  store(
    'paso-firme',
    'Paso Firme',
    'julian',
    'Bucaramanga',
    ['mens-shoes', 'womens-shoes'],
    '#a16207',
    'Shoes made to walk: sneakers, boots and heels.',
    'Calzado para caminar: tenis, botas y tacones.',
  ),
  store(
    'tiempo-y-estilo',
    'Tiempo & Estilo',
    'isabela',
    'Cartagena',
    ['mens-watches', 'womens-watches', 'womens-jewellery', 'sunglasses'],
    '#eab308',
    'Watches, jewellery and sunglasses.',
    'Relojes, joyería y gafas de sol.',
  ),
  store(
    'mercado-fresco',
    'Mercado Fresco',
    'rosa',
    'Bogotá',
    ['groceries'],
    '#22c55e',
    'Fresh groceries delivered to your door.',
    'Mercado fresco directo a tu puerta.',
  ),
  store(
    'deporte-total',
    'Deporte Total',
    'santiago',
    'Pereira',
    ['sports-accessories', 'motorcycle', 'vehicle'],
    '#ef4444',
    'Sports gear, motorcycles and vehicles.',
    'Artículos deportivos, motos y vehículos.',
  ),
];

export const STORES: DemoStore[] = DEFINITIONS.map((d) => d.store);
export const SELLERS: DemoUser[] = DEFINITIONS.map((d) => d.owner);
export const USERS: DemoUser[] = [ADMIN, ...BUYERS, ...SELLERS];

export function storeForSource(source: string): DemoStore {
  const found = STORES.find((s) => s.sources.includes(source));
  if (!found) throw new Error(`No store sells ${source}`);
  return found;
}
