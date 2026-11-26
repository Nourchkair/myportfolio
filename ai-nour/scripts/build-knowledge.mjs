import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../../src/data/projects.js';
import { PROFESSIONAL_TAGLINE, PROFESSIONAL_CHAPTERS, PROFESSIONAL_INTRO } from '../../src/data/journey.js';
import { PROFILE_POSITIONING, PROFILE_INTERSECTION, PROFILE_PROOF, ABOUT_ME_INTRO, ABOUT_ME_THINK, ABOUT_ME_WORK, ABOUT_ME_DIRECTION } from '../../src/data/profile.js';
import { SITE } from '../../src/data/site.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../src/knowledge');
fs.mkdirSync(outDir, { recursive: true });

const chunks = [];
const add = (chunk) => {
  if (!chunk.text || !String(chunk.text).trim()) return;
  chunks.push({
    id: chunk.id,
    type: chunk.type,
    title: chunk.title,
    text: String(chunk.text).replace(/\s+/g, ' ').trim(),
    route: chunk.route || '',
    tags: [...new Set(chunk.tags || [])].filter(Boolean),
    keywords: [...new Set(chunk.keywords || [])].filter(Boolean)
  });
};
const arr = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const projectFrench = {
  acquisition: ['acquisition client', 'prospection', 'ventes', 'automatisation', 'revenus'],
  h2ops: ['dispatch', 'repartition', 'entrepreneurs', 'livraison', 'contrats'],
  communications: ['communications clients', 'voix', 'sms', 'service client', 'automatisation'],
  knowledge: ['brain', 'connaissances', 'memoire', 'bibliotheque', 'recherche'],
  safiy: ['assistant contextuel', 'conversations', 'connaissances', 'reunions', 'assistant ia']
};

for (const project of PROJECTS) {
  const baseTags = [project.id, project.project, project.category, ...project.capabilities, ...(projectFrench[project.id] || [])];
  add({
    id: `${project.id}:identity`,
    type: 'project',
    title: `${project.title} — ${project.project}`,
    text: [project.title, project.project, project.category, project.description, ...project.capabilities].join(' '),
    route: `/projects/${project.id}`,
    tags: baseTags,
    keywords: [project.title, project.project, project.id, ...(projectFrench[project.id] || [])]
  });
  add({
    id: `${project.id}:what`,
    type: 'project',
    title: `${project.title} — what it is`,
    text: arr(project.overview?.whatItIs).join(' '),
    route: `/projects/${project.id}`,
    tags: ['project', project.id, 'overview'],
    keywords: projectFrench[project.id] || []
  });
  add({
    id: `${project.id}:challenges`,
    type: 'project',
    title: `${project.title} — challenges`,
    text: arr(project.overview?.challenges).join(' '),
    route: `/projects/${project.id}`,
    tags: ['project', project.id, 'challenges'],
    keywords: ['probleme', 'defi', 'challenge', ...(projectFrench[project.id] || [])]
  });
  add({
    id: `${project.id}:value`,
    type: 'project',
    title: `${project.title} — value`,
    text: arr(project.overview?.value).join(' '),
    route: `/projects/${project.id}`,
    tags: ['project', project.id, 'value'],
    keywords: ['valeur', 'benefice', 'impact', ...(projectFrench[project.id] || [])]
  });
  const contribution = project.overview?.contribution;
  if (contribution) {
    add({
      id: `${project.id}:contribution`,
      type: 'project',
      title: `${project.title} — contribution`,
      text: [contribution.lead, ...(contribution.blocks || []).map((block) => `${block.label}: ${block.text}`)].join(' '),
      route: `/projects/${project.id}`,
      tags: ['project', project.id, 'contribution', 'role'],
      keywords: ['role', 'contribution', 'ce que nour a fait', ...(projectFrench[project.id] || [])]
    });
  }
  if (project.flow?.intro) {
    add({
      id: `${project.id}:flow:intro`,
      type: 'flow',
      title: `${project.title} — process overview`,
      text: project.flow.intro,
      route: `/projects/${project.id}/flow`,
      tags: ['project', project.id, 'flow', 'process'],
      keywords: ['processus', 'etapes', 'fonctionnement', ...(projectFrench[project.id] || [])]
    });
  }
  for (const node of project.flow?.nodes || []) {
    add({
      id: `${project.id}:flow:${node.id}`,
      type: 'flow',
      title: `${project.title} — ${node.title}`,
      text: [node.title, node.visible, node.explanation].join(' '),
      route: `/projects/${project.id}/flow/${node.id}`,
      tags: ['project', project.id, 'flow', node.id],
      keywords: ['etape', 'processus', node.title, ...(projectFrench[project.id] || [])]
    });
  }
}

