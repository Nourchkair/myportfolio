import { getChunkById, getChunksByIds, getEntities, search } from './retrieval.js';
import { contextQuery, contextInstruction } from './context.js';

const entities = getEntities();
const projectById = new Map(entities.projects.map((project) => [project.id, project]));
const chapterById = new Map(entities.chapters.map((chapter) => [chapter.id, chapter]));

const PROFILE_IDS = [
  'profile:intro',
  'profile:positioning',
  'profile:think',
  'profile:work',
  'profile:direction',
  'journey:tagline'
];

const PROJECT_FOUNDATION_IDS = entities.projects.flatMap((project) => ([
  `${project.id}:identity`,
  `${project.id}:what`,
  `${project.id}:contribution`,
  `${project.id}:flow:intro`
]));

const JOURNEY_FOUNDATION_IDS = entities.chapters.map((chapter) => `journey:${chapter.id}`);

const RELATED_JOURNEY = {
  acquisition: ['journey:sales', 'journey:commercial', 'journey:technology'],
  h2ops: ['journey:technology', 'journey:commercial'],
  communications: ['journey:technology', 'journey:sales'],
  knowledge: ['journey:technology', 'journey:education'],
  safiy: ['journey:technology', 'journey:direction']
};

export const FACT_GUARDRAILS = [
  'Customer Acquisition is H2Ops\'s customer/sales acquisition project. It is never mergers and acquisitions (M&A).',
  'Statements about Nour\'s contribution describe Nour\'s individual work. Statements about what a system can do describe the broader product/team capability.'
].join(' ');

export function normalizeOverrides(items = []) {
  return (items || [])
    .filter((item) => item && item.status === 'published' && item.text)
    .map((item) => ({
      id: item.chunk_id,
      type: 'override',
      title: item.title || 'Published knowledge override',
      text: item.text,
      route: null,
      tags: (() => { try { return JSON.parse(item.tags_json || '[]'); } catch { return []; } })(),
      keywords: []
    }));
}

function mergeOverrides(chunks, overrides) {
  const map = new Map(chunks.filter(Boolean).map((chunk) => [chunk.id, chunk]));
  for (const override of overrides) map.set(override.id, override);
  return [...map.values()];
}

function formatChunk(chunk) {
  return `[${chunk.id}] ${chunk.title}\n${chunk.text}\nRoute: ${chunk.route || 'n/a'}`;
}

function render(chunks, maxChars = 14000) {
  const lines = [];
  let used = 0;
  for (const chunk of chunks) {
    const block = formatChunk(chunk);
    if (used + block.length > maxChars) break;
    lines.push(block);
    used += block.length;
  }
  return lines.join('\n\n');
}

export function foundationContext({ overrides = [], maxChars = 14000 } = {}) {
  const ids = [
    ...PROFILE_IDS,
    ...PROJECT_FOUNDATION_IDS,
    ...JOURNEY_FOUNDATION_IDS,
    'site:contact'
  ];
  const chunks = mergeOverrides(getChunksByIds(ids), overrides);
  return {
    text: `VERIFIED PORTFOLIO FACTS AND GUARDRAILS:\n${FACT_GUARDRAILS}\n\n${render(chunks, maxChars)}`,
    chunks
  };
}

export function projectDossier(projectId, { overrides = [] } = {}) {
  const project = projectById.get(projectId);
  if (!project) return null;
  const ids = [
    `${projectId}:identity`,
    `${projectId}:what`,
    `${projectId}:challenges`,
    `${projectId}:value`,
    `${projectId}:contribution`,
    `${projectId}:flow:intro`,
    ...project.flowNodes.map((nodeId) => `${projectId}:flow:${nodeId}`),
    ...(RELATED_JOURNEY[projectId] || [])
  ];
  const chunks = mergeOverrides(getChunksByIds(ids), overrides);
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const flow = project.flowNodes.map((nodeId) => {
    const chunk = chunkById.get(`${projectId}:flow:${nodeId}`);
    return {
      id: nodeId,
      title: chunk?.title || nodeId,
      explanation: chunk?.text || '',
      route: `/projects/${projectId}/flow/${nodeId}`
    };
  });
  return {
    id: project.id,
    title: project.title,
    project: project.project,
    category: project.category || null,
    route: project.route,
    what: chunkById.get(`${projectId}:what`)?.text || '',
    challenges: chunkById.get(`${projectId}:challenges`)?.text || '',
    value: chunkById.get(`${projectId}:value`)?.text || '',
    contribution: chunkById.get(`${projectId}:contribution`)?.text || '',
    flowIntro: chunkById.get(`${projectId}:flow:intro`)?.text || '',
    flow,
    relatedJourney: (RELATED_JOURNEY[projectId] || []).map((id) => chunkById.get(id)).filter(Boolean),
    chunks
  };
}

