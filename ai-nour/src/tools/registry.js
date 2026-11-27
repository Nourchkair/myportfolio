import { getEntities } from '../knowledge/retrieval.js';
import {
  currentView,
  dossierText,
  flowStep,
  journeyChapter,
  normalizeOverrides,
  projectDossier,
  searchPortfolio
} from '../knowledge/grounding.js';

const entities = getEntities();
const projectById = new Map(entities.projects.map((project) => [project.id, project]));
const chapterById = new Map(entities.chapters.map((chapter) => [chapter.id, chapter]));

export const SECTION_ROUTES = {
  home: '/',
  me: '/me',
  brain: '/me/brain',
  journey: '/journey',
  projects: '/projects',
  contact: '/contact',
  reading: '/read'
};

const KNOWLEDGE_TOOLS = new Set([
  'searchPortfolio',
  'getProjectDossier',
  'getProjectStep',
  'getJourneyChapter',
  'getCurrentView',
  'webResearch'
]);

const definitions = [
  {
    name: 'openSection',
    description: 'Open a top-level portfolio section. Use when the visitor asks to see the home page, about page, journey, projects, or contact page.',
    parameters: {
      type: 'OBJECT',
      properties: {
        section: { type: 'STRING', enum: Object.keys(SECTION_ROUTES), description: 'Portfolio section to open.' }
      },
      required: ['section']
    }
  },
  {
    name: 'openProject',
    description: 'Open a public portfolio project case study by id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id), description: 'Public project id.' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'openProjectFlow',
    description: 'Open a project process flow, optionally selecting one step.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        nodeId: { type: 'STRING', description: 'Optional flow node id for that project.' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'openJourneyChapter',
    description: 'Open a chapter of Nour’s career journey.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chapterId: { type: 'STRING', enum: entities.chapters.map((chapter) => chapter.id) }
      },
      required: ['chapterId']
    }
  },
  {
    name: 'openContact',
    description: 'Open the portfolio contact panel. Use only when the visitor wants contact information or is ready to discuss next steps.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'presentProject',
    description: 'Start an interruptible guided presentation: opens a project, returns its verified dossier, and optionally opens its process flow. Use when the visitor asks for a tour, a presentation, or asks you to choose a project. Do not tell the visitor how to use the menu instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        includeFlow: { type: 'BOOLEAN', description: 'Continue into the project process flow after opening the case study.' },
        startNodeId: { type: 'STRING', description: 'Optional flow node to open first.' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'presentProjectStep',
    description: 'Move to a specific project process step during an active presentation and return its verified content. Use after explaining the previous step or when the visitor asks to skip or go deeper.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        nodeId: { type: 'STRING', description: 'Flow node id to present.' }
      },
      required: ['projectId', 'nodeId']
    }
  },
  {
    name: 'pausePresentation',
    description: 'Pause the active guided presentation without changing the current page.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'resumePresentation',
    description: 'Resume the active guided presentation from the current page.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'endPresentation',
    description: 'End the active guided presentation without changing the current page.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'searchPortfolio',
    description: 'Search verified public portfolio knowledge. Use for factual checks about Nour, projects, career, education, skills and claims, and before making detailed project claims. Do not use it for general world knowledge.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search query.' },
        limit: { type: 'INTEGER', description: 'Maximum results, 1-8.' }
      },
      required: ['query']
    }
  },
  {
    name: 'getProjectDossier',
    description: 'Return the complete verified dossier for one project: problem, system, Nour’s contribution, scope, process flow and related journey. Use before presenting or answering detailed project questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) }
      },
      required: ['projectId']
    }
  },
  {
    name: 'getProjectStep',
    description: 'Return verified detail for one project process step, its neighbours and its place in the flow. Use when explaining a step or after navigation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        nodeId: { type: 'STRING', description: 'Flow node id.' }
      },
      required: ['projectId', 'nodeId']
    }
  },
  {
    name: 'getJourneyChapter',
    description: 'Return verified career journey details for one chapter, including roles and milestones.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chapterId: { type: 'STRING', enum: entities.chapters.map((chapter) => chapter.id) }
      },
      required: ['chapterId']
    }
  },
  {
    name: 'getCurrentView',
    description: 'Return the visitor’s current section, project, flow step or journey chapter and the verified content for that view. Use for "what is this?", "explain this step" and "how does this work?"',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'webResearch',
    description: 'Research current or external information with Google Search. Use only when the visitor asks about current events, external facts, companies, markets or ideas that are not covered by the portfolio. Identify the answer as researched and cite sources.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Research question.' }
      },
      required: ['query']
    }
  }
];

