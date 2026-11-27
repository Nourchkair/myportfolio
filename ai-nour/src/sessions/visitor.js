const TYPE_SIGNALS = {
  recruiter: /\b(recruit(?:er|ing|ment)?|hiring|hire|candidate|role|position|opening|job|resume|cv|talent|interview)\b/i,
  business_owner: /\b(business owner|founder|company|my business|our business|operations|operational|customers?|revenue|sales team|agency|firm|clinic|store|restaurant|logistics)\b/i,
  technical: /\b(engineer|developer|technical|architecture|api|code|implementation|stack|model|llm|rag|integration|deploy|database|agent)\b/i,
  collaborator: /\b(collaborat|partner|partnership|co-?found|build together|work together|freelance|consulting)\b/i
};

const INDUSTRY_TERMS = [
  ['technology', /\b(tech|software|saas|ai|artificial intelligence|platform|developer|data)\b/i],
  ['sales', /\b(sales|revenue|business development|lead gen|prospecting)\b/i],
  ['real estate', /\b(real estate|property|broker|realtor)\b/i],
  ['insurance', /\b(insurance|underwriting|claims)\b/i],
  ['logistics', /\b(logistics|dispatch|delivery|fleet|transport)\b/i],
  ['healthcare', /\b(health|healthcare|clinic|medical|patient)\b/i],
  ['finance', /\b(finance|financial|bank|capital|investment)\b/i],
  ['retail', /\b(retail|store|e-?commerce|merchandising)\b/i],
  ['consulting', /\b(consulting|consultant|advisory)\b/i],
  ['education', /\b(education|university|college|school|student)\b/i],
  ['government', /\b(government|public sector|policy|political)\b/i]
];

const INTEREST_TERMS = {
  acquisition: /\b(customer acquisition|lead generation|prospecting|outreach|sales pipeline)\b/i,
  h2ops: /\b(dispatch|service operations|scheduling|contractor|coverage|logistics)\b/i,
  communications: /\b(customer communications|voice agent|sms|reactivation|inbox|support)\b/i,
  knowledge: /\b(knowledge base|documentation|rag|retrieval|organizational memory|brain)\b/i,
  safiy: /\b(safiy|meeting|contextual assistant|workplace assistant|transcription)\b/i,
  ai: /\b(ai|artificial intelligence|machine learning|agents?|automation|llm)\b/i,
  strategy: /\b(strategy|commercial|business model|go-to-market|growth)\b/i,
  economics: /\b(economics|incentives|markets|trade-?offs)\b/i,
  politics: /\b(politics|political science|policy|institutions|government)\b/i,
  philosophy: /\b(philosophy|ethics|meaning|epistemology)\b/i,
  psychology: /\b(psychology|behaviou?r|motivation|decision-?making)\b/i,
  leadership: /\b(leadership|management|coaching|team)\b/i,
  entrepreneurship: /\b(entrepreneur|startup|founder|build a company)\b/i
};

const UNSAFE_TEXT = /\b(ignore\s+(all\s+|any\s+)?previous|system prompt|instructions?|developer mode|jailbreak|reveal|api key|secret|password|sendemail|exfiltrate|\.dev\.vars|override|call the tool|tool call)\b/i;

function safeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text && !UNSAFE_TEXT.test(text) ? text : '';
}

function unique(values, limit = 8) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function clean(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function extractRole(text) {
  const patterns = [
    /(?:hiring|hire)(?:\s+(?:for|a|an))?\s+([^.,;!?]{2,70})/i,
    /(?:role|position|opening)\s+(?:is|for|of)\s+([^.,;!?]{2,70})/i,
    /(?:looking for|need)\s+(?:a|an)\s+([^.,;!?]{2,70})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return clean(match[1], 70);
  }
  return '';
}

function extractGoals(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(looking for|want to|need to|need a|help with|trying to|explore|evaluate|learn|hire|build|improve|understand)\b/i.test(sentence))
    .map((sentence) => safeText(clean(sentence, 180)))
    .slice(0, 3);
}

function extractChallenges(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(problem|challenge|struggle|hard|slow|expensive|manual|messy|friction|bottleneck|waste|miss|inconsistent)\b/i.test(sentence))
    .map((sentence) => safeText(clean(sentence, 180)))
    .slice(0, 3);
}

