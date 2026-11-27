import { PROJECTS, PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

const CHAPTER_BY_ID = Object.fromEntries(PROFESSIONAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const MAIN_CARDS = ['journey', 'profile', 'projects'];
const CONTROL_TARGETS = {
  'presentation-bar': 'Presentation controls',
  'presentation-pause': 'Pause presentation',
  'presentation-resume': 'Resume presentation',
  'presentation-prev': 'Previous presentation step',
  'presentation-next': 'Next presentation step',
  'presentation-end': 'End presentation',
  assistant: 'AI Nour assistant'
};

let app = null;
let dom = null;
let presentation = { active: false, paused: false, projectId: null, nodeId: null, stepIndex: 0, totalSteps: 0, label: '' };
let highlights = new Map();
let spotlightId = null;
let cursorId = null;
let cursorLabel = '';
let hoverId = null;
let compareIds = [];
let zoomState = null;
let effectEpoch = 0;
let sequenceTimer = null;
let sequenceResolve = null;
let pulseFrame = null;
let pulseToken = 0;
let syncFrame = null;
let tooltipId = null;
let lastFocus = null;
let observer = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise((resolve) => {
  sequenceResolve = resolve;
  sequenceTimer = setTimeout(() => {
    sequenceTimer = null;
    sequenceResolve = null;
    resolve();
  }, ms);
});

function isReducedMotion() {
  return app?.isReducedMotion?.() === true || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function projectOpen(projectId) {
  const overlay = document.getElementById('project');
  return Boolean(overlay?.classList.contains('open') && overlay.dataset.project === projectId);
}

function flowOpen(projectId) {
  const overlay = document.getElementById('project');
  return Boolean(projectOpen(projectId) && overlay.classList.contains('project-flow-mode'));
}

function aboutOpen() {
  return Boolean(document.getElementById('aboutView')?.classList.contains('open'));
}

function journeyChapterOpen(chapterId) {
  const tab = document.querySelector(`[data-pro-chapter="${chapterId}"][aria-selected="true"]`);
  return Boolean(aboutOpen() && tab && document.getElementById('proChapter'));
}

function targetIsVisible(element) {
  if (!element || !element.isConnected) return false;
  if (element.closest('[inert]')) return false;
  if (element instanceof SVGElement && typeof element.getBBox === 'function') {
    const box = element.getBBox();
    return (box.width > 0 || box.height > 0) && getComputedStyle(element).visibility !== 'hidden';
  }
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
    && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
}

function inViewport(element) {
  if (!targetIsVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
}

function projectById(id) {
  return PROJECT_BY_ID[id] || null;
}

function flowNode(projectId, nodeId) {
  return projectById(projectId)?.flow?.nodes?.find((node) => node.id === nodeId) || null;
}

function flowConnections(projectId) {
  return projectById(projectId)?.flow?.connections || [];
}

function cardElement(deck, index) {
  return document.querySelector(`#cardStage .os-card[data-deck="${deck}"][data-deck-index="${index}"]`);
}

function projectCardIndex(projectId) {
  return PROJECTS.findIndex((project) => project.id === projectId);
}

function projectTargetElement(projectId, selector) {
  if (!projectOpen(projectId)) return null;
  return document.querySelector(selector);
}

function targetDescriptor(id) {
  const projectCard = id.match(/^project-card:([^:]+)(?::tag:(\d+))?$/);
  const projectTag = id.match(/^project-tag:([^:]+):(\d+)$/);
  const overview = id.match(/^project-overview:([^:]+):(what|challenges|value)$/);
  const text = id.match(/^project-text:([^:]+):(what|challenges|value):(\d+)$/);
  const contribution = id.match(/^project-contribution:([^:]+)(?::block:(\d+))?$/);
  const flow = id.match(/^flow:([^:]+)$/);
  const node = id.match(/^flow-node:([^:]+):([^:]+)$/);
  const link = id.match(/^flow-link:([^:]+):([^>]+)->(.+)$/);
  const chapter = id.match(/^journey-(?:chapter|tab):([^:]+)$/);
  const journeyText = id.match(/^journey-(?:text|chip):([^:]+):(\d+)$/);
  if (projectCard) {
    const project = projectById(projectCard[1]);
    if (!project) return null;
    const tagIndex = projectCard[2] === undefined ? null : Number(projectCard[2]);
    return {
      id,
      kind: 'project-card',
      project,
      tagIndex,
      label: tagIndex === null ? project.title : project.capabilities?.[tagIndex] || project.title,
      description: tagIndex === null ? project.description : `Project capability: ${project.capabilities?.[tagIndex] || ''}`,
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => tagIndex === null
        ? cardElement('projects', projectCardIndex(project.id))
        : cardElement('projects', projectCardIndex(project.id))?.querySelectorAll('.card-tags span')?.[tagIndex] || null
    };
  }
  if (projectTag) {
    const project = projectById(projectTag[1]);
    if (!project) return null;
    const index = Number(projectTag[2]);
    return {
      id,
      kind: 'project-tag',
      project,
      index,
      label: project.capabilities?.[index] || project.title,
      description: `Project capability: ${project.capabilities?.[index] || ''}`,
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, `#projectHero .card-tags span:nth-child(${index + 1})`)
    };
  }
  if (overview) {
    const project = projectById(overview[1]);
    if (!project) return null;
    const view = overview[2];
    const descriptions = {
      what: project.overview?.whatItIs,
      challenges: project.overview?.challenges?.join(' '),
      value: project.overview?.value?.join(' ')
    };
    return {
      id,
      kind: 'project-overview',
      project,
      view,
      label: view === 'what' ? 'What it is' : view === 'challenges' ? 'Business challenges' : 'Business value',
      description: String(descriptions[view] || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, view === 'what' ? '#projectBrief .pw-overview-what' : view === 'challenges' ? '#projectBrief .pw-overview-challenges' : '#projectGallery .pw-overview-value')
    };
  }
  if (text) {
    const project = projectById(text[1]);
    if (!project) return null;
    const view = text[2];
    const index = Number(text[3]);
    const content = view === 'what'
      ? (Array.isArray(project.overview?.whatItIs) ? project.overview.whatItIs : [project.overview?.whatItIs])
      : view === 'challenges' ? project.overview?.challenges : project.overview?.value;
    return {
      id,
      kind: 'project-text',
      project,
      view,
      index,
      label: `${view} ${index + 1}`,
      description: String(content?.[index] || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project-overview:${project.id}:${view}`],
      knowledgeRef: `project:${project.id}`,
      element: () => {
        if (!projectOpen(project.id)) return null;
        const selector = view === 'what' ? '#projectBrief .pw-overview-what .pw-overview-lead' : view === 'challenges' ? '#projectBrief .pw-overview-challenges li' : '#projectGallery .pw-overview-value li';
        return document.querySelectorAll(selector)[index] || null;
      }
    };
  }
  if (contribution) {
    const project = projectById(contribution[1]);
    if (!project) return null;
    const blockIndex = contribution[2] === undefined ? null : Number(contribution[2]);
    const block = project.overview?.contribution?.blocks?.[blockIndex];
    return {
      id,
      kind: 'project-contribution',
      project,
      index: blockIndex,
      label: blockIndex === null ? 'My contribution' : block?.label || 'My contribution',
      description: String(block?.text || project.overview?.contribution?.lead || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, blockIndex === null ? '#projectGallery .pw-overview-contribution' : `#projectGallery .pw-contribution-block:nth-child(${blockIndex + 1})`)
    };
  }
  if (flow) {
    const project = projectById(flow[1]);
    if (!project?.flow) return null;
    return {
      id,
      kind: 'flow',
      project,
      label: project.flow.title,
      description: project.flow.intro,
      actions: ['navigate', 'highlight', 'spotlight', 'point', 'trace', 'zoom', 'scroll'],
      relationships: project.flow.nodes.map((item) => `flow-node:${project.id}:${item.id}`),
      knowledgeRef: `project:${project.id}:flow:intro`,
      element: () => flowOpen(project.id) ? document.getElementById('projectFlow') : null
    };
  }
  if (node) {
    const project = projectById(node[1]);
    const item = flowNode(node[1], node[2]);
    if (!project || !item) return null;
    const connections = flowConnections(project.id).filter((connection) => connection.from === item.id || connection.to === item.id);
    return {
      id,
      kind: 'flow-node',
      project,
      nodeId: item.id,
      label: item.title,
      description: item.explanation,
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'collapse', 'point', 'trace', 'zoom', 'scroll'],
      relationships: connections.map((connection) => `flow-link:${project.id}:${connection.from}->${connection.to}`),
      knowledgeRef: `project:${project.id}:flow:${item.id}`,
      element: () => flowOpen(project.id) ? document.querySelector(`#projectFlow [data-flow-node="${item.id}"]`) : null
    };
  }
  if (link) {
    const project = projectById(link[1]);
    const from = flowNode(link[1], link[2]);
    const to = flowNode(link[1], link[3]);
    if (!project || !from || !to) return null;
    const connection = flowConnections(project.id).find((item) => item.from === from.id && item.to === to.id);
    if (!connection) return null;
    return {
      id,
      kind: 'flow-link',
      project,
      from: from.id,
      to: to.id,
      label: `${from.title} → ${to.title}`,
      description: connection.label || `${connection.kind || 'verified'} connection`,
      actions: ['highlight', 'spotlight', 'point', 'trace', 'zoom', 'scroll'],
      relationships: [`flow-node:${project.id}:${from.id}`, `flow-node:${project.id}:${to.id}`],
      knowledgeRef: `project:${project.id}:flow:${from.id}`,
      element: () => flowOpen(project.id) ? document.querySelector(`#projectFlow .pw-flow-link[data-from="${from.id}"][data-to="${to.id}"]`) : null
    };
  }
  if (chapter) {
    const item = CHAPTER_BY_ID[chapter[1]];
    if (!item) return null;
    return {
      id,
      kind: chapter[0].includes('tab') ? 'journey-tab' : 'journey-chapter',
      chapter: item,
      label: item.title,
      description: String(item.paragraphs?.[0] || item.label || '').slice(0, 220),
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'point', 'scroll'],
      relationships: [`journey`],
      knowledgeRef: `journey:${item.id}`,
      element: () => chapter[0].includes('tab')
        ? document.querySelector(`[data-pro-chapter="${item.id}"]`)
        : aboutOpen() && document.querySelector(`[data-pro-chapter="${item.id}"][aria-selected="true"]`) ? document.getElementById('proChapter') : null
    };
  }
  if (journeyText) {
    const item = CHAPTER_BY_ID[journeyText[1]];
    if (!item) return null;
    const index = Number(journeyText[2]);
    const isChip = id.startsWith('journey-chip:');
    return {
      id,
      kind: isChip ? 'journey-chip' : 'journey-text',
      chapter: item,
      index,
      label: isChip ? item.capabilities?.[index] || item.title : `${item.title} paragraph ${index + 1}`,
      description: isChip ? `Capability: ${item.capabilities?.[index] || ''}` : String(item.paragraphs?.[index] || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`journey-chapter:${item.id}`],
      knowledgeRef: `journey:${item.id}`,
      element: () => {
        if (!journeyChapterOpen(item.id)) return null;
        const selector = isChip ? '#proChapter .pro-chips span' : '#proChapter .pro-narrative p';
        return document.querySelectorAll(selector)[index] || null;
      }
    };
  }
  return null;
}

function buildTargets() {
  const targets = [];
  const add = (target) => { if (target) targets.push(target); };
  const sectionTarget = (section, label, description, element) => add({
    id: `section:${section}`,
    kind: 'section',
    label,
    description,
    actions: ['navigate', 'highlight', 'spotlight', 'point', 'scroll'],
    relationships: [],
    knowledgeRef: `section:${section}`,
    element
  });
  sectionTarget('home', 'Portfolio home', 'The main portfolio carousel.', () => document.getElementById('carouselPanel'));
  sectionTarget('me', 'About Nour', 'Nour’s profile and background.', () => document.getElementById('aboutView'));
  sectionTarget('journey', 'My Journey', 'Nour’s professional journey.', () => document.getElementById('aboutView'));
  sectionTarget('projects', 'Projects', 'The selected project collection.', () => document.getElementById('project')?.classList.contains('open') ? document.getElementById('project') : document.getElementById('carouselPanel'));
  sectionTarget('contact', 'Contact', 'Contact and career/consulting options.', () => document.getElementById('contactPanel'));
  sectionTarget('reading', 'Reading view', 'The accessible reading view.', () => document.getElementById('mainContent'));
  add({ id: 'about', kind: 'about', label: 'About Nour', description: 'Nour’s profile and professional story.', actions: ['navigate', 'highlight', 'spotlight', 'point'], relationships: [], knowledgeRef: 'about', element: () => document.getElementById('aboutView') });
  add({ id: 'journey', kind: 'journey', label: 'My Journey', description: 'The professional journey timeline.', actions: ['navigate', 'highlight', 'spotlight', 'point'], relationships: PROFESSIONAL_CHAPTERS.map((chapter) => `journey-chapter:${chapter.id}`), knowledgeRef: 'journey', element: () => document.getElementById('aboutView') });
  add({ id: 'contact', kind: 'contact', label: 'Contact', description: 'Contact and career/consulting options.', actions: ['navigate', 'highlight', 'spotlight', 'point'], relationships: [], knowledgeRef: 'contact', element: () => document.getElementById('contactPanel') });

  MAIN_CARDS.forEach((card, index) => add({
    id: `main-card:${card}`,
    kind: 'main-card',
    label: card === 'journey' ? 'My Journey card' : card === 'profile' ? 'Nour Chkair card' : 'Projects card',
    description: card === 'journey' ? 'The journey card.' : card === 'profile' ? 'The profile card.' : 'The projects collection card.',
    actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'point', 'scroll'],
    relationships: card === 'projects' ? PROJECTS.map((project) => `project-card:${project.id}`) : [],
    knowledgeRef: card === 'profile' ? 'about' : card === 'journey' ? 'journey' : 'projects',
    element: () => cardElement('main', index)
  }));

  PROJECTS.forEach((project, index) => {
    add({
      id: `project-card:${project.id}`,
      kind: 'project-card',
      project,
      tagIndex: null,
      label: project.title,
      description: project.description,
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'point', 'scroll'],
      relationships: [`project:${project.id}`, ...(project.capabilities || []).map((_, tagIndex) => `project-card:${project.id}:tag:${tagIndex}`)],
      knowledgeRef: `project:${project.id}`,
      element: () => cardElement('projects', index)
    });
    (project.capabilities || []).slice(0, 8).forEach((capability, tagIndex) => add({
      id: `project-card:${project.id}:tag:${tagIndex}`,
      kind: 'project-card',
      project,
      tagIndex,
      label: capability,
      description: `Project capability: ${capability}`,
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project-card:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => document.querySelectorAll(`#cardStage .os-card[data-deck="projects"][data-deck-index="${index}"] .card-tags span`)[tagIndex] || null
    }));
    add({
      id: `project:${project.id}`,
      kind: 'project',
      project,
      label: project.title,
      description: project.description,
      actions: ['navigate', 'highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project-hero:${project.id}`, `project-overview:${project.id}:what`, `flow:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectOpen(project.id) ? document.getElementById('project') : null
    });
    add({
      id: `project-hero:${project.id}`,
      kind: 'project-hero',
      project,
      label: `${project.title} hero`,
      description: `${project.title}, ${project.category}.`,
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, '#projectHero')
    });
    ['what', 'challenges', 'value'].forEach((view) => add({
      id: `project-overview:${project.id}:${view}`,
      kind: 'project-overview',
      project,
      view,
      label: view === 'what' ? 'What it is' : view === 'challenges' ? 'Business challenges' : 'Business value',
      description: String(view === 'what' ? project.overview?.whatItIs : view === 'challenges' ? project.overview?.challenges?.join(' ') : project.overview?.value?.join(' ') || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, view === 'what' ? '#projectBrief .pw-overview-what' : view === 'challenges' ? '#projectBrief .pw-overview-challenges' : '#projectGallery .pw-overview-value')
    }));
    add({
      id: `project-contribution:${project.id}`,
      kind: 'project-contribution',
      project,
      index: null,
      label: 'My contribution',
      description: String(project.overview?.contribution?.lead || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, '#projectGallery .pw-overview-contribution')
    });
    (project.capabilities || []).slice(0, 8).forEach((capability, index) => add({
      id: `project-tag:${project.id}:${index}`,
      kind: 'project-tag',
      project,
      index,
      label: capability,
      description: `Project capability: ${capability}`,
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, `#projectHero .card-tags span:nth-child(${index + 1})`)
    }));
    (project.overview?.contribution?.blocks || []).slice(0, 8).forEach((block, index) => add({
      id: `project-contribution:${project.id}:block:${index}`,
      kind: 'project-contribution',
      project,
      index,
      label: block.label || 'My contribution',
      description: String(block.text || '').slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`project-contribution:${project.id}`],
      knowledgeRef: `project:${project.id}`,
      element: () => projectTargetElement(project.id, `#projectGallery .pw-contribution-block:nth-child(${index + 1})`)
    }));
    ['what', 'challenges', 'value'].forEach((view) => {
      const content = view === 'what'
        ? (Array.isArray(project.overview?.whatItIs) ? project.overview.whatItIs : [project.overview?.whatItIs])
        : view === 'challenges' ? (project.overview?.challenges || []) : (project.overview?.value || []);
      content.slice(0, 12).forEach((paragraph, index) => add({
        id: `project-text:${project.id}:${view}:${index}`,
        kind: 'project-text',
        project,
        view,
        index,
        label: `${view} ${index + 1}`,
        description: String(paragraph || '').slice(0, 220),
        actions: ['highlight', 'spotlight', 'point', 'scroll'],
        relationships: [`project-overview:${project.id}:${view}`],
        knowledgeRef: `project:${project.id}`,
        element: () => {
          if (!projectOpen(project.id)) return null;
          const selector = view === 'what' ? '#projectBrief .pw-overview-what .pw-overview-lead' : view === 'challenges' ? '#projectBrief .pw-overview-challenges li' : '#projectGallery .pw-overview-value li';
          return document.querySelectorAll(selector)[index] || null;
        }
      }));
    });
    (project.flow?.nodes || []).forEach((node) => add({
      id: `flow-node:${project.id}:${node.id}`,
      kind: 'flow-node',
      project,
      nodeId: node.id,
      label: node.title,
      description: node.explanation,
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'collapse', 'point', 'trace', 'zoom', 'scroll'],
      relationships: flowConnections(project.id).filter((connection) => connection.from === node.id || connection.to === node.id).map((connection) => `flow-link:${project.id}:${connection.from}->${connection.to}`),
      knowledgeRef: `project:${project.id}:flow:${node.id}`,
      element: () => flowOpen(project.id) ? document.querySelector(`#projectFlow [data-flow-node="${node.id}"]`) : null
    }));
    flowConnections(project.id).forEach((connection) => add({
      id: `flow-link:${project.id}:${connection.from}->${connection.to}`,
      kind: 'flow-link',
      project,
      from: connection.from,
      to: connection.to,
      label: `${flowNode(project.id, connection.from)?.title || connection.from} → ${flowNode(project.id, connection.to)?.title || connection.to}`,
      description: connection.label || `${connection.kind || 'verified'} connection`,
      actions: ['highlight', 'spotlight', 'point', 'trace', 'zoom', 'scroll'],
      relationships: [`flow-node:${project.id}:${connection.from}`, `flow-node:${project.id}:${connection.to}`],
      knowledgeRef: `project:${project.id}:flow:${connection.from}`,
      element: () => flowOpen(project.id) ? document.querySelector(`#projectFlow .pw-flow-link[data-from="${connection.from}"][data-to="${connection.to}"]`) : null
    }));
    if (project.flow) add({
      id: `flow:${project.id}`,
      kind: 'flow',
      project,
      label: project.flow.title,
      description: project.flow.intro,
      actions: ['navigate', 'highlight', 'spotlight', 'point', 'trace', 'zoom', 'scroll'],
      relationships: project.flow.nodes.map((node) => `flow-node:${project.id}:${node.id}`),
      knowledgeRef: `project:${project.id}:flow:intro`,
      element: () => flowOpen(project.id) ? document.getElementById('projectFlow') : null
    });
  });

  PROFESSIONAL_CHAPTERS.forEach((chapter) => {
    add({
      id: `journey-tab:${chapter.id}`,
      kind: 'journey-tab',
      chapter,
      label: chapter.title,
      description: `${chapter.label} · ${chapter.period}`,
      actions: ['navigate', 'highlight', 'spotlight', 'hover', 'expand', 'point', 'scroll'],
      relationships: [`journey`],
      knowledgeRef: `journey:${chapter.id}`,
      element: () => document.querySelector(`[data-pro-chapter="${chapter.id}"]`)
    });
    add({
      id: `journey-chapter:${chapter.id}`,
      kind: 'journey-chapter',
      chapter,
      label: chapter.title,
      description: String(chapter.paragraphs?.[0] || chapter.label || '').slice(0, 220),
      actions: ['navigate', 'highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`journey`],
      knowledgeRef: `journey:${chapter.id}`,
      element: () => journeyChapterOpen(chapter.id) ? document.getElementById('proChapter') : null
    });
    (chapter.paragraphs || []).slice(0, 12).forEach((paragraph, index) => add({
      id: `journey-text:${chapter.id}:${index}`,
      kind: 'journey-text',
      chapter,
      index,
      label: `${chapter.title} paragraph ${index + 1}`,
      description: String(paragraph).slice(0, 220),
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`journey-chapter:${chapter.id}`],
      knowledgeRef: `journey:${chapter.id}`,
      element: () => journeyChapterOpen(chapter.id) ? document.querySelectorAll('#proChapter .pro-narrative p')[index] || null : null
    }));
    (chapter.capabilities || []).slice(0, 12).forEach((capability, index) => add({
      id: `journey-chip:${chapter.id}:${index}`,
      kind: 'journey-chip',
      chapter,
      index,
      label: capability,
      description: `Journey capability: ${capability}`,
      actions: ['highlight', 'spotlight', 'point', 'scroll'],
      relationships: [`journey-chapter:${chapter.id}`],
      knowledgeRef: `journey:${chapter.id}`,
      element: () => journeyChapterOpen(chapter.id) ? document.querySelectorAll('#proChapter .pro-chips span')[index] || null : null
    }));
  });

  Object.entries(CONTROL_TARGETS).forEach(([control, label]) => add({
    id: `control:${control}`,
    kind: 'control',
    label,
    description: 'Presentation interface control.',
    actions: ['highlight', 'spotlight', 'point'],
    relationships: [],
    knowledgeRef: 'presentation',
    element: () => control === 'presentation-bar' ? dom?.bar || null : control.startsWith('presentation-') ? dom?.bar?.querySelector(`[data-ai-pres="${control.replace('presentation-', '')}"]`) || null : null
  }));

  return targets;
}