export function getToolDeclarations({ webResearchEnabled = false } = {}) {
  return definitions
    .filter((definition) => definition.name !== 'webResearch' || webResearchEnabled)
    .map((definition) => JSON.parse(JSON.stringify(definition)));
}

function projectOrError(projectId) {
  const project = projectById.get(projectId);
  if (!project) return { ok: false, code: 'UNKNOWN_PROJECT', message: 'Unknown project id' };
  return { ok: true, project };
}

function nodeOrError(project, nodeId) {
  if (!nodeId) return { ok: true, nodeId: null };
  if (!project.flowNodes.includes(nodeId)) return { ok: false, code: 'UNKNOWN_NODE', message: 'Unknown flow node' };
  return { ok: true, nodeId };
}

export function validateToolCall(name, args = {}) {
  const definition = definitions.find((item) => item.name === name);
  if (!definition) return { ok: false, code: 'TOOL_NOT_ALLOWED', message: `Tool ${name} is not allowlisted` };

  if (name === 'openSection') {
    if (!SECTION_ROUTES[args.section]) return { ok: false, code: 'UNKNOWN_SECTION', message: 'Unknown portfolio section' };
    return { ok: true, action: { type: 'navigate', section: args.section, route: SECTION_ROUTES[args.section] } };
  }
  if (name === 'openProject') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    return { ok: true, action: { type: 'openProject', projectId: result.project.id, route: result.project.route } };
  }
  if (name === 'openProjectFlow') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.nodeId);
    if (!node.ok) return node;
    const route = node.nodeId ? `${result.project.route}/flow/${node.nodeId}` : `${result.project.route}/flow`;
    return { ok: true, action: { type: 'openProjectFlow', projectId: result.project.id, nodeId: node.nodeId, route } };
  }
  if (name === 'openJourneyChapter') {
    const chapter = chapterById.get(args.chapterId);
    if (!chapter) return { ok: false, code: 'UNKNOWN_CHAPTER', message: 'Unknown journey chapter' };
    return { ok: true, action: { type: 'openJourneyChapter', chapterId: chapter.id, route: chapter.route } };
  }
  if (name === 'openContact') {
    return { ok: true, action: { type: 'openContact', route: '/contact' } };
  }
  if (name === 'presentProject') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.startNodeId);
    if (!node.ok) return node;
    const actions = [{ type: 'presentationStart', projectId: result.project.id, includeFlow: args.includeFlow === true, startNodeId: node.nodeId }];
    actions.push({ type: 'openProject', projectId: result.project.id, route: result.project.route });
    if (args.includeFlow === true) {
      actions.push({
        type: 'openProjectFlow',
        projectId: result.project.id,
        nodeId: node.nodeId,
        route: node.nodeId ? `${result.project.route}/flow/${node.nodeId}` : `${result.project.route}/flow`
      });
    }
    return { ok: true, actions, action: actions[0] };
  }
  if (name === 'presentProjectStep') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.nodeId);
    if (!node.ok || !node.nodeId) return node.ok ? { ok: false, code: 'UNKNOWN_NODE', message: 'A flow node id is required' } : node;
    return {
      ok: true,
      actions: [
        { type: 'presentationStep', projectId: result.project.id, nodeId: node.nodeId },
        { type: 'openProjectFlow', projectId: result.project.id, nodeId: node.nodeId, route: `${result.project.route}/flow/${node.nodeId}` }
      ]
    };
  }
  if (name === 'pausePresentation') return { ok: true, action: { type: 'presentationPause' } };
  if (name === 'resumePresentation') return { ok: true, action: { type: 'presentationResume' } };
  if (name === 'endPresentation') return { ok: true, action: { type: 'presentationEnd' } };
  if (name === 'searchPortfolio') {
    const query = String(args.query || '').trim();
    if (!query) return { ok: false, code: 'QUERY_REQUIRED', message: 'A search query is required' };
    return { ok: true, knowledge: true, args: { query, limit: Math.min(8, Math.max(1, Number(args.limit) || 6)) } };
  }
  if (name === 'getProjectDossier') {
    const result = projectOrError(args.projectId);
    return result.ok ? { ok: true, knowledge: true, args: { projectId: result.project.id } } : result;
  }
  if (name === 'getProjectStep') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.nodeId);
    if (!node.ok) return node;
    if (!node.nodeId) return { ok: false, code: 'UNKNOWN_NODE', message: 'A flow node id is required' };
    return { ok: true, knowledge: true, args: { projectId: result.project.id, nodeId: node.nodeId } };
  }
  if (name === 'getJourneyChapter') {
    const chapter = chapterById.get(args.chapterId);
    if (!chapter) return { ok: false, code: 'UNKNOWN_CHAPTER', message: 'Unknown journey chapter' };
    return { ok: true, knowledge: true, args: { chapterId: chapter.id } };
  }
  if (name === 'getCurrentView') {
    return { ok: true, knowledge: true, args: {} };
  }
  if (name === 'webResearch') {
    const query = String(args.query || '').trim();
    if (!query) return { ok: false, code: 'QUERY_REQUIRED', message: 'A research query is required' };
    return { ok: true, knowledge: true, args: { query: query.slice(0, 1200) } };
  }
  return { ok: false, code: 'TOOL_NOT_IMPLEMENTED', message: 'Tool is not implemented' };
}

