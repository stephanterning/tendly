import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

describe('operational boundary', () => {
  it('separates process liveness from database readiness without leaking errors', async () => {
    const app = await buildApp({ checkDatabase: async () => { throw new Error('postgres://private:secret@db'); } });
    try {
      expect((await app.inject('/api/v1/health/live')).statusCode).toBe(200);
      const response = await app.inject('/api/v1/health/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
      expect((await app.inject('/api/v1/tasks')).statusCode).toBe(404);
    } finally { await app.close(); }
  });
  it('documents the same healthy response the server emits', async () => {
    let databaseClosed = false;
    const app = await buildApp({ checkDatabase: async () => {}, closeDatabase: async () => { databaseClosed = true; } });
    try {
      expect((await app.inject('/api/v1/health/ready')).json()).toEqual({ status: 'ok' });
      expect(app.swagger().paths).toHaveProperty('/api/v1/health/ready');
    } finally { await app.close(); }
    expect(databaseClosed).toBe(true);
  });
  it('rejects insecure production origins and keeps configuration secrets out of errors', () => {
    expect(readConfig({ APP_ENCRYPTION_KEY: '0'.repeat(64), DATABASE_URL: 'postgres://user:secret@localhost/db', PUBLIC_ORIGIN: 'https://example.com:443/' }).PUBLIC_ORIGIN).toBe('https://example.com');
    expect(() => readConfig({ APP_ENCRYPTION_KEY: '0'.repeat(64), NODE_ENV: 'production', DATABASE_URL: 'postgres://user:secret@localhost/db', PUBLIC_ORIGIN: 'http://localhost' })).toThrow('HTTPS');
    expect(() => readConfig({ APP_ENCRYPTION_KEY: '0'.repeat(64), DATABASE_URL: 'secret', PUBLIC_ORIGIN: 'https://example.com/path' })).toThrow('Invalid configuration: DATABASE_URL, PUBLIC_ORIGIN');
  });
});
