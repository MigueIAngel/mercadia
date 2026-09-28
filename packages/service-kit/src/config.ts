/**
 * Reads `<SERVICE>_<KEY>` first and falls back to `<KEY>`, so several services can run in
 * one process (the demo bundle) with different settings, e.g. ORDERS_DATABASE_URL.
 */
export function serviceEnv(service: string, key: string, fallback?: string): string {
  const prefixed = process.env[`${service.toUpperCase().replace(/-/g, '_')}_${key}`];
  const value = prefixed ?? process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing environment variable ${key} for service ${service}`);
  }
  return value;
}

export function optionalServiceEnv(service: string, key: string): string | undefined {
  return process.env[`${service.toUpperCase().replace(/-/g, '_')}_${key}`] ?? process.env[key];
}

export const isProduction = () => process.env.NODE_ENV === 'production';
