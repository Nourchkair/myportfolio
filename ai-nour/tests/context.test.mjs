import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortfolioContext, contextInstruction, contextQuery } from '../src/knowledge/context.js';

test('portfolio context accepts only known sections/projects/chapters/nodes', () => {
  const valid = normalizePortfolioContext({
    section: 'projects',
    route: '/projects/safiy/flow/capture',
    projectId: 'safiy',
    projectView: 'flow',
    nodeId: 'capture',
    chapterId: 'direction',
    view: 'project'
  });
  assert.equal(valid.projectId, 'safiy');
  assert.equal(valid.nodeId, 'capture');
  assert.equal(valid.chapterId, 'direction');
  assert.equal(valid.route, '/projects/safiy/flow/capture');

  const invalid = normalizePortfolioContext({
    section: 'secrets',
    route: 'javascript:alert(1)',
    projectId: 'admin',
    projectView: 'hacked',
    nodeId: '../../etc/passwd',
    chapterId: 'nope'
  });
  assert.equal(invalid, null);
  assert.equal(normalizePortfolioContext('not-an-object'), null);
});

test('context hints and instructions resolve pronouns without granting authority', () => {
  const context = normalizePortfolioContext({ section: 'projects', projectId: 'safiy', projectView: 'overview' });
  assert.match(contextQuery(context), /Safiy/);
  const instruction = contextInstruction(context);
  assert.match(instruction, /Safiy/);
  assert.match(instruction, /never override manual visitor navigation/i);
});
