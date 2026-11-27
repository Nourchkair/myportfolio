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
  'getVisibleElements',
  'getElementDetails',
  'webResearch'
]);

const TARGET_ACTIONS = new Set(['navigate', 'scroll', 'highlight', 'spotlight', 'hover', 'expand', 'collapse', 'point', 'trace', 'zoom', 'compare']);
const TARGET_ID_RE = /^(?:(?:journey|contact|about)|(?:(?:section|main-card|project-card|project|project-hero|project-overview|project-contribution|project-text|project-tag|flow|flow-node|flow-link|journey-chapter|journey-tab|journey-text|journey-chip|control):[a-zA-Z0-9_:>.-]+))$/;
const CONTROL_IDS = new Set(['presentation-bar', 'presentation-pause', 'presentation-resume', 'presentation-prev', 'presentation-next', 'presentation-end', 'assistant']);
const TARGET_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const OVERVIEW_VIEWS = new Set(['what', 'challenges', 'value']);


const presentationDefinitions = [
  {
    name: 'getVisibleElements',
    description: 'Return the approved presentation targets currently visible in the portfolio, with stable ids, labels, descriptions and available actions. Use before visual actions and when the visitor refers to "this", "that" or a visible element. If a requested card or project is not visible, use the documented target-id pattern and navigate to it.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'getElementDetails',
    description: 'Return the semantic details, actions and relationships for one approved presentation target id.',
    parameters: {
      type: 'OBJECT',
      properties: { targetId: { type: 'STRING', description: 'Stable target id returned by getVisibleElements.' } },
      required: ['targetId']
    }
  },
  {
    name: 'navigateToElement',
    description: 'Bring an approved presentation target into view using the portfolio’s real navigation, then scroll to it. Use when an element is not currently visible. Target id examples: project-card:acquisition, project-overview:acquisition:what, flow-node:acquisition:demo, journey-chapter:education.',
    parameters: {
      type: 'OBJECT',
      properties: { targetId: { type: 'STRING', description: 'Approved target id.' } },
      required: ['targetId']
    }
  },
  {
    name: 'highlightElement',
    description: 'Highlight one or more approved elements with an outline, glow or emphasis animation. Supports simultaneous or sequential highlighting. Use during contextual explanations and presentations; keep the group focused. Target id examples: project-card:acquisition, project-card:acquisition:tag:0, project-overview:acquisition:what, flow-node:acquisition:demo, flow-link:acquisition:demo->outreach, journey-tab:education.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetId: { type: 'STRING', description: 'One approved target id.' },
        targetIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'One to eight approved target ids.' },
        style: { type: 'STRING', enum: ['outline', 'glow', 'emphasis'], description: 'Visual treatment.' },
        sequence: { type: 'BOOLEAN', description: 'Highlight the targets one at a time.' },
        stepMs: { type: 'INTEGER', description: 'Sequential highlight interval, 300-3000ms.' }
      }
    }
  },
  {
    name: 'spotlightElement',
    description: 'Temporarily dim the surrounding portfolio and spotlight one approved element.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetId: { type: 'STRING' },
        dim: { type: 'NUMBER', description: 'Optional dim strength, 0.2-0.8.' }
      },
      required: ['targetId']
    }
  },
  {
    name: 'hoverElement',
    description: 'Reveal an existing hover or tooltip state on an approved element, such as a workflow node, project card or journey tab.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetId: { type: 'STRING' },
        showTooltip: { type: 'BOOLEAN', description: 'Show the element’s existing or semantic tooltip.' }
      },
      required: ['targetId']
    }
  },
  {
    name: 'expandElement',
    description: 'Open the real expanded state for an approved element: open a project, select a journey chapter, or reveal a workflow node’s detail.',
    parameters: {
      type: 'OBJECT',
      properties: { targetId: { type: 'STRING' } },
      required: ['targetId']
    }
  },
  {
    name: 'collapseElement',
    description: 'Collapse the real expanded state for an approved workflow or tooltip.',
    parameters: {
      type: 'OBJECT',
      properties: { targetId: { type: 'STRING' } },
      required: ['targetId']
    }
  },
  {
    name: 'pointToElement',
    description: 'Move the virtual AI cursor to an approved element and point at it without necessarily highlighting it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetId: { type: 'STRING' },
        label: { type: 'STRING', description: 'Optional short cursor label.' }
      },
      required: ['targetId']
    }
  },
  {
    name: 'traceConnection',
    description: 'Trace one verified connection between two workflow nodes, with a directional animation. The connection must exist in the verified project flow.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        from: { type: 'STRING', description: 'Source workflow node id.' },
        to: { type: 'STRING', description: 'Destination workflow node id.' }
      },
      required: ['projectId', 'from', 'to']
    }
  },
  {
    name: 'traceWorkflow',
    description: 'Trace a verified project workflow: all nodes, the main sequence, a branch, or selected nodes. Use for end-to-end process explanations and alternative paths. Never invent a connection.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', enum: entities.projects.map((project) => project.id) },
        mode: { type: 'STRING', enum: ['all', 'sequence', 'branch'], description: 'Workflow scope.' },
        nodeIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Optional verified node ids to focus.' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'scrollToElement',
    description: 'Scroll an approved element into the viewport without navigating to another section.',
    parameters: {
      type: 'OBJECT',
      properties: { targetId: { type: 'STRING' } },
      required: ['targetId']
    }
  },
  {
    name: 'zoomToElement',
    description: 'Zoom into an approved workflow node, connection or flow section. Use only for a complex workflow target.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetId: { type: 'STRING' },
        scale: { type: 'NUMBER', description: 'Zoom scale, 1.1-2.0.' }
      },
      required: ['targetId']
    }
  },
  {
    name: 'resetZoom',
    description: 'Return a zoomed workflow to its complete overview.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'compareElements',
    description: 'Highlight two approved elements simultaneously and draw a connector between them. Use for differences, contrasts and dependencies.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Exactly two approved target ids.' },
        label: { type: 'STRING', description: 'Optional short comparison label.' }
      },
      required: ['targetIds']
    }
  },
  {
    name: 'clearVisualEffects',
    description: 'Clear highlights, spotlight, virtual cursor, tooltips, connectors and zoom without ending a presentation.',
    parameters: { type: 'OBJECT', properties: {} }
  }
];

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
  ...presentationDefinitions,
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


