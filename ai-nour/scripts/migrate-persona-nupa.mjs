import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PERSONA, NUPA_IDENTITY_PARAGRAPH } from '../src/controls/flags.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const envFile = process.argv.find((arg) => arg.startsWith('--env='))?.slice(6) || '.dev.vars.production';
const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) || process.env.PRODUCTION_API_URL || 'https://api.nourchkair.com';

function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

export function migratePersona(persona) {
  let next = String(persona || '').trimEnd();
  if (!next) return DEFAULT_PERSONA;
  const legacyIdentity = /^You are AI Nour[\s\S]*?\n\n/;
  if (legacyIdentity.test(next)) next = next.replace(legacyIdentity, `${NUPA_IDENTITY_PARAGRAPH}\n\n`);
  else if (!/^You are Nupa\b/m.test(next)) next = `${NUPA_IDENTITY_PARAGRAPH}\n\n${next}`;
  next = next
    .replace(/AI representation built from Nour's public work/gi, "independent AI portfolio assistant who knows Nour's public work")
    .replace(/AI representative of Nour Chkair/gi, 'independent AI portfolio assistant operated by Nour Chkair')
    .replace(/AI representation of Nour Chkair/gi, 'independent AI portfolio assistant operated by Nour Chkair')
    .replace(/AI representation/gi, 'AI portfolio assistant')
    .replace(/Keep clear AI identity disclosure/gi, 'Keep clear Nupa identity disclosure')
    .replace(/\bAI Nour\b/g, 'Nupa')
    .replace(/not a digital version, twin, replica or AI portfolio assistant of him/gi, 'not a digital version, twin, replica or AI representation of him');
  if (!/Nour's Unique Portfolio Assistant/i.test(next)) next = `${NUPA_IDENTITY_PARAGRAPH}\n\n${next}`;
  if (!/Your personality is your own/i.test(next)) {
    next = next.replace(/^CHARACTER\r?\n/m, (match) => `${match}Your personality is your own; you are not imitating Nour and you do not claim his private beliefs. `);
  }
  return next.trim();
}

if (args.has('--self-test')) {
  const sample = `You are AI Nour, a distinct AI representative of Nour Chkair. You know Nour's public work deeply, but you are not Nour.\n\nCHARACTER\nCustom retained text.\n\nKeep clear AI identity disclosure.`;
  const migrated = migratePersona(sample);
  console.log(JSON.stringify({ ok: migrated.includes('You are Nupa') && migrated.includes('Your personality is your own') && migrated.includes('Custom retained text.') && !/AI Nour|AI representative/.test(migrated), migrated }, null, 2));
} else {
  const env = readEnv(envFile);
  const response = await fetch(base + '/api/admin/persona', { headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` } });
  const body = await response.json();
  if (!response.ok || !body.persona) throw new Error(`Persona read failed: HTTP ${response.status}`);
  const migrated = migratePersona(body.persona);
  const changed = migrated !== body.persona;
  console.log(JSON.stringify({
    base,
    status: response.status,
    apply,
    changed,
    beforeLength: body.persona.length,
    afterLength: migrated.length,
    beforeStart: body.persona.slice(0, 220),
    afterStart: migrated.slice(0, 240),
    hasLegacyName: /AI Nour/.test(body.persona),
    hasLegacyRepresentation: /AI representative|AI representation|digital twin|digital version|replica/i.test(body.persona),
    afterHasLegacyName: /AI Nour/.test(migrated),
    afterHasLegacyRepresentation: /AI representative|AI representation of Nour|digital twin|digital version of Nour|replica of Nour/i.test(migrated)
  }, null, 2));
  if (apply && changed) {
    const patch = await fetch(base + '/api/admin/persona', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ persona: migrated })
    });
    const result = await patch.json();
    if (!patch.ok) throw new Error(`Persona update failed: HTTP ${patch.status} ${result?.error?.message || ''}`);
    console.log(JSON.stringify({ applied: true, status: patch.status, length: result.persona?.length || null }, null, 2));
  }
}
