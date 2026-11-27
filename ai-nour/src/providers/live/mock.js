export function createMockLiveProvider({ model = 'mock-live' } = {}) {
  async function mintToken() {
    return {
      token: `mock-live-token-${crypto.randomUUID()}`,
      model,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      newSessionExpiresAt: new Date(Date.now() + 120_000).toISOString()
    };
  }
  return { name: 'mock', model, mintToken };
}
