export class AccountError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) { super(code); }
}