async function overridesFor(db) {
  if (!db?.listKnowledgeOverrides) return [];
  try {
    return normalizeOverrides(await db.listKnowledgeOverrides());
  } catch {
    return [];
  }
}

async function executeKnowledgeTool(name, args, services) {
  const overrides = await overridesFor(services.db);
  if (name === 'searchPortfolio') {
    const result = searchPortfolio(args.query, { overrides, limit: args.limit || 6 });
    return {
      ok: true,
      action: null,
      actions: [],
      data: { query: result.query, results: result.results },
      modelResponse: { ok: true, content: result.text || 'No verified portfolio results found.', results: result.results }
    };
  }
  if (name === 'getProjectDossier') {
    const dossier = projectDossier(args.projectId, { overrides });
    if (!dossier) return { ok: false, error: { code: 'UNKNOWN_PROJECT', message: 'Unknown project id' }, action: null, actions: [] };
    return {
      ok: true,
      action: null,
      actions: [],
      data: dossier,
      modelResponse: { ok: true, content: dossierText(dossier), project: dossier.id, title: dossier.title }
    };
  }
  if (name === 'getProjectStep') {
    const step = flowStep(args.projectId, args.nodeId, { overrides });
    if (!step) return { ok: false, error: { code: 'UNKNOWN_NODE', message: 'Unknown project step' }, action: null, actions: [] };
    const content = [
      `PROJECT: ${step.projectTitle}`,
      `STEP ${step.index}/${step.total}: ${step.title}`,
      step.explanation,
      `Previous: ${step.previous || 'none'}; Next: ${step.next || 'none'}.`,
      'This step is part of the larger process flow. Explain how it connects to the step before and after it.'
    ].join('\n');
    return { ok: true, action: null, actions: [], data: step, modelResponse: { ok: true, content, step: { id: step.nodeId, index: step.index, total: step.total, previous: step.previous, next: step.next } } };
  }
  if (name === 'getJourneyChapter') {
    const chapter = journeyChapter(args.chapterId, { overrides });
    if (!chapter) return { ok: false, error: { code: 'UNKNOWN_CHAPTER', message: 'Unknown journey chapter' }, action: null, actions: [] };
    return { ok: true, action: null, actions: [], data: chapter, modelResponse: { ok: true, content: chapter.text, chapter: chapter.id, title: chapter.title } };
  }
  if (name === 'getCurrentView') {
    const view = currentView(services.portfolioContext, { overrides });
    return { ok: true, action: null, actions: [], data: { context: services.portfolioContext || null }, modelResponse: { ok: true, content: view.text || 'No current-view context is available.' } };
  }
  if (name === 'webResearch') {
    if (services.config?.webResearchEnabled === false) {
      return { ok: false, error: { code: 'WEB_RESEARCH_DISABLED', message: 'Web research is disabled' }, action: null, actions: [] };
    }
    if (!services.textProvider?.research) {
      return { ok: false, error: { code: 'WEB_RESEARCH_UNAVAILABLE', message: 'Web research is unavailable' }, action: null, actions: [] };
    }
    const result = await services.textProvider.research({ query: args.query });
    const sourceLines = (result.sources || []).map((source) => `${source.title || 'Source'}: ${source.url || ''}`).filter(Boolean);
    return {
      ok: true,
      action: null,
      actions: [],
      data: { sources: result.sources || [] },
      modelResponse: {
        ok: true,
        researched: true,
        content: [result.text, sourceLines.length ? `Sources:\n${sourceLines.join('\n')}` : ''].filter(Boolean).join('\n\n'),
        sources: result.sources || []
      },
      usage: result.usage,
      model: result.model
    };
  }
  return { ok: false, error: { code: 'TOOL_NOT_IMPLEMENTED', message: 'Knowledge tool is not implemented' }, action: null, actions: [] };
}

