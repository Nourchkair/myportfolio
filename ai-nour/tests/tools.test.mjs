import test from 'node:test';
import assert from 'node:assert/strict';
import { getToolDeclarations, validateToolCall, executeToolCall } from '../src/tools/registry.js';

test('tool declarations are allowlisted and schema-shaped', () => {
  const tools = getToolDeclarations();
  const names = tools.map((tool) => tool.name).sort();
  for (const required of ['openContact', 'openJourneyChapter', 'openProject', 'openProjectFlow', 'openSection', 'presentProject', 'searchPortfolio', 'getProjectDossier', 'getProjectStep', 'getCurrentView', 'getVisibleElements', 'getElementDetails', 'highlightElement', 'spotlightElement', 'hoverElement', 'expandElement', 'collapseElement', 'pointToElement', 'traceConnection', 'traceWorkflow', 'navigateToElement', 'scrollToElement', 'zoomToElement', 'resetZoom', 'compareElements', 'clearVisualEffects']) {
    assert.ok(names.includes(required), required);
  }
  assert.ok(!names.includes('sendEmail'));
  assert.ok(!names.includes('webResearch'));
  for (const tool of tools) assert.equal(tool.parameters.type, 'OBJECT');
});

test('valid navigation calls produce actions', () => {
  assert.deepEqual(validateToolCall('openProject', { projectId: 'safiy' }).action, {
    type: 'openProject', projectId: 'safiy', route: '/projects/safiy', waitForTarget: 'project:safiy'
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

test('presentation targets and visual actions are validated', () => {
  const highlight = validateToolCall('highlightElement', {
    targetIds: ['flow-node:acquisition:demo', 'project-overview:acquisition:what'],
    style: 'emphasis',
    sequence: true,
    stepMs: 900
  });
  assert.equal(highlight.ok, true);
  assert.equal(highlight.action.type, 'highlightElement');
  assert.deepEqual(highlight.action.targetIds, ['flow-node:acquisition:demo', 'project-overview:acquisition:what']);
  assert.equal(highlight.action.style, 'emphasis');
  assert.equal(highlight.action.sequence, true);
  assert.equal(highlight.action.stepMs, 900);

  assert.equal(validateToolCall('highlightElement', { targetId: 'body > script' }).ok, false);
  assert.equal(validateToolCall('highlightElement', { targetId: 'flow-node:acquisition:invented' }).ok, false);
  assert.equal(validateToolCall('highlightElement', { targetId: 'project-card:acquisition:tag:sales-strategy' }).ok, true);
  assert.equal(validateToolCall('highlightElement', { targetId: 'project-text:acquisition:what:an-ai-assisted-customer-acquisition-system-abc123' }).ok, true);
  assert.equal(validateToolCall('highlightElement', { targetId: 'project-card:acquisition:tag:0' }).ok, false);
  assert.equal(validateToolCall('spotlightElement', { targetId: 'project-card:acquisition' }).ok, true);
  assert.equal(validateToolCall('hoverElement', { targetId: 'journey-tab:education' }).ok, true);
  assert.equal(validateToolCall('expandElement', { targetId: 'flow-node:acquisition:demo' }).ok, true);
  assert.equal(validateToolCall('compareElements', { targetIds: ['project:acquisition'] }).ok, false);
  assert.equal(validateToolCall('compareElements', { targetIds: ['project:acquisition', 'project:safiy'] }).ok, true);
  assert.equal(validateToolCall('traceConnection', { projectId: 'acquisition', from: 'demo', to: 'outreach' }).ok, true);
  assert.equal(validateToolCall('traceConnection', { projectId: 'acquisition', from: 'demo', to: 'nope' }).ok, false);
  assert.equal(validateToolCall('traceWorkflow', { projectId: 'acquisition', mode: 'branch' }).ok, true);
  assert.equal(validateToolCall('traceWorkflow', { projectId: 'acquisition', nodeIds: ['nope'] }).ok, false);
  assert.equal(validateToolCall('zoomToElement', { targetId: 'flow-node:acquisition:demo', scale: 1.5 }).ok, true);
  assert.equal(validateToolCall('resetZoom', {}).ok, true);
  assert.equal(validateToolCall('clearVisualEffects', {}).ok, true);
  const navigate = validateToolCall('navigateToElement', { targetId: 'flow-node:acquisition:demo' });
  assert.equal(navigate.ok, true);
  assert.equal(navigate.actions[0].type, 'openProjectFlow');
  assert.equal(navigate.actions[1].type, 'scrollToElement');
});

test('visible element tools use only the registered portfolio targets', async () => {
  const portfolioContext = {
    section: 'projects',
    targets: [
      { id: 'project:acquisition', kind: 'project', label: 'Customer Acquisition', description: 'Revenue project', actions: ['highlight', 'point'], relationships: [], knowledgeRef: 'project:acquisition', visible: true },
      { id: 'flow-node:acquisition:demo', kind: 'flow-node', label: 'AI-powered demonstrations', description: 'Personalized demos', actions: ['highlight', 'trace'], relationships: [], knowledgeRef: 'project:acquisition:flow:demo', visible: false }
    ]
  };
  const visible = await executeToolCall('getVisibleElements', {}, { portfolioContext });
  assert.equal(visible.ok, true);
  assert.match(visible.modelResponse.content, /project:acquisition/);
  assert.doesNotMatch(visible.modelResponse.content, /flow-node:acquisition:demo/);
  const details = await executeToolCall('getElementDetails', { targetId: 'project:acquisition' }, { portfolioContext });
  assert.equal(details.ok, true);
  assert.match(details.modelResponse.content, /Customer Acquisition/);
  const unknown = await executeToolCall('getElementDetails', { targetId: 'project:invented' }, { portfolioContext });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_TARGET');
});

test('presentation steps carry render readiness and progress metadata', () => {
  const start = validateToolCall('presentProject', { projectId: 'acquisition', includeFlow: true, startNodeId: 'demo' });
  assert.equal(start.ok, true);
  assert.equal(start.actions[0].stepIndex, 5);
  assert.equal(start.actions[0].totalSteps, 9);
  assert.equal(start.actions[1].waitForTarget, 'project:acquisition');
  assert.equal(start.actions[2].waitForTarget, 'flow-node:acquisition:demo');
  const step = validateToolCall('presentProjectStep', { projectId: 'acquisition', nodeId: 'outreach' });
  assert.equal(step.ok, true);
  assert.equal(step.actions[0].stepIndex, 6);
  assert.equal(step.actions[0].totalSteps, 9);
  assert.equal(step.actions[1].waitForTarget, 'flow-node:acquisition:outreach');
});
