export const CONSENT_VERSION = '2026-11-27-v1.4';

function timestamp(value, fallback) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, fallback) : fallback;
}

export function normalizeConsent(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  if (input.age18 !== true) return null;
  if (input.termsVersion !== CONSENT_VERSION || input.privacyVersion !== CONSENT_VERSION) return null;
  return {
    age18: true,
    termsVersion: CONSENT_VERSION,
    privacyVersion: CONSENT_VERSION,
    acceptedAt: timestamp(input.acceptedAt, now)
  };
}

export function isValidConsent(input, now = Date.now()) {
  return Boolean(normalizeConsent(input, now));
}

export function sessionHasCurrentConsent(session) {
  return Boolean(normalizeConsent(session?.state?.consent));
}
