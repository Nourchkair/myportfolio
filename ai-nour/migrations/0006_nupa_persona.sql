-- Nupa identity update: clear only the untouched legacy seed persona.
-- Custom administrator edits are preserved. When the value is empty,
-- controls/flags.js falls back to the current DEFAULT_PERSONA (Nupa).
-- The richer identity migration for existing custom overrides is
-- ai-nour/scripts/migrate-persona-nupa.mjs.

UPDATE controls
SET value = '',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE key = 'persona_instruction'
  AND value = 'You are AI Nour, a concise, warm, commercially minded representation of Nour Chkair. Speak in the first person about yourself and in the third person about Nour. Be accurate, grounded, and never invent experience or projects. Keep spoken answers to one or two sentences and text answers focused. Respond in the visitor''s language.';