function targetIndex(limit = 240) {
  const targets = buildTargets();
  return targets.map((target) => ({
    id: target.id,
    kind: target.kind,
    label: target.label,
    description: target.description,
    actions: target.actions,
    relationships: target.relationships,
    knowledgeRef: target.knowledgeRef,
    visible: targetIsVisible(target.element?.())
  })).slice(0, limit);
}

function getTargets({ visibleOnly = false, limit = 120 } = {}) {
  const targets = targetIndex(limit + 40);
  const selected = visibleOnly ? targets.filter((target) => target.visible) : targets;
  return { targets: selected.slice(0, limit) };
}

function getTarget(id) {
  return targetIndex().find((target) => target.id === id) || null;
}

function resolveElement(id) {
  const target = buildTargets().find((item) => item.id === id);
  return target?.element?.() || null;
}

function effectiveId(id) {
  if (id.startsWith('project-card:')) {
    const parts = id.split(':');
    const projectId = parts[1];
    if (projectOpen(projectId)) return parts.length === 4 && parts[2] === 'tag' ? `project-tag:${projectId}:${parts[3]}` : `project-hero:${projectId}`;
  }
  return id;
}

function navigationFor(id) {
  if (id.startsWith('section:')) {
    const section = id.split(':')[1];
    return { method: 'navigateTo', args: [section] };
  }
  if (id.startsWith('main-card:')) {
    const card = id.split(':')[1];
    return { method: 'navigateTo', args: [card === 'profile' ? 'me' : card] };
  }
  if (id === 'contact' || id.startsWith('control:presentation')) return id === 'contact' ? { method: 'openContact', args: [] } : null;
  if (id === 'about' || id === 'journey' || id.startsWith('journey-')) {
    const chapterId = id.split(':')[1];
    return { method: 'openJourneyChapter', args: chapterId && CHAPTER_BY_ID[chapterId] ? [chapterId] : [] };
  }
  if (id.startsWith('project') && !id.startsWith('project-card:')) {
    const projectId = id.split(':')[1];
    return projectById(projectId) ? { method: 'openProject', args: [projectId] } : null;
  }
  if (id.startsWith('project-card:')) {
    const projectId = id.split(':')[1];
    return projectById(projectId) ? { method: 'showProjectCard', args: [projectId] } : null;
  }
  if (id.startsWith('flow')) {
    const [, projectId, rest] = id.split(':');
    const nodeId = rest && rest.includes('->') ? rest.split('->')[0] : rest || null;
    return projectById(projectId) ? { method: 'openProjectFlow', args: [projectId, nodeId] } : null;
  }
  return null;
}

