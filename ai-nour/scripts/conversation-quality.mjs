import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const base = process.env.PHASE1_WORKER_URL || 'http://127.0.0.1:8789';
const key = env.PROTOTYPE_ACCESS_KEY;
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

const contexts = {
  home: { section: 'home', route: '/', view: 'portfolio' },
  about: { section: 'me', route: '/me', view: 'about' },
  projects: { section: 'projects', route: '/projects', view: 'portfolio' },
  acquisition: { section: 'projects', projectId: 'acquisition', projectView: 'overview', route: '/projects/acquisition', view: 'project' },
  acquisitionDemo: { section: 'projects', projectId: 'acquisition', projectView: 'flow', nodeId: 'demo', route: '/projects/acquisition/flow/demo', view: 'project' },
  h2ops: { section: 'projects', projectId: 'h2ops', projectView: 'overview', route: '/projects/h2ops', view: 'project' },
  communications: { section: 'projects', projectId: 'communications', projectView: 'overview', route: '/projects/communications', view: 'project' },
  safiy: { section: 'projects', projectId: 'safiy', projectView: 'overview', route: '/projects/safiy', view: 'project' }
};

const scenarios = [
  {
    name: 'recruiter-evaluation',
    description: 'Recruiter evaluating Nour for a commercial strategy role.',
    turns: [
      { message: 'I am hiring a commercial strategy lead for a SaaS company. Why should I consider Nour, and what proof would you show me?', context: contexts.about },
      { message: 'What would be the strongest example of him working across strategy and implementation?', context: contexts.projects }
    ],
    checks: [
      { name: 'role-appropriate proof', pattern: /\$400K|sales|commercial|strategy|H2Ops|project/i },
      { name: 'concrete evidence', pattern: /project|sales|coach|H2Ops|Customer Acquisition|Communications/i }
    ]
  },
  {
    name: 'ai-consulting-opportunity',
    description: 'Business owner with a commercial operations problem.',
    turns: [
      { message: 'My sales team wastes time on unqualified leads and our follow-up is inconsistent. Where would you start?', context: contexts.projects },
      { message: 'What would you actually build first, and how would you know it worked?', context: contexts.acquisition }
    ],
    checks: [
      { name: 'recommends relevant work', pattern: /Customer Acquisition|acquisition|pipeline|follow-up|qualification/i },
      { name: 'concrete first step', pattern: /target|qualif|follow-up|pilot|measure|test|pipeline/i }
    ]
  },
  {
    name: 'operational-problem',
    description: 'Business owner describing dispatch and service operations.',
    turns: [
      { message: 'We run a service business. Dispatch is manual, coverage is unclear, and customers get inconsistent updates. Which of Nour’s projects is most relevant?', context: contexts.projects },
      { message: 'Explain the operational logic step by step.', context: contexts.h2ops }
    ],
    checks: [
      { name: 'selects Dispatch', pattern: /Dispatch|H2Ops|coverage|contractor|scheduling/i },
      { name: 'connects steps', pattern: /request|assess|coverage|match|confirm|exception|operations/i }
    ]
  },
  {
    name: 'complete-portfolio-tour',
    description: 'Visitor asks for a guided tour.',
    turns: [
      { message: 'Give me a short guided tour of the work most relevant to a technical business owner. Choose the project for me.', context: contexts.projects },
      { message: 'What does that project show about how Nour works?', context: contexts.communications }
    ],
    checks: [
      { name: 'tour causes navigation', actions: true },
      { name: 'explains project value', pattern: /communication|voice|SMS|workflow|operations|AI/i }
    ]
  },
  {
    name: 'detailed-project-presentation',
    description: 'Detailed Customer Acquisition presentation and contribution.',
    turns: [
      { message: 'Present Customer Acquisition and explain the business problem without giving me a generic overview.', context: contexts.projects },
      { message: 'What did Nour personally build, and what was outside his scope?', context: contexts.acquisition }
    ],
    checks: [
      { name: 'presentation navigates', actions: true },
      { name: 'individual contribution', pattern: /Nour|target segments|qualification|follow-up|demo|inbox|booking/i },
      { name: 'scope boundary', pattern: /wider|scope|broader|outside|team|system|also included/i }
    ]
  },
  {
    name: 'technical-questions',
    description: 'Technical visitor asks about AI communications implementation.',
    turns: [
      { message: 'How did the AI voice and SMS workflows handle rescheduling, cancellations, and calendar availability?', context: contexts.communications },
      { message: 'What would you want a technical reviewer to inspect first?', context: contexts.communications }
    ],
    checks: [
      { name: 'grounded implementation', pattern: /voice|SMS|booking|reschedul|cancel|calendar|availability/i },
      { name: 'reviewer focus', pattern: /test|failure|retry|consent|calendar|edge|exception|logging/i }
    ]
  },
  {
    name: 'intellectual-discussion',
    description: 'Nuanced discussion about efficiency and imagination.',
    turns: [
      { message: 'Do you think the pressure for efficiency in AI products is making teams less imaginative? Give me a real argument, not a balanced non-answer.', context: contexts.home },
      { message: 'What is the strongest counterargument to your view?', context: contexts.home }
    ],
    checks: [
      { name: 'takes a position', pattern: /yes|no|I think|I'd argue|I would argue|counterargument|however/i },
      { name: 'nuance', pattern: /but|counter|trade-off|however|on the other hand|constraint|experiment/i }
    ]
  },
  {
    name: 'casual-humour',
    description: 'Casual conversation with situational humour.',
    turns: [
      { message: 'Be honest: what is the most overrated skill in business?', context: contexts.home },
      { message: 'That sounds personal. What is the most underrated one?', context: contexts.home }
    ],
    checks: [
      { name: 'has a point of view', pattern: /overrated|underrated|I think|I'd argue|most/i },
      { name: 'not corporate', pattern: /certainty|curiosity|listening|judgment|taste|follow-through/i }
    ]
  },
  {
    name: 'french-conversation',
    description: 'French discussion of contribution and relevance.',
    turns: [
      { message: 'Explique-moi la contribution de Nour sur Customer Acquisition, et pourquoi ce projet est pertinent pour une entreprise.', context: contexts.acquisition },
      { message: 'Et quelle est la limite de sa contribution personnelle ?', context: contexts.acquisition }
    ],
    checks: [
      { name: 'French response', pattern: /\b(je|nour|projet|entreprise|vente|acquisition|équipe|système|commercial)\b/i },
      { name: 'contribution boundary', pattern: /système|global|équipe|au-delà|scope|limite/i }
    ]
  },
  {
    name: 'ambiguous-current-page',
    description: 'Ambiguous reference to the current flow step.',
    turns: [
      { message: 'What is this, and how does it connect to the next step?', context: contexts.acquisitionDemo },
      { message: 'Why does that step matter commercially?', context: contexts.acquisitionDemo }
    ],
    checks: [
      { name: 'resolves current step', pattern: /demonstration|demo|personalized|prospect|value/i },
      { name: 'connects commercially', pattern: /outreach|follow-up|conversion|reply|booking|pipeline/i }
    ]
  },
  {
    name: 'incorrect-transcription',
    description: 'Garbled names and a possible M&A confusion.',
    turns: [
      { message: 'What did Noor do on Customer Aquisition? And how does that relate to mergers and acquisitions?', context: contexts.acquisition },
      { message: 'So is Customer Acquisition M&A?', context: contexts.acquisition }
    ],
    checks: [
      { name: 'corrects the confusion', pattern: /customer acquisition|sales|customers|not mergers|not M&A|rather than/i },
      { name: 'keeps individual contribution', pattern: /Nour|target|qualification|follow-up|demo|scope/i }
    ]
  },
  {
    name: 'contact-opportunity',
    description: 'Strong interest in a consulting conversation.',
    turns: [
      { message: 'I would like to talk to Nour about a consulting project. Can you help me get in touch?', context: contexts.projects },
      { message: 'What should I include when I reach out?', context: contexts.projects }
    ],
    checks: [
      { name: 'offers contact path', pattern: /contact|LinkedIn|email|reach out|conversation/i },
      { name: 'does not claim a booking', pattern: /not booked|no meeting|can't book|arrange|reach out|contact/i }
    ]
  },
  {
    name: 'customer-acquisition-regression',
    description: 'The previous beta regression: Customer Acquisition must not become M&A.',
    turns: [
      { message: 'Explain Customer Acquisition. I want to understand whether this is about buying companies.', context: contexts.acquisition },
      { message: 'Give me the one-sentence correction I should remember.', context: contexts.acquisition }
    ],
    checks: [
      { name: 'explicitly rejects M&A', pattern: /not (mergers|M&A)|isn't (mergers|M&A)|customer acquisition|sales acquisition/i },
      { name: 'stays on the actual project', pattern: /prospect|sales|target|outreach|pipeline|demo|follow-up/i }
    ]
  }
];

const banned = /unique combination|commercial acumen|driving business growth|synergy|leverage/i;
const markdown = /\*\*|^#{1,6}\s|^\|/m;
const turnDelayMs = Number(process.env.QUALITY_TURN_DELAY_MS || 4500);

async function chatWithRetry(headers, payload) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(base + '/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    if (response.status !== 429 && response.status !== 503) return { response, body };
    if (attempt === 4) return { response, body };
    await new Promise((resolve) => setTimeout(resolve, attempt * 9000));
  }
  throw new Error('unreachable');
}

const selectedScenarios = process.env.QUALITY_SCENARIOS
  ? scenarios.filter((scenario) => process.env.QUALITY_SCENARIOS.split(',').map((name) => name.trim()).includes(scenario.name))
  : scenarios;

for (const scenario of selectedScenarios) {
  const owner = `v2-quality-${scenario.name}-${crypto.randomUUID()}`;
  const headers = { 'x-prototype-key': key, 'x-owner-token': owner, 'content-type': 'application/json' };
  const sessionResponse = await fetch(base + '/api/session', { method: 'POST', headers, body: JSON.stringify({ locale: scenario.name === 'french-conversation' ? 'fr' : 'en' }) });
  const session = await sessionResponse.json();
  const sessionId = session.session?.id;
  const turns = [];
  for (const [index, turn] of scenario.turns.entries()) {
    const started = Date.now();
    const { response, body } = await chatWithRetry(headers, {
      sessionId,
      message: turn.message,
      locale: scenario.name === 'french-conversation' ? 'fr' : 'en',
      clientMessageId: `${scenario.name}-${index}-${crypto.randomUUID()}`,
      portfolioContext: turn.context
    });
    turns.push({
      message: turn.message,
      status: response.status,
      reply: body.reply || '',
      actions: body.actions || [],
      latencyMs: Date.now() - started,
      costUsdMicros: body.costUsdMicros || 0
    });
    if (index < scenario.turns.length - 1) await new Promise((resolve) => setTimeout(resolve, turnDelayMs));
  }
  const replies = turns.map((turn) => turn.reply);
  const allActions = turns.flatMap((turn) => turn.actions || []);
  const checks = [];
  for (const spec of scenario.checks) {
    if (spec.actions) checks.push({ name: spec.name, pass: allActions.length > 0 });
    else checks.push({ name: spec.name, pass: new RegExp(spec.pattern.source, spec.pattern.flags.replace('g', '')).test(replies.join('\n')) });
  }
  checks.push({ name: 'no corporate filler', pass: !replies.some((reply) => banned.test(reply)) });
  checks.push({ name: 'plain-text formatting', pass: !replies.some((reply) => markdown.test(reply)) });
  checks.push({ name: 'not overly terse', pass: replies.every((reply) => reply.length >= 80) });
  checks.push({ name: 'not every turn ends in a question', pass: replies.filter((reply) => reply.trim().endsWith('?')).length < replies.length });
  checks.push({ name: 'no repeated opening', pass: new Set(replies.map((reply) => reply.slice(0, 60))).size === replies.length });
  const passed = checks.filter((item) => item.pass).length;
  const record = {
    name: scenario.name,
    description: scenario.description,
    sessionId,
    turns,
    actions: allActions,
    checks,
    passed,
    total: checks.length,
    score: Number((passed / checks.length).toFixed(3)),
    latencyMs: turns.reduce((sum, turn) => sum + turn.latencyMs, 0),
    costUsdMicros: turns.reduce((sum, turn) => sum + turn.costUsdMicros, 0)
  };
  results.push(record);
  console.log(JSON.stringify({ name: record.name, score: record.score, failed: checks.filter((item) => !item.pass).map((item) => item.name), reply: replies.at(-1)?.slice(0, 500) }, null, 2));
}

const output = {
  generatedAt: new Date().toISOString(),
  base,
  scenarios: results.length,
  passedScenarios: results.filter((item) => item.passed === item.total).length,
  averageScore: Number((results.reduce((sum, item) => sum + item.score, 0) / Math.max(1, results.length)).toFixed(3)),
  totalCostUsdMicros: results.reduce((sum, item) => sum + item.costUsdMicros, 0),
  totalLatencyMs: results.reduce((sum, item) => sum + item.latencyMs, 0),
  results
};
fs.writeFileSync(path.join(root, process.env.QUALITY_RESULT_FILE || 'results/v2-conversation-quality.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  scenarios: output.scenarios,
  passedScenarios: output.passedScenarios,
  averageScore: output.averageScore,
  totalCostUsdMicros: output.totalCostUsdMicros,
  failed: results.flatMap((item) => item.checks.filter((check) => !check.pass).map((check) => `${item.name}:${check.name}`))
}, null, 2));
if (results.some((item) => item.score < 0.8)) process.exitCode = 1;
