import test from 'node:test';
import assert from 'node:assert/strict';
import { getToolDeclarations, validateToolCall, executeToolCall } from '../src/tools/registry.js';

test('tool declarations are allowlisted and schema-shaped', () => {
  const tools = getToolDeclarations();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['openContact', 'openJourneyChapter', 'openProject', 'openProjectFlow', 'openSection', 'presentProject']);
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
  assert.equal(tour.actions.length, 2);
  assert.equal(tour.actions[1].type, 'openProjectFlow');
});

test('unknown tools, projects, sections and nodes are rejected', () => {
  assert.equal(validateToolCall('sendEmail', {}).ok, false);
  assert.equal(validateToolCall('openProject', { projectId: 'admin' }).ok, false);
  assert.equal(validateToolCall('openProject', { projectId: '../../etc/passwd' }).ok, false);
  assert.equal(validateToolCall('openSection', { section: 'secrets' }).ok, false);
  assert.equal(validateToolCall('openProjectFlow', { projectId: 'safiy', nodeId: 'nope' }).ok, false);
  assert.equal(validateToolCall('openJourneyChapter', { chapterId: 'nope' }).ok, false);
});

test('tool execution returns a model-safe response and action', () => {
  const result = executeToolCall('openProject', { projectId: 'safiy' });
  assert.equal(result.ok, true);
  assert.equal(result.modelResponse.route, '/projects/safiy');
  const rejected = executeToolCall('openProject', { projectId: 'x' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.action, null);
});
