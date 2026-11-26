import { unauthorized } from '../http/errors.js';

const encoder = new TextEncoder();

export function timingSafeEqual(a = '', b = '') {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function ownerTokenFrom(request) {
  const token = request.headers.get('x-owner-token') || '';
  return token.length >= 16 && token.length <= 256 ? token : null;
}

export async function requireOwnerHash(request) {
  const token = ownerTokenFrom(request);
  if (!token) throw unauthorized('A valid owner token is required');
  return sha256Hex(token);
}

export function requirePrototypeKey(request, config) {
  const supplied = request.headers.get('x-prototype-key') || '';
  if (!timingSafeEqual(supplied, config.prototypeAccessKey)) {
    throw unauthorized('A valid prototype access key is required');
  }
}

export function requireAdmin(request, config) {
  if (!config.adminEnabled) throw unauthorized('Admin API is disabled');
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(token, config.adminToken)) {
    throw unauthorized('Admin authentication required');
  }
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
