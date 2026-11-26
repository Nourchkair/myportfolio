import { getEntities } from '../knowledge/retrieval.js';

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
    description: 'Open the portfolio contact panel.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'presentProject',
    description: 'Give a guided presentation of a public project: open the case study and optionally continue into its process flow.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        includeFlow: { type: 'BOOLEAN', description: 'Continue into the project process flow after opening the case study.' }
      },
      required: ['projectId']
    }
  }
];

export function getToolDeclarations() {
  return definitions.map((definition) => JSON.parse(JSON.stringify(definition)));
}

export function validateToolCall(name, args = {}) {
  const definition = definitions.find((item) => item.name === name);
  if (!definition) return { ok: false, code: 'TOOL_NOT_ALLOWED', message: `Tool ${name} is not allowlisted` };

  if (name === 'openSection') {
    if (!SECTION_ROUTES[args.section]) return { ok: false, code: 'UNKNOWN_SECTION', message: 'Unknown portfolio section' };
    return { ok: true, action: { type: 'navigate', section: args.section, route: SECTION_ROUTES[args.section] } };
  }
  if (name === 'openProject') {
    const project = projectById.get(args.projectId);
    if (!project) return { ok: false, code: 'UNKNOWN_PROJECT', message: 'Unknown project id' };
    return { ok: true, action: { type: 'openProject', projectId: project.id, route: project.route } };
  }
  if (name === 'openProjectFlow') {
    const project = projectById.get(args.projectId);
    if (!project) return { ok: false, code: 'UNKNOWN_PROJECT', message: 'Unknown project id' };
    if (args.nodeId && !project.flowNodes.includes(args.nodeId)) {
      return { ok: false, code: 'UNKNOWN_NODE', message: 'Unknown flow node' };
    }
    const route = args.nodeId ? `${project.route}/flow/${args.nodeId}` : `${project.route}/flow`;
    return { ok: true, action: { type: 'openProjectFlow', projectId: project.id, nodeId: args.nodeId || null, route } };
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
    const project = projectById.get(args.projectId);
    if (!project) return { ok: false, code: 'UNKNOWN_PROJECT', message: 'Unknown project id' };
    const actions = [{ type: 'openProject', projectId: project.id, route: project.route }];
    if (args.includeFlow === true) {
      actions.push({ type: 'openProjectFlow', projectId: project.id, nodeId: null, route: `${project.route}/flow` });
    }
    return { ok: true, action: actions[0], actions };
  }
  return { ok: false, code: 'TOOL_NOT_IMPLEMENTED', message: 'Tool is not implemented' };
}

export function executeToolCall(name, args) {
  const validation = validateToolCall(name, args);
  if (!validation.ok) {
    return {
      ok: false,
      error: { code: validation.code, message: validation.message },
      action: null,
      modelResponse: { ok: false, error: validation.code }
    };
  }
  const actions = validation.actions || (validation.action ? [validation.action] : []);
  const action = actions[0] || null;
  return {
    ok: true,
    action,
    actions,
    modelResponse: {
      ok: true,
      message: `Navigation requested: ${actions.map((item) => item.route).join(' → ')}`,
      route: action?.route || null,
      routes: actions.map((item) => item.route)
    }
  };
}

export function executeToolCalls(calls = []) {
  return calls.map((call) => ({ call, ...executeToolCall(call.name, call.args || {}) }));
}
