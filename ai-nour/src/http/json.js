import { AppError } from './errors.js';

export const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...headers
    }
  });
}

export async function readJson(request, maxBytes = 16_384) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new AppError(413, 'BODY_TOO_LARGE', 'Request body too large');
  const text = await request.text();
  if (text.length > maxBytes) throw new AppError(413, 'BODY_TOO_LARGE', 'Request body too large');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Invalid JSON body');
  }
}

export function requestId() {
  return crypto.randomUUID();
}

export function clientKey(request) {
  const ip = request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'local';
  return ip;
}
