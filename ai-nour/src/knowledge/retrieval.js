import corpus from './corpus.json' with { type: 'json' };
import entities from './entities.json' with { type: 'json' };

const STOPWORDS = new Set(`
the a an and or of to in for on with as at by is are was were be been being this that these those
what which who whom how why where when i you he she it we they me my your his her our their do does did
can could should would will may might have has had from about into over after before more most other some
such no not only own same than too very just also if then there here
le la les un une des du de d l et ou en dans pour par sur avec sans au aux ce cette ces ceux celles
il elle ils elles je tu nous vous on mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs
est sont etait etaient ete etre avoir a ont avait avaient fait faire fais que qui quoi dont ou quand
comment pourquoi quel quelle quels quelles plus moins tres aussi mais donc car comme si
nour chkair
`.trim().split(/\s+/));

const ALIASES = {
  'parcours': ['journey', 'career', 'experience', 'profile:journey-intro'],
  'carriere': ['journey', 'career', 'profile:journey-intro'],
  'experience': ['journey', 'career', 'profile:work'],
  'experiences': ['journey', 'career', 'profile:work'],
  'projets': ['projects', 'project'],
  'projet': ['projects', 'project'],
  'ventes': ['sales', 'commercial'],
  'vente': ['sales', 'commercial'],
  'commercial': ['commercial', 'sales'],
  'commerce': ['commercial', 'sales'],
  'entreprise': ['business', 'commercial'],
  'entreprises': ['business', 'commercial'],
  'technologie': ['technology', 'profile:work'],
  'technologies': ['technology', 'profile:work'],
  'competences': ['capabilities', 'profile:work'],
  'competence': ['capabilities', 'profile:work'],
  'outils': ['tools', 'technology'],
  'outil': ['tools', 'technology'],
  'etudes': ['education', 'journey'],
  'etude': ['education', 'journey'],
  'universite': ['education', 'journey'],
  'diplome': ['education', 'journey'],
  'ecole': ['education', 'journey'],
  'ottawa': ['profile:intro', 'ottawa', 'location'],
  'contact': ['site:contact', 'contact'],
  'courriel': ['site:contact', 'contact', 'email'],
  'linkedin': ['site:contact', 'contact', 'linkedin'],
  'joindre': ['site:contact', 'contact'],
  'rendez-vous': ['site:contact', 'contact'],
  'reunion': ['site:contact', 'contact'],
  'reunions': ['site:contact', 'contact'],
  'consultation': ['profile:direction', 'site:contact', 'consulting'],
  'recrutement': ['profile:intro', 'site:contact', 'career'],
  'role': ['contribution', 'role'],
  'contribution': ['contribution', 'role'],
  'realisations': ['journey', 'milestone', 'projects'],
  'realisation': ['journey', 'milestone', 'projects'],
  'resultat': ['milestone', 'journey'],
  'resultats': ['milestone', 'journey'],
  'acquisition client': ['acquisition'],
  'acquisition de clients': ['acquisition'],
  'prospection': ['acquisition', 'sales'],
  'safiy': ['safiy'],
  'assistant contextuel': ['safiy'],
  'assistant ia': ['safiy', 'communications'],
  'connaissances': ['knowledge', 'knowledge:identity'],
  'connaissance': ['knowledge', 'knowledge:identity'],
  'memoire': ['knowledge'],
  'bibliotheque': ['knowledge'],
  'brain': ['knowledge'],
  'communications': ['communications'],
  'communication': ['communications'],
  'dispatch': ['h2ops'],
  'repartition': ['h2ops'],
  'livraison': ['h2ops'],
  'livraisons': ['h2ops'],
  'entrepreneur': ['h2ops'],
  'entrepreneurs': ['h2ops'],
  'contrat': ['h2ops'],
  'contrats': ['h2ops'],
  'voix': ['communications', 'voice'],
  'sms': ['communications'],
  'service client': ['communications'],
  'a propos': ['profile:intro'],
  'qui est': ['profile:intro'],
  'ou habite': ['profile:intro'],
  'ou est base': ['profile:intro', 'location'],
  'objectif': ['profile:direction', 'direction'],
  'ambition': ['profile:direction', 'direction'],
  'approche': ['profile:work'],
  'methode': ['profile:work'],
  'pense': ['profile:think'],
  'positioning': ['profile:positioning'],
  'positionnement': ['profile:positioning'],
  'proof': ['profile:positioning', 'milestone'],
  'preuve': ['profile:positioning', 'milestone'],
  'preuves': ['profile:positioning', 'milestone'],
  'tagline': ['journey:tagline', 'profile:positioning'],
  'business and technology': ['profile:work', 'profile:direction', 'profile:positioning'],
  'business and tech': ['profile:work', 'profile:direction', 'profile:positioning'],
  'commerce et technologie': ['profile:work', 'profile:direction', 'profile:positioning'],
  'affaires et technologie': ['profile:work', 'profile:direction', 'profile:positioning'],
  'accroche': ['journey:tagline', 'profile:positioning'],
  'reflechit': ['profile:think'],
  'hm': ['journey:entry:role:H&M', 'journey:sales:role:H&M', 'journey:entry', 'journey:sales'],
  'h m': ['journey:entry:role:H&M', 'journey:sales:role:H&M', 'journey:entry', 'journey:sales'],
  'first job': ['journey:entry'],
  'premier emploi': ['journey:entry'],
  'before working in tech': ['journey:entry', 'journey:sales', 'journey:commercial'],
  'before tech': ['journey:entry', 'journey:sales', 'journey:commercial'],
  'avant la technologie': ['journey:entry', 'journey:sales', 'journey:commercial'],
  'service visits': ['h2ops:identity', 'h2ops:what', 'h2ops:flow:confirm'],
  'scheduling service visits': ['h2ops:flow:confirm', 'h2ops:identity'],
  'rendez-vous de service': ['h2ops:flow:confirm', 'h2ops:identity'],
  'planification': ['h2ops:flow:confirm', 'h2ops:identity'],
  'etudie': ['journey:education', 'journey:education:role:University of Ottawa'],
  'a etudie': ['journey:education', 'journey:education:role:University of Ottawa'],
  'parcours client': ['acquisition:flow:intro', 'acquisition:flow:target', 'acquisition:flow:find'],
  'customer journey': ['acquisition:flow:intro', 'acquisition:flow:target', 'acquisition:flow:find'],
  'etapes': ['flow'],
  'etape': ['flow'],
  'reponses internes': ['knowledge:identity', 'knowledge:what', 'safiy:identity'],
  'reponse interne': ['knowledge:identity', 'knowledge:what', 'safiy:identity'],
  'internal answers': ['knowledge:identity', 'knowledge:what', 'safiy:identity'],
  'employes': ['knowledge:identity', 'knowledge:what', 'safiy:identity'],
  'employees': ['knowledge:identity', 'knowledge:what', 'safiy:identity'],
  'ventes de l equipe': ['journey:sales', 'journey:sales:milestone:team sales improvement'],
  'ventes equipe': ['journey:sales', 'journey:sales:milestone:team sales improvement'],
  'team sales': ['journey:sales', 'journey:sales:milestone:team sales improvement'],
  'ameliore': ['journey:sales', 'journey:sales:milestone:team sales improvement'],
  'ameliorer': ['journey:sales', 'journey:sales:milestone:team sales improvement']
};

