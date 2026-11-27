import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_VERSION, normalizeConsent, isValidConsent, sessionHasCurrentConsent } from '../src/privacy/consent.js';

test('valid 18+ terms/privacy consent is normalized', () => {
  const consent = normalizeConsent({
    age18: true,
    termsVersion: CONSENT_VERSION,
    privacyVersion: CONSENT_VERSION,
    acceptedAt: 1234
  });
  assert.deepEqual(consent, {
    age18: true,
    termsVersion: CONSENT_VERSION,
    privacyVersion: CONSENT_VERSION,
    acceptedAt: 1234
  });
  assert.equal(isValidConsent(consent), true);
});

test('missing eligibility or stale policy versions are rejected', () => {
  assert.equal(normalizeConsent(null), null);
  assert.equal(normalizeConsent({ termsVersion: CONSENT_VERSION, privacyVersion: CONSENT_VERSION }), null);
  assert.equal(normalizeConsent({ age16: true, termsVersion: CONSENT_VERSION, privacyVersion: CONSENT_VERSION }), null);
  assert.equal(normalizeConsent({ age18: true, termsVersion: 'old', privacyVersion: CONSENT_VERSION }), null);
  assert.equal(normalizeConsent({ age18: true, termsVersion: CONSENT_VERSION, privacyVersion: 'old' }), null);
  assert.equal(isValidConsent({ age18: true, termsVersion: CONSENT_VERSION, privacyVersion: CONSENT_VERSION }), true);
});

test('existing session consent is checked against the current version', () => {
  assert.equal(sessionHasCurrentConsent({ state: { consent: { age16: true, termsVersion: '2026-11-27', privacyVersion: '2026-11-27' } } }), false);
  assert.equal(sessionHasCurrentConsent({ state: { consent: { age18: true, termsVersion: CONSENT_VERSION, privacyVersion: CONSENT_VERSION } } }), true);
});
