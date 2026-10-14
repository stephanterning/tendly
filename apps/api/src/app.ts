import { registerTaskRoutes } from './tasks/routes.js';
import { registerAccountRoutes } from './accounts/routes.js';
import type { AccountService } from './accounts/service.js';
import type { MailService } from './accounts/mail.js';
import Fastify, { LogController } from 'fastify';
import swagger from '@fastify/swagger';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthSchema, versionSchema } from '@tendly/shared';
import { logRedaction } from './logging.js';

interface AppOptions {
  accounts?: { service: AccountService; mail: MailService };
  checkDatabase: () => Promise<void>;
  closeDatabase?: () => Promise<void>;
  version?: string;
  logLevel?: string;
}
export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logLevel ? { level: options.logLevel, redact: logRedaction } : false, logController: new LogController({ disableRequestLogging: true }) }).withTypeProvider<ZodTypeProvider>();
  if (options.closeDatabase) app.addHook('onClose', options.closeDatabase);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(swagger, {
    openapi: { info: { title: 'Tendly API', version: options.version ?? '0.0.0-dev' } },
    transform: jsonSchemaTransform,
  });
  // Do not log URL query strings: later recovery links carry single-use secrets.
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ method: request.method, route: request.routeOptions.url, statusCode: reply.statusCode }, 'Request completed');
  });
  app.get('/api/v1/health/live', { schema: { operationId: 'getLiveness', response: { 200: healthSchema } } }, async () => ({ status: 'ok' as const }));
  app.get('/api/v1/health/ready', { schema: { operationId: 'getReadiness', response: { 200: healthSchema, 503: healthSchema } } }, async (_request, reply) => {
    try {
      await options.checkDatabase();
      return { status: 'ok' as const };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/v1/version', { schema: { operationId: 'getVersion', response: { 200: versionSchema } } }, async () => ({ name: 'Tendly' as const, version: options.version ?? '0.0.0-dev' }));
  if (options.accounts) {
    await registerAccountRoutes(app, options.accounts.service, options.accounts.mail);
    await registerTaskRoutes(app, options.accounts.service);
  }
  await app.ready();
  return app;
}
