import { writeFile } from 'node:fs/promises';
import { buildApp } from './app.js';
const app = await buildApp({ checkDatabase: async () => {} });
await writeFile(new URL('../../../packages/shared/openapi.json', import.meta.url), JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
