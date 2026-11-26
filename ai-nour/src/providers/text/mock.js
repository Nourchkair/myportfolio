function isFrench(text) {
  return /\b(bonjour|salut|merci|projet|parcours|compétence|competence|où|comment|pourquoi|je|vous|nour)\b/i.test(text)
    && !/\b(the|what|how|where|project|about|contact)\b/i.test(text);
}

export function createMockTextProvider({ model = 'mock-text' } = {}) {
  async function generate({ contents = [] }) {
    const lastUser = [...contents].reverse().find((message) => message.role === 'user');
    const text = lastUser?.parts?.map((part) => part.text || '').join(' ') || '';
    const french = isFrench(text);

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

  return { name: 'mock', model, generate };
}