const INTENTS = [
  { test: /\b(contact|email|courriel|linkedin|joindre|reach|rendez-vous|meeting)\b/i, boost: ['site:contact'] },
  { test: /\b(where|based|location|live|ottawa|où|ou habite|base)\b/i, boost: ['profile:intro'] },
  { test: /\b(study|school|university|degree|education|études|etudes|université|universite|diplôme|diplome)\b/i, boost: ['journey:education', 'journey:entry:role:Longfields-Davidson Heights Secondary School'] },
  { test: /\b(skill|capabilit|technology|technical|tool|compétence|competence|technologie|outil)\b/i, boost: ['profile:work', 'journey:technology'] },
  { test: /\b(contribution|role|what did he do|ce qu.il a fait|rôle|role)\b/i, boost: ['contribution'] },
  { test: /\b(career|journey|experience|parcours|carrière|carriere|expérience)\b/i, boost: ['journey', 'profile:journey-intro'] },
  { test: /\b(project|projects|projet|projets)\b/i, boost: ['project'] }
];

const PROJECT_ALIASES = {
  acquisition: ['acquisition', 'customer acquisition', 'acquisition client', 'prospection', 'sales intelligence'],
  h2ops: ['h2ops', 'dispatch', 'contractor supply', 'contractors', 'répartition', 'repartition'],
  communications: ['communications', 'communication', 'ai customer communications', 'voice', 'sms', 'voix'],
  knowledge: ['brain', 'b.r.a.i.n', 'knowledge', 'connaissances', 'memoire', 'mémoire'],
  safiy: ['safiy', 'contextual assistant', 'assistant contextuel', 'conversation capture']
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('eaux')) return `${word.slice(0, -1)}`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.length > 5 && word.endsWith('ement')) return word.slice(0, -4);
  return word;
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function prepareDoc(chunk) {
  const titleTokens = tokenize(chunk.title);
  const tagTokens = tokenize((chunk.tags || []).join(' '));
  const keywordTokens = tokenize((chunk.keywords || []).join(' '));
  const bodyTokens = tokenize(chunk.text);
  return {
    ...chunk,
    titleTokens,
    tagTokens,
    keywordTokens,
    bodyTokens,
    allTokens: [...titleTokens, ...tagTokens, ...keywordTokens, ...bodyTokens]
  };
}

const docs = corpus.chunks.map(prepareDoc);