export async function executeToolCall(name, args = {}, services = {}) {
  const validation = validateToolCall(name, args);
  if (!validation.ok) {
    return {
      ok: false,
      error: { code: validation.code, message: validation.message },
      action: null,
      actions: [],
      modelResponse: { ok: false, error: validation.code }
    };
  }
  if (validation.knowledge) return executeKnowledgeTool(name, validation.args, services);

  const actions = validation.actions || (validation.action ? [validation.action] : []);
  const action = actions[0] || null;
  let data = null;
  let content = null;
  if (name === 'presentProject') {
    const overrides = await overridesFor(services.db);
    const dossier = projectDossier(validation.actions.find((item) => item.projectId)?.projectId, { overrides });
    data = dossier;
    content = dossierText(dossier);
  } else if (name === 'presentProjectStep') {
    const overrides = await overridesFor(services.db);
    const step = flowStep(args.projectId, args.nodeId, { overrides });
    data = step;
    content = step ? `STEP ${step.index}/${step.total}: ${step.title}\n${step.explanation}\nPrevious: ${step.previous || 'none'}; Next: ${step.next || 'none'}.` : null;
  }
  return {
    ok: true,
    action,
    actions,
    data,
    modelResponse: {
      ok: true,
      ...(content ? { content } : {}),
      navigationRequested: actions.some((item) => item.route && item.type !== 'presentationStart'),
      routes: actions.map((item) => item.route).filter(Boolean),
      message: actions.some((item) => item.route)
        ? 'The interface will apply this navigation. Do not claim it is already open until the visitor sees it or a Live confirmation arrives.'
        : 'Presentation state updated.'
    }
  };
}

export async function executeToolCalls(calls = [], services = {}) {
  const results = [];
  for (const call of calls) results.push({ call, ...(await executeToolCall(call.name, call.args || {}, services)) });
  return results;
}
