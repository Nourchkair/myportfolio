import { getEntities } from './retrieval.js';

const entities = getEntities();
const projectById = new Map(entities.projects.map((project) => [project.id, project]));
const chapterById = new Map(entities.chapters.map((chapter) => [chapter.id, chapter]));
const sections = new Set(['home', 'me', 'brain', 'journey', 'projects', 'contact', 'reading']);
const TARGET_ACTIONS = new Set(['navigate', 'scroll', 'highlight', 'spotlight', 'hover', 'expand', 'collapse', 'point', 'trace', 'zoom', 'compare']);
const TARGET_ID = /^(?:(?:journey|contact|about)|(?:(?:section|main-card|project-card|project|project-hero|project-overview|project-contribution|project-text|project-tag|flow|flow-node|flow-link|journey-chapter|journey-tab|journey-text|journey-chip|control):[a-zA-Z0-9_:>.-]+))$/;

function text(value, max = 160) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeTarget(input) {
  if (!input || typeof input !== 'object') return null;
  const id = text(input.id, 140);
  if (!id || !TARGET_ID.test(id)) return null;
  const actions = Array.isArray(input.actions)
    ? [...new Set(input.actions.filter((action) => typeof action === 'string' && TARGET_ACTIONS.has(action)))].slice(0, 10)
    : [];
  const relationships = Array.isArray(input.relationships)
    ? input.relationships.filter((item) => typeof item === 'string').map((item) => text(item, 100)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id,
    kind: text(input.kind, 40),
    label: text(input.label, 100),
    description: text(input.description, 220),
    actions,
    relationships,
    knowledgeRef: text(input.knowledgeRef, 140) || null,
    visible: input.visible === true
  };
}

export function normalizePortfolioContext(input) {
  if (!input || typeof input !== 'object') return null;
  const section = sections.has(input.section) ? input.section : null;
  const project = projectById.get(input.projectId) || null;
  const chapter = chapterById.get(input.chapterId) || null;
  const nodeId = project && typeof input.nodeId === 'string' && project.flowNodes.includes(input.nodeId) ? input.nodeId : null;
  const route = text(input.route, 120);
  const presentationProject = projectById.get(input.presentation?.projectId) || null;
  const presentationNodeId = presentationProject && typeof input.presentation?.nodeId === 'string' && presentationProject.flowNodes.includes(input.presentation.nodeId)
    ? input.presentation.nodeId
    : null;
  if (!section && !project && !chapter) return null;
  const targets = Array.isArray(input.targets)
    ? input.targets.map(normalizeTarget).filter(Boolean).slice(0, 80)
    : [];
  return {
    section,
    route: route.startsWith('/') ? route : null,
    projectId: project?.id || null,
    projectTitle: project?.title || null,
    projectName: project?.project || null,
    projectCategory: project?.category || null,
    projectView: ['overview', 'flow'].includes(input.projectView) ? input.projectView : null,
    chapterId: chapter?.id || null,
    chapterTitle: chapter?.title || null,
    chapterLabel: chapter?.label || null,
    nodeId,
    view: text(input.view, 40) || null,
    navigationSource: input.navigationSource === 'assistant' ? 'assistant' : 'visitor',
    targets,
    presentation: input.presentation && typeof input.presentation === 'object'
      ? {
          active: input.presentation.active === true,
          projectId: presentationProject?.id || null,
          nodeId: presentationNodeId,
          paused: input.presentation.paused === true
        }
      : null
  };
}

export function contextQuery(context) {
  if (!context) return '';
  return [
    context.projectTitle,
    context.projectName,
    context.projectCategory,
    context.chapterTitle,
    context.chapterLabel,
    context.section,
    context.nodeId,
    context.view
  ].filter(Boolean).join(' ');
}

export function contextInstruction(context) {
  if (!context) return '';
  const parts = [];
  if (context.section) parts.push(`section: ${context.section}`);
  if (context.projectTitle) parts.push(`project: ${context.projectTitle} (${context.projectId})`);
  if (context.projectCategory) parts.push(`project category: ${context.projectCategory}`);
  if (context.projectView) parts.push(`project view: ${context.projectView}`);
  if (context.nodeId) parts.push(`flow node: ${context.nodeId}`);
  if (context.chapterTitle) parts.push(`journey chapter: ${context.chapterTitle} (${context.chapterId})`);
  if (context.route) parts.push(`route: ${context.route}`);
  if (context.navigationSource) parts.push(`last navigation: ${context.navigationSource}`);
  if (context.presentation?.active) parts.push(`active presentation: ${context.presentation.projectId || 'unknown'}${context.presentation.nodeId ? ` at ${context.presentation.nodeId}` : ''}${context.presentation.paused ? ' (paused)' : ''}`);
  if (context.targets?.length) parts.push(`visible presentation targets: ${context.targets.filter((target) => target.visible).slice(0, 24).map((target) => target.id).join(', ') || 'none'}`);
  return `The visitor is currently viewing the portfolio with ${parts.join('; ')}. Resolve pronouns and "this/that" against this view. Never override manual visitor navigation or assume they want to leave the current view. Use only the listed presentation target IDs for visual actions.`;
}
