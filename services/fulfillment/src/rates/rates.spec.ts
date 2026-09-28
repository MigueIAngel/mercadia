import { quoteParcel, regionOf, zoneFor } from './rates.js';

describe('shipping rates', () => {
  it('maps departments to regions, accents and case aside', () => {
    expect(regionOf('Atlántico')).toBe('caribe');
    expect(regionOf('valle del cauca')).toBe('pacifico');
    expect(regionOf('Amazonas')).toBe('remote');
  });

  it('prices by zone', () => {
    expect(zoneFor({ city: 'Bogotá' }, { city: 'bogota', department: 'Cundinamarca' })).toBe(
      'local',
    );
    expect(zoneFor({ city: 'Medellín' }, { city: 'Bogotá', department: 'Cundinamarca' })).toBe(
      'regional',
    );
    expect(zoneFor({ city: 'Barranquilla' }, { city: 'Cali', department: 'Valle del Cauca' })).toBe(
      'national',
    );
    expect(zoneFor({ city: 'Cali' }, { city: 'Leticia', department: 'Amazonas' })).toBe('remote');
  });

  it('adds weight, and ships free above the threshold except to remote areas', () => {
    expect(quoteParcel('national', 500, 1000)).toMatchObject({ costUsd: 600, etaDays: 4 });
    expect(quoteParcel('national', 3200, 1000).costUsd).toBe(900);
    expect(quoteParcel('regional', 500, 6000).costUsd).toBe(0);
    expect(quoteParcel('remote', 500, 999_999).costUsd).toBe(1000);
  });
});