for (const chapter of PROFESSIONAL_CHAPTERS) {
  add({
    id: `journey:${chapter.id}`,
    type: 'journey',
    title: `${chapter.title} — ${chapter.label}`,
    text: [chapter.title, chapter.label, chapter.period, ...arr(chapter.paragraphs), chapter.direction, ...arr(chapter.capabilities), ...arr(chapter.details)].join(' '),
    route: `/journey/${chapter.id}`,
    tags: ['journey', 'career', chapter.id, chapter.label, ...arr(chapter.capabilities)],
    keywords: ['parcours', 'carriere', 'experience', 'etudes', chapter.title, chapter.label]
  });
  for (const role of chapter.roles || []) {
    add({
      id: `journey:${chapter.id}:role:${role.org}`,
      type: 'journey',
      title: `${chapter.title} — ${role.org}`,
      text: [role.org, role.role, role.period].join(' '),
      route: `/journey/${chapter.id}`,
      tags: ['journey', 'career', 'role', chapter.id, role.org],
      keywords: ['parcours', 'emploi', 'role', 'experience', role.org]
    });
  }
  for (const milestone of chapter.milestones || []) {
    add({
      id: `journey:${chapter.id}:milestone:${milestone.label}`,
      type: 'journey',
      title: `${chapter.title} — ${milestone.label}`,
      text: `${milestone.value} ${milestone.label}`,
      route: `/journey/${chapter.id}`,
      tags: ['journey', 'career', chapter.id, 'milestone'],
      keywords: ['realisation', 'resultat', 'chiffre', milestone.label]
    });
  }
}

add({
  id: 'profile:positioning',
  type: 'profile',
  title: 'Positioning and proof',
  text: [PROFILE_POSITIONING, PROFILE_INTERSECTION, PROFILE_PROOF].join(' '),
  route: '/me',
  tags: ['profile', 'positioning', 'proof', 'strategy', 'sales', 'applied ai', 'commercial'],
  keywords: ['positionnement', 'proposition', 'preuve', 'resultats', 'ventes', 'strategie', 'ia appliquee']
});
add({
  id: 'journey:tagline',
  type: 'journey',
  title: 'Career through-line',
  text: PROFESSIONAL_TAGLINE,
  route: '/journey',
  tags: ['journey', 'career', 'tagline', 'through-line'],
  keywords: ['parcours', 'carriere', 'fil conducteur', 'accroche']
});
add({
  id: 'profile:intro',
  type: 'profile',
  title: 'About Nour',
  text: arr(ABOUT_ME_INTRO).join(' '),
  route: '/me',
  tags: ['profile', 'about', 'background', 'ottawa', 'location', 'intro'],
  keywords: ['a propos', 'profil', 'qui est nour', 'ou habite', 'ottawa', 'parcours']
});
add({
  id: 'profile:think',
  type: 'profile',
  title: 'How Nour thinks',
  text: arr(ABOUT_ME_THINK).join(' '),
  route: '/me',
  tags: ['profile', 'thinking', 'curiosity'],
  keywords: ['pense', 'reflechit', 'curiosite', 'approche']
});
add({
  id: 'profile:work',
  type: 'profile',
  title: 'How Nour works',
  text: arr(ABOUT_ME_WORK).join(' '),
  route: '/me',
  tags: ['profile', 'work', 'capabilities', 'technology', 'approach'],
  keywords: ['travaille', 'competences', 'technologie', 'approche', 'methode']
});
add({
  id: 'profile:direction',
  type: 'profile',
  title: 'Nour direction',
  text: arr(ABOUT_ME_DIRECTION).join(' '),
  route: '/me',
  tags: ['profile', 'direction', 'ambition', 'consulting'],
  keywords: ['ambition', 'objectif', 'consultation', 'direction', 'carriere']
});
add({
  id: 'profile:journey-intro',
  type: 'profile',
  title: 'Career introduction',
  text: arr(PROFESSIONAL_INTRO).join(' '),
  route: '/journey',
  tags: ['profile', 'journey', 'career', 'intro'],
  keywords: ['parcours', 'carriere', 'introduction']
});
add({
  id: 'site:contact',
  type: 'contact',
  title: 'Contact',
  text: [SITE.contactIntro, SITE.contactNote, SITE.linkedin, SITE.github].join(' '),
  route: '/contact',
  tags: ['contact', 'email', 'linkedin', 'github', 'reach'],
  keywords: ['contact', 'courriel', 'linkedin', 'joindre', 'rendez-vous', 'consultation']
});

const entities = {
  generatedAt: new Date().toISOString(),
  sections: ['home', 'me', 'journey', 'projects', 'contact'],
  projects: PROJECTS.map((project) => ({
    id: project.id,
    title: project.title,
    project: project.project,
    route: `/projects/${project.id}`,
    flowNodes: (project.flow?.nodes || []).map((node) => node.id)
  })),
  chapters: PROFESSIONAL_CHAPTERS.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    label: chapter.label,
    route: `/journey/${chapter.id}`
  }))
};

const version = 1;
const hash = crypto.createHash('sha256').update(JSON.stringify({ version, chunks })).digest('hex').slice(0, 16);
const corpus = {
  generatedAt: new Date().toISOString(),
  source: 'src/data/{projects,journey,profile,site}.js',
  version,
  contentHash: hash,
  chunks
};

fs.writeFileSync(path.join(outDir, 'corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'entities.json'), JSON.stringify({ ...entities, contentHash: hash }, null, 2) + '\n');
console.log(JSON.stringify({ chunks: chunks.length, types: [...new Set(chunks.map((c) => c.type))], contentHash: hash }, null, 2));
