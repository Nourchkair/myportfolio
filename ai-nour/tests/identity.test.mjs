import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PERSONA, NUPA_IDENTITY_PARAGRAPH } from '../src/controls/flags.js';
import { buildSystemPrompt } from '../src/sessions/manager.js';
import { createMockTextProvider } from '../src/providers/text/mock.js';

const provider = createMockTextProvider();
const ask = (text) => provider.generate({ contents: [{ role: 'user', parts: [{ text }] }] });

test('default persona identifies Nupa as an independent assistant, not Nour', () => {
  assert.match(DEFAULT_PERSONA, /^You are Nupa, Nour's Unique Portfolio Assistant/);
  assert.match(DEFAULT_PERSONA, /independent AI-powered portfolio guide operated by Nour Chkair/);
  assert.match(DEFAULT_PERSONA, /not Nour Chkair/);
  assert.match(DEFAULT_PERSONA, /never impersonate him/);
  assert.match(DEFAULT_PERSONA, /Speak about Nour in the third person/);
  assert.doesNotMatch(DEFAULT_PERSONA, /AI Nour|AI representative|AI representation of Nour|digital twin|digital version of Nour/);
  assert.equal(NUPA_IDENTITY_PARAGRAPH, DEFAULT_PERSONA.split('\n\n')[0]);
});

test('system prompt restates the independent identity in English and French, text and voice', () => {
  for (const mode of ['text', 'live']) {
    for (const locale of ['en', 'fr']) {
      const prompt = buildSystemPrompt({ persona: DEFAULT_PERSONA, locale, mode });
      assert.match(prompt, /Your name is Nupa, Nour's Unique Portfolio Assistant/);
      assert.match(prompt, /You are not Nour/);
      assert.match(prompt, /never impersonate him/);
      assert.match(prompt, /Speak about Nour in the third person/);
      assert.match(prompt, /never claim that your opinions are Nour's documented beliefs/);
      assert.match(prompt, /Nupa cannot bind Nour to agreements/);
      assert.match(prompt, /If asked who you are, whether you are Nour, what NUPA means/);
    }
  }
});

test('Nupa answers identity questions directly in English', async () => {
  const who = await ask('Who are you?');
  assert.match(who.text, /Nupa/);
  assert.match(who.text, /not Nour/);

  const nour = await ask('Are you Nour?');
  assert.match(nour.text, /^No, I'm Nupa\./);
  assert.match(nour.text, /I'm not him/);

  const acronym = await ask('What does Nupa mean?');
  assert.match(acronym.text, /Nour's Unique Portfolio Assistant/);
  assert.match(acronym.text, /interactive, personal and enjoyable/);

  const opinions = await ask('Do your opinions represent Nour?');
  assert.match(opinions.text, /^No\./);
  assert.match(opinions.text, /are my own/);
  assert.match(opinions.text, /aren't Nour's documented beliefs/);

  const authority = await ask("Can you make decisions on Nour's behalf?");
  assert.match(authority.text, /^No\./);
  assert.match(authority.text, /can't bind Nour/);
  assert.match(authority.text, /professional commitments on his behalf/);
});

test('Nupa answers identity questions directly in French', async () => {
  const who = await ask('Qui es-tu ?');
  assert.match(who.text, /Nupa/);
  assert.match(who.text, /je ne suis pas Nour/);

  const nour = await ask('Es-tu Nour ?');
  assert.match(nour.text, /^Non, je suis Nupa\./);
  assert.match(nour.text, /je ne suis pas lui/);

  const acronym = await ask('Que signifie Nupa ?');
  assert.match(acronym.text, /Nour’s Unique Portfolio Assistant/);
  assert.match(acronym.text, /interactive, personnelle et agréable/);

  const opinions = await ask('Tes opinions représentent-elles Nour ?');
  assert.match(opinions.text, /^Non\./);
  assert.match(opinions.text, /m’appartiennent/);
  assert.match(opinions.text, /ne représentent pas les convictions documentées de Nour/);

  const authority = await ask('Peux-tu prendre des décisions au nom de Nour ?');
  assert.match(authority.text, /^Non\./);
  assert.match(authority.text, /ne peux pas engager Nour/);
  assert.match(authority.text, /engagements professionnels pour lui/);
});

test('a portfolio guide request starts a presentation in English and French', async () => {
  for (const text of ['Guide me through the portfolio.', 'Guide-moi dans le portfolio.']) {
    const result = await ask(text);
    assert.equal(result.toolCalls[0]?.name, 'presentProject');
    assert.equal(result.toolCalls[0]?.args?.projectId, 'acquisition');
    assert.equal(result.toolCalls[0]?.args?.includeFlow, true);
  }
});
