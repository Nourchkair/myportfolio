import { ProviderError } from '../errors.js';

function isFrench(text) {
  return (
    /\b(bonjour|salut|merci|projet|parcours|compétence|competence|où|comment|pourquoi|je|vous|parle-moi|présente)\b/i.test(text)
      && !/\b(the|what|how|where|project|about|contact)\b/i.test(text)
  ) || /\b(qui|es-tu|êtes-vous|que signifie|qu['’]est-ce|tes|ton|ta|peux-tu|guide-moi|présente-moi|au nom|signifie)\b/i.test(text);
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

    if (/guide me through|walk me through|tour of the portfolio|guide-moi|présente-moi le portfolio|fais-moi visiter/i.test(text)) {
      return {
        text: '',
        parts: [{ functionCall: { name: 'presentProject', args: { projectId: 'acquisition', includeFlow: true, startNodeId: 'demo' } } }],
        toolCalls: [{ id: null, name: 'presentProject', args: { projectId: 'acquisition', includeFlow: true, startNodeId: 'demo' } }],
        usage: { prompt: 100, output: 16, total: 116, promptText: 100, promptAudio: 0, outputAudio: 0 },
        finishReason: 'STOP',
        model
      };
    }

    if (/introduce yourself briefly as nupa|présente-toi brièvement comme nupa/i.test(text)) {
      const reply = french
        ? 'Bonjour, je suis Nupa, votre guide interactif dans le portfolio de Nour. Je peux vous guider dans son travail, vous présenter ses projets, répondre à vos questions ou simplement discuter. Par où voulez-vous commencer ?'
        : "Hey, I'm Nupa, your interactive guide to Nour's portfolio. I can show you around, walk you through his projects, answer questions or simply have a conversation. Where should we start?";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
    }

    if (/are you nour|es-tu nour|êtes-vous nour|tu es nour/i.test(text)) {
      const reply = french
        ? 'Non, je suis Nupa. Je suis un assistant IA conçu pour vous aider à explorer et comprendre le travail de Nour. Je connais bien son portfolio, mais je ne suis pas lui.'
        : "No, I'm Nupa. I'm an AI assistant designed to help you explore and understand Nour's work. I know his portfolio well, but I'm not him.";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
    }

    if (/who are you|qui es-tu|qui êtes-vous|what are you|qu['’]est-ce que tu es/i.test(text)) {
      const reply = french
        ? 'Je suis Nupa, Nour’s Unique Portfolio Assistant. Je suis un guide IA indépendant qui connaît bien son travail; je ne suis pas Nour. Je peux vous faire visiter le portfolio ou répondre à vos questions.'
        : "I'm Nupa, Nour's Unique Portfolio Assistant. I'm an independent AI guide who knows his work well; I'm not Nour. I can walk you through the portfolio or answer questions.";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
    }

    if (/what does nupa mean|what does nupa stand for|que signifie nupa|nupa (?:c['’]est|signifie) quoi/i.test(text)) {
      const reply = french
        ? 'NUPA signifie Nour’s Unique Portfolio Assistant. Je suis là pour rendre l’exploration de son travail un peu plus interactive, personnelle et agréable.'
        : "NUPA stands for Nour's Unique Portfolio Assistant. I'm here to make exploring his work a little more interactive, personal and enjoyable.";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
    }

    if (/do your opinions|opinions? (?:represent|reflect)|tes opinions|vos opinions|représentent.*nour|convictions de nour/i.test(text)) {
      const reply = french
        ? 'Non. Mes opinions et conclusions m’appartiennent. Elles ne représentent pas les convictions documentées de Nour; considérez-les comme un point de vue indépendant, pas comme ses vues.'
        : "No. My opinions and conclusions are my own. They aren't Nour's documented beliefs; treat them as an independent perspective, not as his views.";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
    }

    if (/decisions? on nour|on nour['’]?s behalf|au nom de nour|engager nour|décisions? pour nour/i.test(text)) {
      const reply = french
        ? 'Non. Je ne peux pas engager Nour, signer ou négocier en son nom, ni prendre d’engagements professionnels pour lui. Je peux vous aider à comprendre son travail et à communiquer avec lui.'
        : "No. I can't bind Nour, sign or negotiate for him, or make professional commitments on his behalf. I can help you understand his work and connect with him.";
      return { text: reply, parts: [{ text: reply }], toolCalls: [], usage: { prompt: 80, output: 40, total: 120, promptText: 80, promptAudio: 0, outputAudio: 0 }, finishReason: 'STOP', model };
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
        ? 'Je suis Nupa. Je peux vous parler du parcours de Nour, de ses projets et de sa façon de travailler.'
        : "I'm Nupa. I can walk you through Nour's background, projects, and approach.";
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

  return { name: 'mock', model, generate };
}
