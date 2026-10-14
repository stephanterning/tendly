import { expect, it } from 'vitest';
import { decryptSecret, digest, encryptSecret, randomToken } from './crypto.js';
it('keeps settings confidential and authenticates ciphertext and key', () => {
  const key = 'ab'.repeat(32);
  const encrypted = encryptSecret('smtp-password', key);
  expect(encrypted).not.toContain('smtp-password');
  expect(decryptSecret(encrypted, key)).toBe('smtp-password');
  expect(() => decryptSecret(encrypted, 'cd'.repeat(32))).toThrow();
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  const token = randomToken();
  expect(digest(token)).not.toContain(token);
});
