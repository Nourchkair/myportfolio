import { getEntities } from './retrieval.js';

const entities = getEntities();
const projectById = new Map(entities.projects.map((project) => [project.id, project]));
const chapterById = new Map(entities.chapters.map((chapter) => [chapter.id, chapter]));
const sections = new Set(['home', 'me', 'brain', 'journey', 'projects', 'contact', 'reading']);

function text(value, max = 160) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
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
  return `The visitor is currently viewing the portfolio with ${parts.join('; ')}. Resolve pronouns and "this/that" against this view. Never override manual visitor navigation or assume they want to leave the current view.`;
}
