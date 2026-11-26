export class IntegrationError extends Error {
  constructor(code, message, { status = 502, details = null } = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
