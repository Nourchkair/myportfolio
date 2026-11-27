function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createGmailAdapter({ auth }) {
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me';

  async function createDraft({ to, subject, text, html = null }) {
    const boundary = `ainour_${Date.now()}`;
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : 'Content-Type: text/plain; charset=UTF-8',
      '',
      ''
    ];
    let body;
    if (html) {
      body = [
        ...headers,
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        text,
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        '',
        html,
        `--${boundary}--`,
        ''
      ].join('\r\n');
    } else {
      body = [...headers, text, ''].join('\r\n');
    }
    const raw = base64UrlEncode(new TextEncoder().encode(body));
    const data = await auth.json(`${base}/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { raw } })
    });
    return { id: data.id, messageId: data.message?.id || null, threadId: data.message?.threadId || null };
  }

  async function getDraft(id) {
    return auth.json(`${base}/drafts/${encodeURIComponent(id)}?format=metadata`);
  }

  async function deleteDraft(id) {
    const response = await auth.request(`${base}/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return response.status === 204 || response.status === 200;
  }

  async function listDrafts(maxResults = 10) {
    const data = await auth.json(`${base}/drafts?maxResults=${maxResults}`);
    return data.drafts || [];
  }

  async function draftRoundTripTest() {
    const draft = await createDraft({
      to: 'synthetic@example.invalid',
      subject: 'Nupa synthetic draft — delete me',
      text: 'Synthetic Phase 1 draft. No send.'
    });
    try {
      const read = await getDraft(draft.id);
      return {
        created: Boolean(draft.id),
        read: Boolean(read.id),
        cleanedUp: await deleteDraft(draft.id)
      };
    } catch (error) {
      await deleteDraft(draft.id).catch(() => false);
      throw error;
    }
  }

  return { createDraft, getDraft, deleteDraft, listDrafts, draftRoundTripTest };
}