function targetParts(targetId) {
  if (typeof targetId !== 'string' || targetId.length > 160 || !TARGET_ID_RE.test(targetId)) return null;
  const parts = targetId.split(':');
  const kind = parts[0];
  if (kind === 'section') return SECTION_ROUTES[parts[1]] ? { kind, section: parts[1] } : null;
  if (kind === 'main-card') return ['journey', 'profile', 'projects'].includes(parts[1]) ? { kind, card: parts[1] } : null;
  if (kind === 'contact' || kind === 'about' || kind === 'journey') return parts.length === 1 ? { kind } : null;
  if (kind === 'control') return parts.length === 2 && CONTROL_IDS.has(parts[1]) ? { kind, control: parts[1] } : null;
  if (kind === 'journey-chapter' || kind === 'journey-tab') {
    const chapter = chapterById.get(parts[1]);
    return chapter && parts.length === 2 ? { kind, chapter } : null;
  }
  if (kind === 'journey-text' || kind === 'journey-chip') {
    const chapter = chapterById.get(parts[1]);
    return chapter && parts.length === 3 && TARGET_SLUG_RE.test(parts[2]) ? { kind, chapter, key: parts[2] } : null;
  }
  const project = projectById.get(parts[1]);
  if (!project) return null;
  if (kind === 'project' || kind === 'project-hero') return parts.length === 2 ? { kind, project } : null;
  if (kind === 'project-card') {
    if (parts.length === 2) return { kind, project };
    if (parts.length === 4 && parts[2] === 'tag' && TARGET_SLUG_RE.test(parts[3])) return { kind, project, tagKey: parts[3] };
    return null;
  }
  if (kind === 'project-tag') return parts.length === 3 && TARGET_SLUG_RE.test(parts[2]) ? { kind, project, key: parts[2] } : null;
  if (kind === 'project-overview') return parts.length === 3 && OVERVIEW_VIEWS.has(parts[2]) ? { kind, project, view: parts[2] } : null;
  if (kind === 'project-text') {
    if (parts.length !== 4 || !OVERVIEW_VIEWS.has(parts[2]) || !TARGET_SLUG_RE.test(parts[3])) return null;
    return { kind, project, view: parts[2], key: parts[3] };
  }
  if (kind === 'project-contribution') {
    if (parts.length === 2) return { kind, project };
    if (parts.length === 4 && parts[2] === 'block' && TARGET_SLUG_RE.test(parts[3])) return { kind, project, key: parts[3] };
    return null;
  }
  if (kind === 'flow') return parts.length === 2 ? { kind, project } : null;
  if (kind === 'flow-node') return parts.length === 3 && project.flowNodes.includes(parts[2]) ? { kind, project, nodeId: parts[2] } : null;
  if (kind === 'flow-link') {
    if (parts.length !== 3) return null;
    const [from, to] = parts[2].split('->');
    return from && to && project.flowNodes.includes(from) && project.flowNodes.includes(to) ? { kind, project, from, to } : null;
  }
  return null;
}

