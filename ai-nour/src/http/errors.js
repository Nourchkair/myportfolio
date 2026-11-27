export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, code = 'BAD_REQUEST', details) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Not allowed') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

export function tooMany(message = 'Rate limit exceeded') {
  return new AppError(429, 'RATE_LIMITED', message);
}

export function conflict(message = 'Conflict') {
  return new AppError(409, 'CONFLICT', message);
}

export function unavailable(message = 'Service unavailable') {
  return new AppError(503, 'UNAVAILABLE', message);
}

export function paymentRequired(message = 'Budget cap exceeded') {
  return new AppError(402, 'BUDGET_EXCEEDED', message);
}

export function budgetExhausted({ scope = 'daily', resetsAt = null, message = 'The voice allowance has been used' } = {}) {
  const code = scope === 'cumulative' ? 'CUMULATIVE_BUDGET_EXHAUSTED' : 'DAILY_BUDGET_EXHAUSTED';
  return new AppError(402, code, message, resetsAt ? { scope, resetsAt } : { scope });
}

export function liveSessionLimit(message = 'The daily voice session limit has been reached', resetsAt = null) {
  return new AppError(429, 'LIVE_SESSION_LIMIT', message, resetsAt ? { resetsAt } : undefined);
}

export function internal(message = 'Internal error') {
  return new AppError(500, 'INTERNAL', message);
}
