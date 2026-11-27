import { ProviderError } from '../errors.js';

function isFrench(text) {
  return /\b(bonjour|salut|merci|projet|parcours|compétence|competence|où|comment|pourquoi|je|vous|nour)\b/i.test(text)
    && !/\b(the|what|how|where|project|about|contact)\b/i.test(text);
}

export function createMockTextProvider({ model = 'mock-text' } = {}) {
  async function generate({ contents = [] }) {
    const lastUser = [...contents].reverse().find((message) => message.role === 'user');
    const text = lastUser?.parts?.map((part) => part.text || '').join(' ') || '';
    const french = isFrench(text);
    const hasFunctionResponse = contents.some((message) => message.parts?.some((part) => part.functionResponse));
    if (text.includes('__FAIL_PROVIDER__')) {
      throw new ProviderError('MOCK_PROVIDER_FAILURE', 'Synthetic provider failure', { status: 503, retryable: false });
    }

    if (hasFunctionResponse) {
      return {
        text: french ? 'La démonstration visuelle est prête. Je vous explique l’étape en cours.' : 'The visual demonstration is ready. I’ll explain the current step.',
        parts: [{ text: french ? 'La démonstration visuelle est prête. Je vous explique l’étape en cours.' : 'The visual demonstration is ready. I’ll explain the current step.' }],
        toolCalls: [],
        usage: { prompt: 40, output: 18, total: 58, promptText: 40, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/highlight|survol|mets en évidence|mettre en évidence/i.test(text) && /acquisition/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'highlightElement', args: { targetId: 'project-card:acquisition', style: 'glow' } } }],
        toolCalls: [{ id: null, name: 'highlightElement', args: { targetId: 'project-card:acquisition', style: 'glow' } }],
        usage: { prompt: 90, output: 14, total: 104, promptText: 90, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/present|présente|walk|parcours|tour|guide/i.test(text) && /acquisition/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'presentProject', args: { projectId: 'acquisition', includeFlow: true, startNodeId: 'demo' } } }],
        toolCalls: [{ id: null, name: 'presentProject', args: { projectId: 'acquisition', includeFlow: true, startNodeId: 'demo' } }],
        usage: { prompt: 100, output: 16, total: 116, promptText: 100, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/trace|tracez|workflow|flux|process/i.test(text) && /acquisition/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'traceWorkflow', args: { projectId: 'acquisition', mode: 'sequence' } } }],
        toolCalls: [{ id: null, name: 'traceWorkflow', args: { projectId: 'acquisition', mode: 'sequence' } }],
        usage: { prompt: 100, output: 14, total: 114, promptText: 100, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/compare|comparer|difference|différence/i.test(text) && /demo/i.test(text) && /outreach|outreach|prospection/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'compareElements', args: { targetIds: ['flow-node:acquisition:demo', 'flow-node:acquisition:outreach'], label: 'Demo to outreach' } } }],
        toolCalls: [{ id: null, name: 'compareElements', args: { targetIds: ['flow-node:acquisition:demo', 'flow-node:acquisition:outreach'], label: 'Demo to outreach' } }],
        usage: { prompt: 100, output: 14, total: 114, promptText: 100, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/open|ouvre|montre|show/i.test(text) && /safiy/i.test(text) && !/openProject|function/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'openProject', args: { projectId: 'safiy' } } }],
        toolCalls: [{ id: null, name: 'openProject', args: { projectId: 'safiy' } }],
        usage: { prompt: 80, output: 12, total: 92, promptText: 80, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    let reply;
    if (/contact|courriel|linkedin|joindre/i.test(text)) {
      reply = french
        ? 'Le meilleur canal pour joindre Nour est LinkedIn. Les détails de contact sont sur la page Contact du portfolio.'
        : "LinkedIn is the best way to reach Nour; the portfolio's Contact page has the details.";
    } else if (/h&m|h & m|retail|détail|detail/i.test(text)) {
      reply = french
        ? 'Nour a commencé chez H&M en 2022, puis est devenu Sales Coach. Il y a appris le service client, la vente et le coaching d’équipe.'
        : 'Nour started at H&M in 2022 and later became a Sales Coach, learning customer service, sales, and team coaching.';
    } else if (/safiy/i.test(text)) {
      reply = french
        ? 'Safiy est un assistant IA contextuel qui capture les conversations et les connaissances en milieu de travail.'
        : 'Safiy is a contextual AI assistant that captures conversations and workplace knowledge.';
    } else {
      reply = french
        ? 'Je suis AI Nour. Je peux vous parler du parcours de Nour, de ses projets et de sa façon de travailler.'
        : "I'm AI Nour. I can walk you through Nour's background, projects, and approach.";
    }

    return {
      text: reply,
      parts: [{ text: reply }],
      toolCalls: [],
      usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 },
      finishReason: 'STOP',
      model
    };
  }

  async function research({ query }) {
    return {
      text: `Synthetic researched summary for: ${String(query || '').slice(0, 120)}`,
      parts: [],
      toolCalls: [],
      sources: [{ title: 'Synthetic source', url: 'https://example.invalid/research' }],
      researched: true,
      usage: { prompt: 60, output: 30, total: 90, promptText: 60, promptAudio: 0, outputAudio: 0 },
      finishReason: 'STOP',
      model
    };
  }

  return { name: 'mock', model, generate, research };
}