function validTargetId(targetId) {
  return Boolean(targetParts(targetId));
}

function targetNavigation(targetId) {
  const target = targetParts(targetId);
  if (!target) return null;
  if (target.kind === 'section') {
    return { type: 'navigate', section: target.section, route: SECTION_ROUTES[target.section], waitForTarget: targetId };
  }
  if (target.kind === 'main-card') {
    const section = target.card === 'profile' ? 'me' : target.card;
    return { type: 'navigate', section, route: SECTION_ROUTES[section], waitForTarget: targetId };
  }
  if (target.kind === 'contact') return { type: 'openContact', route: '/contact', waitForTarget: targetId };
  if (target.kind === 'about') return { type: 'navigate', section: 'me', route: SECTION_ROUTES.me, waitForTarget: targetId };
  if (target.kind === 'journey') {
    return { type: 'navigate', section: 'journey', route: SECTION_ROUTES.journey, waitForTarget: targetId };
  }
  if (target.kind === 'journey-chapter' || target.kind === 'journey-tab' || target.kind === 'journey-text' || target.kind === 'journey-chip') {
    return { type: 'openJourneyChapter', chapterId: target.chapter.id, route: `/journey/${target.chapter.id}`, waitForTarget: targetId };
  }
  if (target.kind === 'flow' || target.kind === 'flow-node' || target.kind === 'flow-link') {
    const nodeId = target.nodeId || target.from || null;
    return {
      type: 'openProjectFlow',
      projectId: target.project.id,
      nodeId,
      route: `/projects/${target.project.id}/flow${nodeId ? `/${nodeId}` : ''}`,
      waitForTarget: targetId
    };
  }
  if (target.kind === 'project-card' || target.kind === 'main-card') {
    return { type: 'showProjectCard', projectId: target.project?.id || null, route: '/projects', waitForTarget: targetId };
  }
  return {
    type: 'openProject',
    projectId: target.project.id,
    route: target.project.route,
    waitForTarget: `project:${target.project.id}`
  };
}