const df = new Map();
for (const doc of docs) {
  for (const token of new Set(doc.allTokens)) df.set(token, (df.get(token) || 0) + 1);
}
const avgLength = docs.reduce((sum, doc) => sum + doc.allTokens.length, 0) / Math.max(1, docs.length);
const N = docs.length;
const K1 = 1.25;
const B = 0.72;

function expandQuery(query) {
  const normalized = normalize(query);
  const tokens = new Set(tokenize(query));
  const targets = new Set();
  for (const [alias, expansions] of Object.entries(ALIASES)) {
    if (normalized.includes(normalize(alias))) {
      for (const expansion of expansions) {
        if (expansion.includes(':')) targets.add(expansion);
        else {
          targets.add(expansion);
          for (const token of tokenize(expansion)) tokens.add(token);
        }
      }
    }
  }
  return { normalized, tokens: [...tokens], targets: [...targets] };
}

function fuzzyTokenScore(token, doc) {
  if (token.length < 5) return 0;
  let best = 0;
  for (const candidate of new Set(doc.allTokens)) {
    if (candidate.length < 4) continue;
    if (candidate.startsWith(token) || token.startsWith(candidate)) {
      best = Math.max(best, 0.7);
      continue;
    }
    if (Math.abs(candidate.length - token.length) <= 1 && levenshtein(token, candidate) <= 1) {
      best = Math.max(best, 0.5);
    }
  }
  return best;
}

function score(query, doc) {
  const { normalized, tokens, targets } = expandQuery(query);
  const frequencies = new Map();
  for (const token of doc.allTokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);

  let total = 0;
  for (const token of tokens) {
    const frequency = frequencies.get(token) || 0;
    if (frequency > 0) {
      const docFrequency = df.get(token) || 0;
      const idf = Math.log(1 + (N - docFrequency + 0.5) / (docFrequency + 0.5));
      total += idf * (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + B * doc.allTokens.length / avgLength));
    } else {
      total += fuzzyTokenScore(token, doc) * 1.2;
    }
  }

  for (const token of tokens) {
    if (doc.titleTokens.includes(token)) total += 1.8;
    if (doc.tagTokens.includes(token)) total += 1.1;
    if (doc.keywordTokens.includes(token)) total += 0.8;
  }

  for (const target of targets) {
    if (doc.id === target) total += 10;
    else if (doc.tags?.includes(target)) total += 5;
    else if (doc.type === target) total += 3;
  }

  for (const [projectId, aliases] of Object.entries(PROJECT_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalize(alias)))) {
      if (doc.id === `${projectId}:identity`) total += 9;
      else if (doc.tags?.includes(projectId)) total += 4;
    }
  }

  for (const intent of INTENTS) {
    if (!intent.test.test(normalized)) continue;
    for (const target of intent.boost) {
      if (doc.id === target) total += 6;
      else if (doc.tags?.includes(target)) total += 2.5;
    }
  }

  if (doc.type === 'project' && /\b(project|projects|projet|projets)\b/i.test(normalized)) total += 1.5;
  if (doc.type === 'journey' && /\b(career|journey|parcours|carrière|carriere)\b/i.test(normalized)) total += 1.5;
  if (/\b(parcours client|customer journey)\b/i.test(normalized) && doc.id.startsWith('acquisition:flow')) total += 20;

  return total;
}

export function search(query, { limit = 4, types, extraChunks = [] } = {}) {
  const normalized = normalize(query);
  if (!normalized) return [];
  const candidates = extraChunks.length
    ? [...extraChunks.map(prepareDoc), ...docs]
    : docs;
  return candidates
    .filter((doc) => !types || types.includes(doc.type))
    .map((doc) => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      text: doc.text,
      route: doc.route,
      tags: doc.tags,
      score: Number(score(query, doc).toFixed(4))
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildContext(query, { limit = 4, maxChars = 3200, extraChunks = [] } = {}) {
  const results = search(query, { limit, extraChunks });
  if (!results.length) return { text: '', results: [] };
  const lines = [];
  let used = 0;
  for (const result of results) {
    const block = `[${result.id}] ${result.title}\n${result.text}\nRoute: ${result.route || 'n/a'}`;
    if (used + block.length > maxChars) break;
    lines.push(block);
    used += block.length;
  }
  return { text: lines.join('\n\n'), results };
}

export function getChunkById(id) {
  const doc = docs.find((item) => item.id === id);
  if (!doc) return null;
  return {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    text: doc.text,
    route: doc.route,
    tags: doc.tags,
    keywords: doc.keywords || []
  };
}

export function getChunksByIds(ids = []) {
  return ids.map((id) => getChunkById(id)).filter(Boolean);
}

export function getEntities() {
  return entities;
}

export function getCorpusMeta() {
  return {
    version: corpus.version,
    contentHash: corpus.contentHash,
    generatedAt: corpus.generatedAt,
    chunks: corpus.chunks.length
  };
}

export function listChunks() {
  return corpus.chunks.map(({ id, type, title, route, tags }) => ({ id, type, title, route, tags }));
}

export { normalize, tokenize };
