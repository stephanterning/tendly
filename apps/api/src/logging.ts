export const logRedaction = {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'password', 'token', 'DATABASE_URL'],
  censor: '[REDACTED]',
};
