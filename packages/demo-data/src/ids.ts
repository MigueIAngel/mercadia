import { createHash } from 'node:crypto';

/**
 * Name-based UUID (RFC 4122 v5, SHA-1). The same demo entity gets the same id in every
 * service, so seeds never need to call each other.
 */
export function demoId(kind: string, key: string | number): string {
  const hash = createHash('sha1').update(`mercadia:${kind}:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
