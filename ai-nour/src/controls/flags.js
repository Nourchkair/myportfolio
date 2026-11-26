import { badRequest, unavailable } from '../http/errors.js';

export const DEFAULT_PERSONA = "You are AI Nour, a concise, warm, commercially minded representation of Nour Chkair. Speak in the first person about yourself and in the third person about Nour. Be accurate, grounded, and never invent experience or projects. Keep spoken answers to one or two sentences and text answers focused. Respond in the visitor's language.";

const BOOLEAN_FLAGS = [
  'assistant_enabled',
  'text_enabled',
  'live_enabled',
  'prototype_enabled',
  'google_writes_enabled'
];

const DEFAULTS = {
  assistant_enabled: true,
  text_enabled: true,
  live_enabled: true,
  prototype_enabled: true,
  google_writes_enabled: false
};

export function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export async function readFlags(db) {
  const raw = await db.getControls();
  const flags = {};
  for (const key of BOOLEAN_FLAGS) flags[key] = parseBool(raw[key], DEFAULTS[key]);
  flags.persona = raw.persona_instruction || DEFAULT_PERSONA;
  return flags;
}

export async function requireAssistant(db) {
  const flags = await readFlags(db);
  if (!flags.assistant_enabled || !flags.prototype_enabled) {
    throw unavailable('The AI Nour prototype is currently disabled');
  }
  return flags;
}

export async function requireText(db) {
  const flags = await requireAssistant(db);
  if (!flags.text_enabled) throw unavailable('Text conversations are currently disabled');
  return flags;
}

export async function requireLive(db) {
  const flags = await requireAssistant(db);
  if (!flags.live_enabled) throw unavailable('Live voice conversations are currently disabled');
  return flags;
}

export async function setBooleanFlag(db, key, value, now) {
  if (!BOOLEAN_FLAGS.includes(key)) throw badRequest(`Unknown feature flag: ${key}`);
  if (typeof value !== 'boolean') throw badRequest('Feature flag value must be boolean');
  await db.setControl(key, String(value), now);
}

export async function setPersona(db, persona, now) {
  if (typeof persona !== 'string' || persona.trim().length < 40 || persona.length > 4000) {
    throw badRequest('Persona instruction must be between 40 and 4000 characters');
  }
  await db.setControl('persona_instruction', persona.trim(), now);
}

export { BOOLEAN_FLAGS };