async function ensureVisible(id) {
  const effective = effectiveId(id);
  const existing = resolveElement(effective);
  if (existing && targetIsVisible(existing)) {
    if (!inViewport(existing)) await scrollElement(existing);
    return true;
  }
  const navigation = navigationFor(id) || navigationFor(effective);
  if (navigation) {
    const method = app?.[navigation.method];
    if (typeof method === 'function') await method(...navigation.args);
  }
  await nextFrame();
  const candidate = resolveElement(effective);
  if (candidate) await scrollElement(candidate);
  const ok = await waitForTarget(effective, 2200);
  return ok;
}

async function scrollElement(element) {
  element.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  await nextFrame();
}

function waitForTarget(id, timeout = 2200) {
  const started = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const element = resolveElement(effectiveId(id));
      if (element && targetIsVisible(element)) return resolve(true);
      if (performance.now() - started >= timeout) return resolve(false);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function setCursor(id, label = '') {
  cursorId = id ? effectiveId(id) : null;
  cursorLabel = label || '';
  sync();
}

function clearFlowTraceClasses() {
  document.querySelectorAll('#projectFlow .ai-flow-trace').forEach((element) => element.classList.remove('ai-flow-trace'));
}

function clearHighlights() {
  clearFlowTraceClasses();
  for (const element of highlights.values()) {
    element.classList.remove('ai-highlight', 'ai-highlight--outline', 'ai-highlight--glow', 'ai-highlight--emphasis');
  }
  highlights.clear();
}

function clearSpotlight() {
  if (spotlightId) resolveElement(spotlightId)?.classList.remove('ai-spotlight-target');
  spotlightId = null;
  if (dom?.spotlight) dom.spotlight.hidden = true;
}

function clearHover() {
  if (hoverId) resolveElement(hoverId)?.classList.remove('ai-hover');
  hoverId = null;
  hideTooltip();
}

function clearConnectors() {
  if (!dom?.connectors) return;
  while (dom.connectors.firstChild) dom.connectors.removeChild(dom.connectors.firstChild);
  compareIds = [];
}

function removePulse() {
  pulseToken += 1;
  if (pulseFrame) cancelAnimationFrame(pulseFrame);
  pulseFrame = null;
  document.querySelectorAll('.ai-flow-pulse').forEach((node) => node.remove());
}

function clearZoom() {
  const canvas = document.querySelector('#projectFlow .pw-flow-canvas');
  if (canvas) {
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    canvas.classList.remove('ai-zoomed');
  }
  zoomState = null;
}

function cancelPending() {
  effectEpoch += 1;
  if (sequenceTimer) {
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }
  if (sequenceResolve) {
    const resolve = sequenceResolve;
    sequenceResolve = null;
    resolve({ ok: false, cancelled: true });
  }
  removePulse();
  hideTooltip();
}

function clearEffects() {
  effectEpoch += 1;
  clearHighlights();
  clearSpotlight();
  clearHover();
  clearConnectors();
  clearZoom();
  clearFlowTraceClasses();
  cursorId = null;
  cursorLabel = '';
  removePulse();
  if (dom?.cursor) dom.cursor.hidden = true;
  if (dom?.spotlight) dom.spotlight.hidden = true;
  if (dom?.connectors) dom.connectors.replaceChildren();
  sync();
}

function highlightTargets(ids, style = 'glow') {
  const valid = [];
  for (const id of ids) {
    const element = resolveElement(effectiveId(id));
    if (!element || !targetIsVisible(element)) continue;
    element.classList.add('ai-highlight', `ai-highlight--${style}`);
    highlights.set(id, element);
    valid.push(id);
  }
  if (valid.length) setCursor(valid[0]);
  scheduleSync();
  return valid;
}

async function applyHighlight(action) {
  const ids = action.targetIds || [action.targetId];
  if (!action.additive) clearHighlights();
  clearSpotlight();
  if (!action.sequence) {
    await ensureVisible(ids[0]);
    const applied = highlightTargets(ids, action.style);
    await nextFrame();
    sync();
    return applied.length ? { ok: true, targetIds: applied } : { ok: false, error: 'TARGET_NOT_RENDERED' };
  }
  const token = ++effectEpoch;
  for (const id of ids) {
    if (token !== effectEpoch) return { ok: false, cancelled: true };
    if (!(await ensureVisible(id))) continue;
    clearHighlights();
    highlightTargets([id], action.style);
    setCursor(id);
    await wait(clamp(Number(action.stepMs) || 650, 300, 3000)).catch(() => {});
  }
  return { ok: true, targetIds: ids };
}

async function applySpotlight(action) {
  if (!(await ensureVisible(action.targetId))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  clearHighlights();
  clearSpotlight();
  const element = resolveElement(effectiveId(action.targetId));
  if (!element) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  spotlightId = action.targetId;
  element.classList.add('ai-spotlight-target');
  if (dom?.spotlight) {
    dom.spotlight.hidden = false;
    dom.spotlight.dataset.dim = String(action.dim || 0.52);
  }
  setCursor(action.targetId);
  sync();
  return { ok: true, targetId: action.targetId };
}

function tooltipText(target) {
  return target?.description || target?.label || '';
}

function showTooltip(id, text = '') {
  if (!dom?.tooltip) return;
  const element = resolveElement(effectiveId(id));
  if (!element || !targetIsVisible(element)) return;
  tooltipId = id;
  dom.tooltip.textContent = text || tooltipText(getTarget(id)) || 'AI Nour';
  dom.tooltip.hidden = false;
  positionTooltip(element);
}

function hideTooltip() {
  tooltipId = null;
  if (dom?.tooltip) dom.tooltip.hidden = true;
}

function positionTooltip(element) {
  if (!dom?.tooltip || dom.tooltip.hidden) return;
  const rect = element.getBoundingClientRect();
  const tip = dom.tooltip.getBoundingClientRect();
  const left = clamp(rect.left + rect.width / 2 - tip.width / 2, 10, innerWidth - tip.width - 10);
  let top = rect.top - tip.height - 10;
  if (top < 10) top = rect.bottom + 10;
  dom.tooltip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

async function applyHover(action) {
  if (!(await ensureVisible(action.targetId))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  clearHover();
  const element = resolveElement(effectiveId(action.targetId));
  if (!element) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  hoverId = action.targetId;
  element.classList.add('ai-hover');
  setCursor(action.targetId);
  const target = buildTargets().find((item) => item.id === action.targetId);
  if (action.showTooltip !== false) {
    if (target?.kind === 'flow-node' && app?.showFlowNode) {
      await app.showFlowNode(target.project.id, target.nodeId);
    } else {
      showTooltip(action.targetId);
    }
  }
  return { ok: true, targetId: action.targetId };
}

async function applyExpand(action) {
  const target = buildTargets().find((item) => item.id === action.targetId);
  if (!target) return { ok: false, error: 'UNKNOWN_TARGET' };
  if (target.kind === 'project-card') {
    await app.openProject(target.project.id);
    return { ok: true, targetId: action.targetId };
  }
  if (target.kind === 'main-card') {
    const card = target.id.split(':')[1];
    await app.navigateTo(card === 'profile' ? 'me' : card);
    return { ok: true, targetId: action.targetId };
  }
  if (target.kind === 'flow-node') {
    await app.openProjectFlow(target.project.id, target.nodeId);
    await app.showFlowNode(target.project.id, target.nodeId);
    return { ok: true, targetId: action.targetId };
  }
  if (target.kind === 'journey-tab' || target.kind === 'journey-chapter') {
    await app.openJourneyChapter(target.chapter.id);
    return { ok: true, targetId: action.targetId };
  }
  if (target.kind === 'project') {
    await app.openProject(target.project.id);
    return { ok: true, targetId: action.targetId };
  }
  if (['project-overview', 'project-text', 'project-contribution', 'project-hero', 'project-tag', 'journey-chapter', 'journey-text', 'journey-chip'].includes(target.kind)) {
    if (!(await ensureVisible(action.targetId))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
    return { ok: true, targetId: action.targetId };
  }
  return { ok: false, error: 'NO_EXPANDED_STATE' };
}

async function applyCollapse(action) {
  const target = buildTargets().find((item) => item.id === action.targetId);
  if (!target) return { ok: false, error: 'UNKNOWN_TARGET' };
  if (target.kind === 'flow-node') {
    app.clearFlowNode?.();
    clearHover();
    return { ok: true, targetId: action.targetId };
  }
  if (target.kind === 'flow') {
    app.closeProjectFlow?.();
    clearEffects();
    return { ok: true, targetId: action.targetId };
  }
  return { ok: false, error: 'NO_COLLAPSED_STATE' };
}

function setSpotlightRect(element) {
  if (!dom?.spotlight || !spotlightId) return;
  if (!element || !targetIsVisible(element)) {
    dom.spotlight.hidden = true;
    return;
  }
  const rect = element.getBoundingClientRect();
  dom.spotlight.hidden = false;
  dom.spotlight.style.left = `${rect.left - 6}px`;
  dom.spotlight.style.top = `${rect.top - 6}px`;
  dom.spotlight.style.width = `${rect.width + 12}px`;
  dom.spotlight.style.height = `${rect.height + 12}px`;
  dom.spotlight.style.opacity = String(0.55 + (Number(dom.spotlight.dataset.dim) || 0.52) * 0.25);
}

function setCursorPosition(element) {
  if (!dom?.cursor) return;
  if (!element || !targetIsVisible(element)) {
    dom.cursor.hidden = true;
    return;
  }
  const rect = element.getBoundingClientRect();
  const x = clamp(rect.right - 3, 16, innerWidth - 16);
  const y = clamp(rect.top + Math.min(18, rect.height / 2), 16, innerHeight - 16);
  dom.cursor.hidden = false;
  dom.cursor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  dom.cursor.dataset.label = cursorLabel || 'AI Nour';
  const label = dom.cursor.querySelector('.ai-pres-cursor-label');
  if (label) label.textContent = cursorLabel || 'AI Nour';
}

function drawCompareConnector() {
  if (!dom?.connectors || compareIds.length !== 2) return;
  const a = resolveElement(effectiveId(compareIds[0]));
  const b = resolveElement(effectiveId(compareIds[1]));
  if (!a || !b || !targetIsVisible(a) || !targetIsVisible(b)) return;
  const ar = a.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(ar.left + ar.width / 2));
  line.setAttribute('y1', String(ar.top + ar.height / 2));
  line.setAttribute('x2', String(br.left + br.width / 2));
  line.setAttribute('y2', String(br.top + br.height / 2));
  line.setAttribute('class', 'ai-pres-compare-line');
  dom.connectors.appendChild(line);
}

async function applyCompare(action) {
  const ids = action.targetIds || [];
  if (ids.length !== 2) return { ok: false, error: 'TWO_TARGETS_REQUIRED' };
  for (const id of ids) if (!(await ensureVisible(id))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  clearEffects();
  compareIds = ids;
  highlightTargets(ids, 'emphasis');
  setCursor(ids[0]);
  if (dom?.connectors) dom.connectors.replaceChildren();
  drawCompareConnector();
  if (action.label) showTooltip(ids[0], action.label);
  return { ok: true, targetIds: ids };
}

function findFlowPath(projectId, from, to) {
  return document.querySelector(`#projectFlow .pw-flow-link[data-from="${from}"][data-to="${to}"]`);
}

function animatePathPulse(path) {
  if (!path || !path.parentNode) return;
  removePulse();
  const token = ++pulseToken;
  const length = path.getTotalLength();
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', '3.4');
  dot.setAttribute('class', 'ai-flow-pulse');
  path.parentNode.appendChild(dot);
  const start = performance.now();
  const tick = (now) => {
    if (token !== pulseToken || !dot.isConnected) return;
    const phase = ((now - start) % 1700) / 1700;
    const point = path.getPointAtLength(length * phase);
    dot.setAttribute('cx', String(point.x));
    dot.setAttribute('cy', String(point.y));
    pulseFrame = requestAnimationFrame(tick);
  };
  pulseFrame = requestAnimationFrame(tick);
}

async function applyTraceConnection(action) {
  if (!(await ensureVisible(`flow-node:${action.projectId}:${action.from}`))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  clearFlowTraceClasses();
  const linkId = `flow-link:${action.projectId}:${action.from}->${action.to}`;
  await waitForTarget(linkId, 900);
  const path = findFlowPath(action.projectId, action.from, action.to);
  if (!path) return { ok: false, error: 'UNKNOWN_CONNECTION' };
  clearHighlights();
  clearSpotlight();
  await ensureVisible(`flow-node:${action.projectId}:${action.to}`);
  highlightTargets([`flow-node:${action.projectId}:${action.from}`, `flow-node:${action.projectId}:${action.to}`, `flow-link:${action.projectId}:${action.from}->${action.to}`], 'glow');
  path.classList.add('ai-flow-trace');
  setCursor(`flow-node:${action.projectId}:${action.from}`);
  animatePathPulse(path);
  return { ok: true, projectId: action.projectId, from: action.from, to: action.to };
}

async function applyTraceWorkflow(action) {
  const project = projectById(action.projectId);
  if (!project?.flow) return { ok: false, error: 'UNKNOWN_PROJECT' };
  clearFlowTraceClasses();
  const first = action.nodeIds?.[0] || project.flow.nodes[0]?.id;
  if (first && !(await ensureVisible(`flow-node:${project.id}:${first}`))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  clearHighlights();
  clearSpotlight();
  const nodeIds = new Set(action.nodeIds?.length ? action.nodeIds : project.flow.nodes.map((node) => node.id));
  const links = project.flow.connections.filter((connection) => {
    if (action.mode === 'branch') return connection.kind === 'branch' || connection.kind === 'conditional' || connection.kind === 'shortcut';
    if (action.mode === 'all') return true;
    return nodeIds.has(connection.from) && nodeIds.has(connection.to);
  });
  const targets = [
    ...[...nodeIds].map((nodeId) => `flow-node:${project.id}:${nodeId}`),
    ...links.map((connection) => `flow-link:${project.id}:${connection.from}->${connection.to}`)
  ];
  highlightTargets(targets, action.mode === 'branch' ? 'emphasis' : 'glow');
  links.slice(0, 3).forEach((connection) => document.querySelector(`#projectFlow .pw-flow-link[data-from="${connection.from}"][data-to="${connection.to}"]`)?.classList.add('ai-flow-trace'));
  setCursor(`flow-node:${project.id}:${first}`);
  const firstLink = links[0] && findFlowPath(project.id, links[0].from, links[0].to);
  if (firstLink) animatePathPulse(firstLink);
  return { ok: true, projectId: project.id, mode: action.mode, nodes: [...nodeIds], links: links.length };
}

async function applyZoom(action) {
  const target = buildTargets().find((item) => item.id === action.targetId);
  if (!target || !['flow', 'flow-node', 'flow-link'].includes(target.kind)) return { ok: false, error: 'ZOOM_UNSUPPORTED' };
  if (!(await ensureVisible(action.targetId))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
  const canvas = document.querySelector('#projectFlow .pw-flow-canvas');
  const element = resolveElement(effectiveId(action.targetId));
  if (!canvas || !element) return { ok: false, error: 'ZOOM_UNSUPPORTED' };
  const canvasRect = canvas.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const originX = clamp(rect.left + rect.width / 2 - canvasRect.left, 0, canvasRect.width);
  const originY = clamp(rect.top + rect.height / 2 - canvasRect.top, 0, canvasRect.height);
  const scale = clamp(Number(action.scale) || 1.35, 1.1, 2);
  canvas.style.transformOrigin = `${originX}px ${originY}px`;
  canvas.style.transform = `scale(${scale})`;
  canvas.classList.add('ai-zoomed');
  zoomState = { scale, originX, originY };
  setCursor(action.targetId);
  scheduleSync();
  return { ok: true, targetId: action.targetId, scale };
}

function applyScroll(action) {
  return ensureVisible(action.targetId).then((ok) => ok ? { ok: true, targetId: action.targetId } : { ok: false, error: 'TARGET_NOT_RENDERED' });
}

function updateBar() {
  if (!dom?.bar) return;
  dom.bar.hidden = !presentation.active;
  dom.bar.classList.toggle('is-paused', presentation.paused);
  if (!presentation.active) return;
  const label = presentation.label || (presentation.projectId ? projectById(presentation.projectId)?.title : 'AI Nour');
  const progress = presentation.totalSteps
    ? `${Math.max(0, presentation.stepIndex)} / ${presentation.totalSteps}`
    : '';
  dom.bar.querySelector('.ai-pres-title').textContent = label || 'AI Nour';
  dom.bar.querySelector('.ai-pres-progress').textContent = progress;
  const pause = dom.bar.querySelector('[data-ai-pres="pause"]');
  const resume = dom.bar.querySelector('[data-ai-pres="resume"]');
  if (pause) pause.hidden = presentation.paused;
  if (resume) resume.hidden = !presentation.paused;
}

async function applyPresentation(action) {
  if (action.type === 'presentationStart' || action.type === 'presentationStep') {
    clearEffects();
    presentation = {
      active: true,
      paused: false,
      projectId: action.projectId || presentation.projectId || null,
      nodeId: action.nodeId || action.startNodeId || null,
      stepIndex: Number(action.stepIndex) || 0,
      totalSteps: Number(action.totalSteps) || 0,
      label: action.label || presentation.label || ''
    };
    updateBar();
    return { ok: true };
  }
  if (action.type === 'presentationPause') {
    presentation.paused = true;
    updateBar();
    return { ok: true, paused: true };
  }
  if (action.type === 'presentationResume') {
    presentation.paused = false;
    updateBar();
    return { ok: true, paused: false };
  }
  if (action.type === 'presentationEnd') {
    presentation = { active: false, paused: false, projectId: null, nodeId: null, stepIndex: 0, totalSteps: 0, label: '' };
    clearEffects();
    updateBar();
    return { ok: true };
  }
  return { ok: false, error: 'UNKNOWN_PRESENTATION_ACTION' };
}

async function applyAction(action) {
  ensureDom();
  if (!action || typeof action !== 'object') return { ok: false, error: 'INVALID_ACTION' };
  if (action.type.startsWith('presentation')) return applyPresentation(action);
  if (!['clearVisualEffects', 'resetZoom'].includes(action.type)) cancelPending();
  if (action.type === 'clearVisualEffects') { clearEffects(); return { ok: true }; }
  if (action.type === 'resetZoom') { clearZoom(); return { ok: true }; }
  if (action.type === 'highlightElement') return applyHighlight(action);
  if (action.type === 'spotlightElement') return applySpotlight(action);
  if (action.type === 'hoverElement') return applyHover(action);
  if (action.type === 'expandElement') return applyExpand(action);
  if (action.type === 'collapseElement') return applyCollapse(action);
  if (action.type === 'pointToElement') {
    if (!(await ensureVisible(action.targetId))) return { ok: false, error: 'TARGET_NOT_RENDERED' };
    setCursor(action.targetId, action.label || '');
    return { ok: true, targetId: action.targetId };
  }
  if (action.type === 'scrollToElement') return applyScroll(action);
  if (action.type === 'zoomToElement') return applyZoom(action);
  if (action.type === 'compareElements') return applyCompare(action);
  if (action.type === 'traceConnection') return applyTraceConnection(action);
  if (action.type === 'traceWorkflow') return applyTraceWorkflow(action);
  return { ok: false, error: 'UNSUPPORTED_ACTION' };
}

function scheduleSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = null;
    sync();
  });
}

function sync() {
  if (!dom) return;
  for (const [id, element] of highlights) {
    if (!element.isConnected) {
      const replacement = resolveElement(effectiveId(id));
      if (replacement) highlights.set(id, replacement);
      else highlights.delete(id);
    }
  }
  setSpotlightRect(spotlightId ? resolveElement(effectiveId(spotlightId)) : null);
  setCursorPosition(cursorId ? resolveElement(effectiveId(cursorId)) : null);
  if (tooltipId) {
    const element = resolveElement(effectiveId(tooltipId));
    if (element) positionTooltip(element); else hideTooltip();
  }
  if (compareIds.length === 2 && dom.connectors) {
    dom.connectors.replaceChildren();
    drawCompareConnector();
  }
}

function ensureDom() {
  if (dom) return dom;
  const layer = document.createElement('div');
  layer.className = 'ai-pres-layer';
  layer.innerHTML = `
    <div class="ai-pres-spotlight" aria-hidden="true" hidden></div>
    <svg class="ai-pres-connectors" aria-hidden="true"></svg>
    <div class="ai-pres-cursor" aria-hidden="true" hidden><span class="ai-pres-cursor-ring"></span><span class="ai-pres-cursor-dot"></span><span class="ai-pres-cursor-label">AI Nour</span></div>
    <div class="ai-pres-tooltip" role="status" aria-live="polite" hidden></div>
    <div class="ai-pres-bar" role="region" aria-label="AI Nour presentation controls" hidden>
      <span class="ai-pres-live" aria-hidden="true"></span>
      <span class="ai-pres-copy"><b>AI Nour</b><span class="ai-pres-title"></span></span>
      <span class="ai-pres-progress"></span>
      <span class="ai-pres-controls">
        <button type="button" data-ai-pres="prev" aria-label="Previous presentation step">‹</button>
        <button type="button" data-ai-pres="pause" aria-label="Pause presentation">Pause</button>
        <button type="button" data-ai-pres="resume" aria-label="Resume presentation" hidden>Resume</button>
        <button type="button" data-ai-pres="next" aria-label="Next presentation step">›</button>
        <button type="button" data-ai-pres="end" aria-label="End presentation">End</button>
      </span>
    </div>`;
  document.body.appendChild(layer);
  layer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ai-pres]');
    if (!button) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('ainour:presentation-control', { detail: { action: button.dataset.aiPres } }));
  });
  dom = {
    layer,
    spotlight: layer.querySelector('.ai-pres-spotlight'),
    connectors: layer.querySelector('.ai-pres-connectors'),
    cursor: layer.querySelector('.ai-pres-cursor'),
    tooltip: layer.querySelector('.ai-pres-tooltip'),
    bar: layer.querySelector('.ai-pres-bar')
  };
  const refresh = () => scheduleSync();
  addEventListener('scroll', refresh, { capture: true, passive: true });
  addEventListener('resize', refresh, { passive: true });
  document.addEventListener('transitionend', refresh, true);
  document.addEventListener('animationend', refresh, true);
  return dom;
}

export function createPresentationController(options = {}) {
  app = options;
  return {
    getTargets,
    getTarget,
    applyAction,
    cancelPending,
    clearEffects,
    waitForTarget,
    ensureVisible,
    getState: () => ({ presentation: { ...presentation }, effects: { highlights: [...highlights.keys()], spotlight: spotlightId, cursor: cursorId, compare: [...compareIds] } }),
    sync,
    isActive: () => presentation.active
  };
}