export function emptyVisitorProfile() {
  return {
    primaryType: 'unknown',
    typeScores: { recruiter: 0, business_owner: 0, technical: 0, collaborator: 0 },
    role: '',
    industry: '',
    technicalFamiliarity: 'unknown',
    interests: [],
    depth: 'unknown',
    goals: [],
    challenges: [],
    notes: [],
    locale: 'en',
    turnsObserved: 0,
    updatedAt: 0
  };
}

export function updateVisitorProfile(current = null, { userText = '', assistantText = '', context = null, locale = 'en', now = Date.now() } = {}) {
  const profile = { ...emptyVisitorProfile(), ...(current || {}) };
  const text = `${userText}\n${assistantText}`.trim();
  if (!userText.trim()) return profile;

  profile.typeScores = { ...emptyVisitorProfile().typeScores, ...(profile.typeScores || {}) };
  const typeText = userText.replace(/\b(not technical|non-?technical|don't know code|do not code)\b/gi, ' ');
  for (const [type, pattern] of Object.entries(TYPE_SIGNALS)) {
    if (pattern.test(typeText)) profile.typeScores[type] = Number(profile.typeScores[type] || 0) + 1;
  }
  const ranked = Object.entries(profile.typeScores).sort((a, b) => b[1] - a[1]);
  const previousType = current?.primaryType;
  if (ranked[0]?.[1] > 0) {
    if (previousType && previousType !== 'unknown' && profile.typeScores[previousType] > 0
      && ranked[0][0] !== previousType && ranked[0][1] - profile.typeScores[previousType] < 2) {
      profile.primaryType = previousType;
    } else {
      profile.primaryType = ranked[0][0];
    }
  }

  const role = safeText(extractRole(userText));
  if (role) profile.role = role;

  for (const [industry, pattern] of INDUSTRY_TERMS) {
    if (pattern.test(userText)) { profile.industry = industry; break; }
  }

  const interests = Object.entries(INTEREST_TERMS).filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
  profile.interests = unique([...(profile.interests || []), ...interests], 10);

  if (/\b(not technical|non-?technical|don't know code|do not code)\b/i.test(userText)) profile.technicalFamiliarity = 'low';
  else if (/\b(technical|engineer|developer|api|architecture|code|stack|implementation|llm|rag)\b/i.test(userText)) profile.technicalFamiliarity = 'high';

  if (/\b(brief|short|quick|tldr|one sentence|concise)\b/i.test(userText)) profile.depth = 'concise';
  else if (/\b(detail|detailed|deep|dive|thorough|explain fully|longer)\b/i.test(userText)) profile.depth = 'deep';

  profile.goals = unique([...(profile.goals || []), ...extractGoals(userText)], 4);
  profile.challenges = unique([...(profile.challenges || []), ...extractChallenges(userText)], 4);
  if (userText.length > 40 && safeText(userText)) profile.notes = unique([...(profile.notes || []), safeText(clean(userText, 180))], 4);
  profile.locale = locale === 'fr' ? 'fr' : (locale === 'en' ? 'en' : profile.locale || 'en');
  profile.turnsObserved = Number(profile.turnsObserved || 0) + 1;
  profile.updatedAt = now;
  if (context?.section) profile.lastSection = context.section;
  if (context?.projectId) profile.lastProjectId = context.projectId;
  return profile;
}

export function visitorPrompt(profile) {
  if (!profile || profile.primaryType === 'unknown' && !profile.role && !profile.interests?.length) return '';
  const parts = [];
  if (profile.primaryType && profile.primaryType !== 'unknown') parts.push(`likely visitor type: ${profile.primaryType.replace('_', ' ')}`);
  if (profile.role) parts.push(`role/context they mentioned: ${profile.role}`);
  if (profile.industry) parts.push(`industry: ${profile.industry}`);
  if (profile.technicalFamiliarity !== 'unknown') parts.push(`technical familiarity: ${profile.technicalFamiliarity}`);
  if (profile.depth !== 'unknown') parts.push(`preferred depth: ${profile.depth}`);
  if (profile.interests?.length) parts.push(`interests: ${profile.interests.join(', ')}`);
  const goals = (profile.goals || []).map(safeText).filter(Boolean);
  const challenges = (profile.challenges || []).map(safeText).filter(Boolean);
  if (goals.length) parts.push(`stated goals: ${goals.join(' | ')}`);
  if (challenges.length) parts.push(`stated challenges: ${challenges.join(' | ')}`);
  if (!parts.length) return '';
  return `VISITOR PROFILE (inferred; use silently to tailor examples, depth and recommendations; never announce or over-assume it):\n${parts.join('\n')}`;
}
