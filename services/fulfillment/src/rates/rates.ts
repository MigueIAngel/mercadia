/** Colombian natural regions, used to price shipping between departments. */
const REGIONS: Record<string, string[]> = {
  andina: [
    'bogota',
    'bogota d.c.',
    'cundinamarca',
    'boyaca',
    'santander',
    'norte de santander',
    'antioquia',
    'caldas',
    'risaralda',
    'quindio',
    'tolima',
    'huila',
  ],
  caribe: ['atlantico', 'bolivar', 'magdalena', 'cesar', 'la guajira', 'cordoba', 'sucre'],
  pacifico: ['valle del cauca', 'valle', 'cauca', 'narino', 'choco'],
  remote: [
    'meta',
    'casanare',
    'arauca',
    'vichada',
    'amazonas',
    'caqueta',
    'guainia',
    'guaviare',
    'putumayo',
    'vaupes',
    'san andres',
    'san andres y providencia',
  ],
};

/** Where the demo stores ship from (other stores default to Bogotá). */
export const CITY_DEPARTMENT: Record<string, string> = {
  bogota: 'bogota',
  medellin: 'antioquia',
  cali: 'valle del cauca',
  barranquilla: 'atlantico',
  bucaramanga: 'santander',
  cartagena: 'bolivar',
  pereira: 'risaralda',
  'santa marta': 'magdalena',
};

export const normalise = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function regionOf(department: string) {
  const d = normalise(department);
  return Object.entries(REGIONS).find(([, list]) => list.includes(d))?.[0] ?? 'remote';
}

export type Zone = 'local' | 'regional' | 'national' | 'remote';

export function zoneFor(
  origin: { city: string },
  destination: { city: string; department: string },
): Zone {
  if (normalise(origin.city) === normalise(destination.city)) return 'local';
  const destinationRegion = regionOf(destination.department);
  if (destinationRegion === 'remote') return 'remote';
  const originDepartment = CITY_DEPARTMENT[normalise(origin.city)] ?? 'bogota';
  return regionOf(originDepartment) === destinationRegion ? 'regional' : 'national';
}

const BASE_USD: Record<Zone, number> = { local: 250, regional: 400, national: 600, remote: 1000 };
const ETA_DAYS: Record<Zone, number> = { local: 1, regional: 2, national: 4, remote: 7 };
/** Orders of at least $60 (≈ COP 240k) from one store ship free, except to remote areas. */
export const FREE_SHIPPING_FROM_USD = 6000;

/** USD cents, tax included; +$1 per kg above the first. */
export function quoteParcel(zone: Zone, weightGrams: number, subtotalUsd: number) {
  const extraKg = Math.max(0, Math.ceil(weightGrams / 1000) - 1);
  const free = subtotalUsd >= FREE_SHIPPING_FROM_USD && zone !== 'remote';
  return {
    zone,
    costUsd: free ? 0 : BASE_USD[zone] + extraKg * 100,
    etaDays: ETA_DAYS[zone],
    carrier: 'Mercadia Envíos',
  };
}
