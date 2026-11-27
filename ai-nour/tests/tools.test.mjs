import test from 'node:test';
import assert from 'node:assert/strict';
import { getToolDeclarations, validateToolCall, executeToolCall } from '../src/tools/registry.js';

test('tool declarations are allowlisted and schema-shaped', () => {
  const tools = getToolDeclarations();
  const names = tools.map((tool) => tool.name).sort();
  for (const required of ['openContact', 'openJourneyChapter', 'openProject', 'openProjectFlow', 'openSection', 'presentProject', 'searchPortfolio', 'getProjectDossier', 'getProjectStep', 'getCurrentView']) {
    assert.ok(names.includes(required), required);
  }
  assert.ok(!names.includes('sendEmail'));
  assert.ok(!names.includes('webResearch'));
  assert.ok(getToolDeclarations({ webResearchEnabled: true }).some((tool) => tool.name === 'webResearch'));
  for (const tool of tools) assert.equal(tool.parameters.type, 'OBJECT');
});

test('valid navigation calls produce actions', () => {
  assert.deepEqual(validateToolCall('openProject', { projectId: 'safiy' }).action, {
    type: 'openProject', projectId: 'safiy', route: '/projects/safiy'
  });
  assert.equal(validateToolCall('openProjectFlow', { projectId: 'acquisition', nodeId: 'demo' }).ok, true);
  assert.equal(validateToolCall('openJourneyChapter', { chapterId: 'education' }).ok, true);
  assert.equal(validateToolCall('openSection', { section: 'brain' }).ok, true);
  assert.equal(validateToolCall('openContact', {}).ok, true);
  const tour = validateToolCall('presentProject', { projectId: 'safiy', includeFlow: true });
  assert.equal(tour.ok, true);
  assert.equal(tour.actions.length, 3);
  assert.equal(tour.actions[0].type, 'presentationStart');
  assert.equal(tour.actions[2].type, 'openProjectFlow');
});

test('unknown tools, projects, sections and nodes are rejected', () => {
  assert.equal(validateToolCall('sendEmail', {}).ok, false);
  assert.equal(validateToolCall('openProject', { projectId: 'admin' }).ok, false);
  assert.equal(validateToolCall('openProject', { projectId: '../../etc/passwd' }).ok, false);
  assert.equal(validateToolCall('openSection', { section: 'secrets' }).ok, false);
  assert.equal(validateToolCall('openProjectFlow', { projectId: 'safiy', nodeId: 'nope' }).ok, false);
  assert.equal(validateToolCall('openJourneyChapter', { chapterId: 'nope' }).ok, false);
});

test('tool execution returns a model-safe response and action', async () => {
  const result = await executeToolCall('openProject', { projectId: 'safiy' });
  assert.equal(result.ok, true);
  assert.equal(result.modelResponse.routes[0], '/projects/safiy');
  assert.equal(result.modelResponse.navigationRequested, true);
  const rejected = await executeToolCall('openProject', { projectId: 'x' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.action, null);
});

test('knowledge tools return verified project and step content', async () => {
  const db = { listKnowledgeOverrides: async () => [] };
  const dossier = await executeToolCall('getProjectDossier', { projectId: 'acquisition' }, { db });
  assert.equal(dossier.ok, true);
  assert.match(dossier.modelResponse.content, /Customer Acquisition/);
  assert.match(dossier.modelResponse.content, /never mergers and acquisitions/i);
  assert.match(dossier.modelResponse.content, /Nour's contribution/i);
  const step = await executeToolCall('getProjectStep', { projectId: 'acquisition', nodeId: 'demo' }, { db });
  assert.equal(step.ok, true);
  assert.match(step.modelResponse.content, /AI-powered demonstrations/);
  const search = await executeToolCall('searchPortfolio', { query: 'Safiy contextual assistant' }, { db });
  assert.equal(search.ok, true);
  assert.ok(search.modelResponse.results.length > 0);
});

test('web research is implemented but disabled unless explicitly enabled', async () => {
  const textProvider = {
    research: async ({ query }) => ({
      text: `Researched: ${query}`,
      sources: [{ title: 'Example', url: 'https://example.invalid' }],
      usage: { prompt: 10, output: 5, total: 15 },
      model: 'mock-text'
    })
  };
  const disabled = await executeToolCall('webResearch', { query: 'current AI news' }, { config: { webResearchEnabled: false }, textProvider });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'WEB_RESEARCH_DISABLED');
  const enabled = await executeToolCall('webResearch', { query: 'current AI news' }, { config: { webResearchEnabled: true }, textProvider });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.modelResponse.researched, true);
  assert.match(enabled.modelResponse.content, /Researched/);
});