function visualAction(name, args = {}) {
  const targetIds = Array.isArray(args.targetIds)
    ? args.targetIds
    : args.targetId
      ? [args.targetId]
      : [];
  if (targetIds.some((id) => !validTargetId(id))) {
    return { ok: false, code: 'UNKNOWN_TARGET', message: 'One or more target ids are not approved presentation targets' };
  }
  if (!['getVisibleElements', 'getElementDetails', 'clearVisualEffects', 'resetZoom'].includes(name) && !targetIds.length) {
    return { ok: false, code: 'TARGET_REQUIRED', message: 'A target id is required' };
  }
  const firstTarget = targetParts(targetIds[0]);
  let navigationRoute = targetNavigation(targetIds[0])?.route || null;
  if (name === 'expandElement' && firstTarget?.kind === 'project-card') navigationRoute = `/projects/${firstTarget.project.id}`;
  if (name === 'collapseElement' && firstTarget?.kind === 'flow') navigationRoute = `/projects/${firstTarget.project.id}`;
  if (name === 'expandElement' && firstTarget?.kind === 'flow-node') navigationRoute = `/projects/${firstTarget.project.id}/flow/${firstTarget.nodeId}`;
  if (name === 'highlightElement') {
    if (targetIds.length > 8) return { ok: false, code: 'TOO_MANY_TARGETS', message: 'Highlight at most eight targets at once' };
    const style = ['outline', 'glow', 'emphasis'].includes(args.style) ? args.style : 'glow';
    const sequence = args.sequence === true;
    const stepMs = Math.min(3000, Math.max(300, Number(args.stepMs) || 650));
    const first = targetParts(targetIds[0]);
    return {
      ok: true,
      action: {
        type: 'highlightElement',
        targetIds,
        style,
        sequence,
        stepMs,
        navigationRoute,
        waitForTarget: targetIds[0]
      }
    };
  }
  if (name === 'spotlightElement') {
    const dim = Math.min(0.8, Math.max(0.2, Number(args.dim) || 0.52));
    return { ok: true, action: { type: 'spotlightElement', targetId: targetIds[0], dim, navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'hoverElement') {
    return { ok: true, action: { type: 'hoverElement', targetId: targetIds[0], showTooltip: args.showTooltip !== false, navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'expandElement' || name === 'collapseElement') {
    return { ok: true, action: { type: name, targetId: targetIds[0], navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'pointToElement') {
    return { ok: true, action: { type: 'pointToElement', targetId: targetIds[0], label: String(args.label || '').slice(0, 40), navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'scrollToElement') {
    return { ok: true, action: { type: 'scrollToElement', targetId: targetIds[0], navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'zoomToElement') {
    const scale = Math.min(2, Math.max(1.1, Number(args.scale) || 1.35));
    return { ok: true, action: { type: 'zoomToElement', targetId: targetIds[0], scale, navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'compareElements') {
    if (targetIds.length !== 2) return { ok: false, code: 'TWO_TARGETS_REQUIRED', message: 'compareElements needs exactly two targets' };
    return { ok: true, action: { type: 'compareElements', targetIds, label: String(args.label || '').slice(0, 80), navigationRoute, waitForTarget: targetIds[0] } };
  }
  if (name === 'navigateToElement') {
    const navigation = targetNavigation(targetIds[0]);
    if (!navigation) return { ok: false, code: 'UNKNOWN_TARGET', message: 'The target cannot be navigated to' };
    return { ok: true, actions: [navigation, { type: 'scrollToElement', targetId: targetIds[0], waitForTarget: targetIds[0] }] };
  }
  if (name === 'clearVisualEffects') return { ok: true, action: { type: 'clearVisualEffects' } };
  if (name === 'resetZoom') return { ok: true, action: { type: 'resetZoom' } };
  return null;
}

function traceWorkflowAction(args = {}) {
  const result = projectOrError(args.projectId);
  if (!result.ok) return result;
  const requested = Array.isArray(args.nodeIds) ? args.nodeIds : [];
  if (requested.some((nodeId) => !result.project.flowNodes.includes(nodeId))) {
    return { ok: false, code: 'UNKNOWN_NODE', message: 'One or more workflow nodes are unknown' };
  }
  const mode = ['all', 'sequence', 'branch'].includes(args.mode) ? args.mode : 'sequence';
  return {
    ok: true,
    action: {
      type: 'traceWorkflow',
      projectId: result.project.id,
      mode,
      nodeIds: requested,
      route: `/projects/${result.project.id}/flow`,
      navigationRoute: `/projects/${result.project.id}/flow`,
      waitForTarget: `flow-node:${result.project.id}:${result.project.flowNodes[0]}`
    }
  };
}

export function validateToolCall(name, args = {}) {
  const definition = definitions.find((item) => item.name === name);
  if (!definition) return { ok: false, code: 'TOOL_NOT_ALLOWED', message: `Tool ${name} is not allowlisted` };

  if (name === 'getVisibleElements') return { ok: true, knowledge: true, args: {} };
  if (name === 'getElementDetails') {
    if (!validTargetId(args.targetId)) return { ok: false, code: 'UNKNOWN_TARGET', message: 'Unknown presentation target' };
    return { ok: true, knowledge: true, args: { targetId: args.targetId } };
  }
  if (name === 'clearVisualEffects' || name === 'resetZoom') return visualAction(name, args);
  if (name === 'traceConnection') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    if (!result.project.flowNodes.includes(args.from) || !result.project.flowNodes.includes(args.to)) {
      return { ok: false, code: 'UNKNOWN_NODE', message: 'Both workflow nodes must be verified' };
    }
    return {
      ok: true,
      action: {
        type: 'traceConnection',
        projectId: result.project.id,
        from: args.from,
        to: args.to,
        route: `/projects/${result.project.id}/flow/${args.from}`,
        navigationRoute: `/projects/${result.project.id}/flow/${args.from}`,
        waitForTarget: `flow-node:${result.project.id}:${args.from}`
      }
    };
  }
  if (name === 'traceWorkflow') return traceWorkflowAction(args);
  if (['navigateToElement', 'highlightElement', 'spotlightElement', 'hoverElement', 'expandElement', 'collapseElement', 'pointToElement', 'scrollToElement', 'zoomToElement', 'compareElements'].includes(name)) {
    return visualAction(name, args);
  }
  if (name === 'openSection') {
    if (!SECTION_ROUTES[args.section]) return { ok: false, code: 'UNKNOWN_SECTION', message: 'Unknown portfolio section' };
    return { ok: true, action: { type: 'navigate', section: args.section, route: SECTION_ROUTES[args.section], waitForTarget: `section:${args.section}` } };
  }
  if (name === 'openProject') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    return { ok: true, action: { type: 'openProject', projectId: result.project.id, route: result.project.route, waitForTarget: `project:${result.project.id}` } };
  }
  if (name === 'openProjectFlow') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.nodeId);
    if (!node.ok) return node;
    const route = node.nodeId ? `${result.project.route}/flow/${node.nodeId}` : `${result.project.route}/flow`;
    return { ok: true, action: { type: 'openProjectFlow', projectId: result.project.id, nodeId: node.nodeId, route, waitForTarget: node.nodeId ? `flow-node:${result.project.id}:${node.nodeId}` : `flow:${result.project.id}` } };
  }
  if (name === 'openJourneyChapter') {
    const chapter = chapterById.get(args.chapterId);
    if (!chapter) return { ok: false, code: 'UNKNOWN_CHAPTER', message: 'Unknown journey chapter' };
    return { ok: true, action: { type: 'openJourneyChapter', chapterId: chapter.id, route: chapter.route, waitForTarget: `journey-chapter:${chapter.id}` } };
  }
  if (name === 'openContact') {
    return { ok: true, action: { type: 'openContact', route: '/contact', waitForTarget: 'contact' } };
  }
  if (name === 'presentProject') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.startNodeId);
    if (!node.ok) return node;
    const startIndex = node.nodeId ? result.project.flowNodes.indexOf(node.nodeId) : -1;
    const actions = [{
      type: 'presentationStart',
      projectId: result.project.id,
      includeFlow: args.includeFlow === true,
      startNodeId: node.nodeId,
      stepIndex: startIndex >= 0 ? startIndex + 1 : 0,
      totalSteps: result.project.flowNodes.length,
      label: result.project.title
    }];
    actions.push({ type: 'openProject', projectId: result.project.id, route: result.project.route, waitForTarget: `project:${result.project.id}` });
    if (args.includeFlow === true) {
      actions.push({
        type: 'openProjectFlow',
        projectId: result.project.id,
        nodeId: node.nodeId,
        route: node.nodeId ? `${result.project.route}/flow/${node.nodeId}` : `${result.project.route}/flow`,
        waitForTarget: node.nodeId ? `flow-node:${result.project.id}:${node.nodeId}` : `flow:${result.project.id}`
      });
    }
    return { ok: true, actions, action: actions[0] };
  }
  if (name === 'presentProjectStep') {
    const result = projectOrError(args.projectId);
    if (!result.ok) return result;
    const node = nodeOrError(result.project, args.nodeId);
    if (!node.ok || !node.nodeId) return node.ok ? { ok: false, code: 'UNKNOWN_NODE', message: 'A flow node id is required' } : node;
    const stepIndex = result.project.flowNodes.indexOf(node.nodeId) + 1;
    return {
      ok: true,
      actions: [
        {
          type: 'presentationStep',
          projectId: result.project.id,
          nodeId: node.nodeId,
          stepIndex,
          totalSteps: result.project.flowNodes.length,
          label: node.nodeId
        },
        {
          type: 'openProjectFlow',
          projectId: result.project.id,
          nodeId: node.nodeId,
          route: `${result.project.route}/flow/${node.nodeId}`,
          waitForTarget: `flow-node:${result.project.id}:${node.nodeId}`
        }
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
  if (name === 'getVisibleElements') {
    const all = Array.isArray(services.portfolioContext?.targets) ? services.portfolioContext.targets : [];
    const visible = all.filter((target) => target.visible);
    const selected = (visible.length ? visible : all).slice(0, 40);
    const content = selected.length
      ? selected.map((target) => `${target.id} | ${target.kind} | ${target.label}${target.visible ? '' : ' (not currently visible)'} | actions: ${target.actions.join(', ') || 'none'}`).join('\n')
      : 'No approved presentation targets are currently registered.';
    return {
      ok: true,
      action: null,
      actions: [],
      data: { targets: selected },
      modelResponse: { ok: true, content, targets: selected }
    };
  }
  if (name === 'getElementDetails') {
    const all = Array.isArray(services.portfolioContext?.targets) ? services.portfolioContext.targets : [];
    const target = all.find((item) => item.id === args.targetId);
    if (!target) {
      return { ok: false, error: { code: 'UNKNOWN_TARGET', message: 'Target is not available in the current view' }, action: null, actions: [] };
    }
    const content = [
      `target: ${target.id}`,
      `kind: ${target.kind}`,
      `label: ${target.label}`,
      target.description ? `description: ${target.description}` : '',
      `actions: ${target.actions.join(', ') || 'none'}`,
      target.relationships.length ? `relationships: ${target.relationships.join(', ')}` : '',
      target.knowledgeRef ? `knowledge: ${target.knowledgeRef}` : '',
      `visible: ${target.visible ? 'yes' : 'no'}`
    ].filter(Boolean).join('\n');
    return { ok: true, action: null, actions: [], data: target, modelResponse: { ok: true, content, target } };
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
  const visual = actions.some((item) => ['highlightElement', 'spotlightElement', 'hoverElement', 'expandElement', 'collapseElement', 'pointToElement', 'traceConnection', 'traceWorkflow', 'scrollToElement', 'zoomToElement', 'resetZoom', 'compareElements', 'clearVisualEffects'].includes(item.type));
  return {
    ok: true,
    action,
    actions,
    data,
    modelResponse: {
      ok: true,
      ...(content ? { content } : {}),
      visual,
      navigationRequested: actions.some((item) => item.route && item.type !== 'presentationStart'),
      routes: actions.map((item) => item.route).filter(Boolean),
      message: visual
        ? 'The interface will apply this visual action. Do not claim the element is already highlighted, open, zoomed or traced until the frontend confirmation arrives.'
        : actions.some((item) => item.route)
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
