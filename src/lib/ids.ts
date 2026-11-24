/** ID helpers — server-only (uses node:crypto). */
import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function shortId(len = 10): string {
  return randomUUID().replace(/-/g, '').slice(0, len);
}