export function dossierText(dossier) {
  if (!dossier) return '';
  const lines = [
    `GUARDRAILS: ${FACT_GUARDRAILS}`,
    `PROJECT: ${dossier.title} (${dossier.id}), ${dossier.project}${dossier.category ? ` — ${dossier.category}` : ''}`,
    `What it is: ${dossier.what}`,
    `Challenges: ${dossier.challenges}`,
    `Value: ${dossier.value}`,
    `Nour's contribution: ${dossier.contribution}`,
    `Process overview: ${dossier.flowIntro}`,
    'Process steps:',
    ...dossier.flow.map((step) => `- ${step.id}: ${step.title} — ${step.explanation}`),
    dossier.relatedJourney.length ? `Related journey:\n${dossier.relatedJourney.map(formatChunk).join('\n\n')}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

export function flowStep(projectId, nodeId, { overrides = [] } = {}) {
  const project = projectById.get(projectId);
  if (!project) return null;
  const index = project.flowNodes.indexOf(nodeId);
  if (index < 0) return null;
  const ids = [
    `${projectId}:flow:intro`,
    `${projectId}:flow:${nodeId}`,
    ...(project.flowNodes[index - 1] ? [`${projectId}:flow:${project.flowNodes[index - 1]}`] : []),
    ...(project.flowNodes[index + 1] ? [`${projectId}:flow:${project.flowNodes[index + 1]}`] : [])
  ];
  const chunks = mergeOverrides(getChunksByIds(ids), overrides);
  const current = chunks.find((chunk) => chunk.id === `${projectId}:flow:${nodeId}`) || null;
  return {
    projectId,
    projectTitle: project.title,
    nodeId,
    index: index + 1,
    total: project.flowNodes.length,
    title: current?.title || nodeId,
    explanation: current?.text || '',
    previous: project.flowNodes[index - 1] || null,
    next: project.flowNodes[index + 1] || null,
    route: `/projects/${projectId}/flow/${nodeId}`,
    chunks
  };
}

export function journeyChapter(chapterId, { overrides = [] } = {}) {
  const chapter = chapterById.get(chapterId);
  if (!chapter) return null;
  const searchText = `${chapter.title} ${chapter.label}`;
  const results = search(searchText, { limit: 12, types: ['journey'], extraChunks: overrides });
  const chunks = mergeOverrides([
    getChunkById(`journey:${chapterId}`),
    ...results.map((result) => getChunkById(result.id))
  ], overrides);
  return {
    id: chapter.id,
    title: chapter.title,
    label: chapter.label,
    route: chapter.route,
    chunks,
    text: render(chunks, 7000)
  };
}

export function currentView(context, { overrides = [] } = {}) {
  if (!context) return { text: '', chunks: [] };
  const chunks = [];
  const parts = [contextInstruction(context)];
  if (context.projectId) {
    const dossier = projectDossier(context.projectId, { overrides });
    if (dossier) {
      parts.push(dossierText(dossier));
      chunks.push(...dossier.chunks);
      if (context.nodeId) {
        const step = flowStep(context.projectId, context.nodeId, { overrides });
        if (step) {
          parts.push(`CURRENT PROJECT STEP: ${step.title}\n${step.explanation}\nPosition ${step.index}/${step.total}; previous: ${step.previous || 'none'}; next: ${step.next || 'none'}.`);
          chunks.push(...step.chunks);
        }
      }
    }
  } else if (context.chapterId) {
    const chapter = journeyChapter(context.chapterId, { overrides });
    if (chapter) {
      parts.push(chapter.text);
      chunks.push(...chapter.chunks);
    }
  } else {
    const query = contextQuery(context) || context.section || 'Nour Chkair portfolio';
    const results = search(query, { limit: 6, extraChunks: overrides });
    parts.push(render(results, 6000));
    chunks.push(...results);
  }
  return { text: parts.filter(Boolean).join('\n\n'), chunks };
}

export function searchPortfolio(query, { overrides = [], limit = 6 } = {}) {
  const results = search(String(query || ''), { limit, extraChunks: overrides });
  const chunks = results;
  return {
    query,
    results,
    chunks,
    text: render(chunks, 7000)
  };
}

export function buildGroundingContext({ query = '', portfolioContext = null, overrides = [], mode = 'text' } = {}) {
  const foundation = foundationContext({ overrides, maxChars: mode === 'live' ? 14000 : 10000 });
  const view = currentView(portfolioContext, { overrides });
  const searchResults = searchPortfolio([query, contextQuery(portfolioContext)].filter(Boolean).join(' '), { overrides, limit: mode === 'live' ? 6 : 5 });
  const seen = new Set();
  const chunks = [];
  for (const chunk of [...foundation.chunks, ...view.chunks, ...searchResults.chunks]) {
    if (!chunk || seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    chunks.push(chunk);
  }
  return {
    text: [
      foundation.text,
      view.text ? `CURRENT VIEW CONTEXT:\n${view.text}` : '',
      searchResults.text ? `QUERY-SPECIFIC VERIFIED CONTEXT:\n${searchResults.text}` : ''
    ].filter(Boolean).join('\n\n').slice(0, mode === 'live' ? 20000 : 14000),
    chunks,
    searchResults: searchResults.results,
    foundation
  };
}

export function getProjectIds() {
  return entities.projects.map((project) => project.id);
}

export function getChapterIds() {
  return entities.chapters.map((chapter) => chapter.id);
}

export function getProjectFlowNodes(projectId) {
  return projectById.get(projectId)?.flowNodes || [];
}
