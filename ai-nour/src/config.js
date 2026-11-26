const DEFAULTS = {
  appEnv: 'development',
  textProvider: 'gemini',
  liveProvider: 'gemini',
  textModel: 'gemini-flash-lite-latest',
  liveModel: 'gemini-3.8-live',
  liveVoice: 'Aoede',
  dailyCapUsdMicros: 1_000_000,
  cumulativeCapUsdMicros: 7_000_000,
  textInputPerMillion: 0.10,
  textOutputPerMillion: 0.40,
  liveTextInputPerMillion: 0.75,
  liveAudioInputPerMillion: 3.00,
  liveAudioOutputPerMillion: 12.00,
  rateLimitWindowSeconds: 600,
  chatRateLimit: 30,
  liveRateLimit: 12,
  maxMessageChars: 2000,
  maxHistoryMessages: 16,
  summaryTriggerMessages: 20,
  sessionTtlMs: 7 * 86_400_000,
  adminEnabled: true
};

function number(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function bool(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export function loadConfig(env = {}) {
  const config = {
    appEnv: env.APP_ENV || DEFAULTS.appEnv,
    version: 'phase3-0.3.0',
    prototypeAccessKey: env.PROTOTYPE_ACCESS_KEY || '',
    adminToken: env.ADMIN_TOKEN || '',
    adminEnabled: bool(env, 'ADMIN_ENABLED', DEFAULTS.adminEnabled),
    crmWritesEnabled: bool(env, 'ENABLE_CRM_WRITES', false),
    allowedOrigins: String(env.ALLOWED_ORIGINS || 'http://localhost:8768,http://127.0.0.1:8768,http://localhost:8771,http://127.0.0.1:8771,http://localhost:8789,http://127.0.0.1:8789').split(',').map((origin) => origin.trim()).filter(Boolean),
    textProvider: env.TEXT_PROVIDER || DEFAULTS.textProvider,
    liveProvider: env.LIVE_PROVIDER || DEFAULTS.liveProvider,
    textModel: env.TEXT_MODEL || env.GEMINI_TEXT_MODEL || DEFAULTS.textModel,
    liveModel: env.LIVE_MODEL || env.GEMINI_LIVE_MODEL || DEFAULTS.liveModel,
    liveVoice: env.LIVE_VOICE || DEFAULTS.liveVoice,
    gemini: {
      apiKey: env.GEMINI_API_KEY || '',
      baseUrl: env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com'
    },
    email: {
      provider: env.EMAIL_PROVIDER || 'resend',
      sendEnabled: bool(env, 'EMAIL_SEND_ENABLED', false),
      resendApiKey: env.RESEND_API_KEY || '',
      resendFrom: env.RESEND_FROM || '',
      internalTo: env.EMAIL_INTERNAL_TO || env.ADMIN_EMAIL || '',
      webhookSecret: env.RESEND_WEBHOOK_SECRET || '',
      maxAttempts: number(env, 'EMAIL_MAX_ATTEMPTS', 5),
      retryBaseMs: number(env, 'EMAIL_RETRY_BASE_SECONDS', 60) * 1000
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      refreshToken: env.GOOGLE_REFRESH_TOKEN || '',
      spreadsheetId: env.GOOGLE_CRM_SPREADSHEET_ID || '',
      calendarId: env.GOOGLE_CALENDAR_ID || '',
      knowledgeFolderId: env.GOOGLE_KNOWLEDGE_FOLDER_ID || '',
      backupFolderId: env.GOOGLE_BACKUP_FOLDER_ID || '',
      backupKey: env.BACKUP_ENCRYPTION_KEY || '',
      allowSyntheticWrites: bool(env, 'ALLOW_SYNTHETIC_WRITES', false)
    },
    caps: {
      dailyUsdMicros: number(env, 'DAILY_SPEND_CAP_USD_MICROS', DEFAULTS.dailyCapUsdMicros),
      cumulativeUsdMicros: number(env, 'CUMULATIVE_SPEND_CAP_USD_MICROS', DEFAULTS.cumulativeCapUsdMicros)
    },
    rates: {
      textInputPerMillion: number(env, 'TEXT_INPUT_USD_PER_MILLION', DEFAULTS.textInputPerMillion),
      textOutputPerMillion: number(env, 'TEXT_OUTPUT_USD_PER_MILLION', DEFAULTS.textOutputPerMillion),
      liveTextInputPerMillion: number(env, 'LIVE_TEXT_INPUT_USD_PER_MILLION', DEFAULTS.liveTextInputPerMillion),
      liveAudioInputPerMillion: number(env, 'LIVE_AUDIO_INPUT_USD_PER_MILLION', DEFAULTS.liveAudioInputPerMillion),
      liveAudioOutputPerMillion: number(env, 'LIVE_AUDIO_OUTPUT_USD_PER_MILLION', DEFAULTS.liveAudioOutputPerMillion)
    },
    limits: {
      rateLimitWindowMs: number(env, 'RATE_LIMIT_WINDOW_SECONDS', DEFAULTS.rateLimitWindowSeconds) * 1000,
      chatRateLimit: number(env, 'CHAT_RATE_LIMIT', DEFAULTS.chatRateLimit),
      liveRateLimit: number(env, 'LIVE_RATE_LIMIT', DEFAULTS.liveRateLimit),
      maxMessageChars: number(env, 'MAX_MESSAGE_CHARS', DEFAULTS.maxMessageChars),
      maxHistoryMessages: number(env, 'MAX_HISTORY_MESSAGES', DEFAULTS.maxHistoryMessages),
      summaryTriggerMessages: number(env, 'SUMMARY_TRIGGER_MESSAGES', DEFAULTS.summaryTriggerMessages),
      liveTokenReservationUsdMicros: number(env, 'LIVE_TOKEN_RESERVATION_USD_MICROS', 80_000),
      liveTokenTtlSeconds: number(env, 'LIVE_TOKEN_TTL_SECONDS', 120),
      liveTokenNewSessionTtlSeconds: number(env, 'LIVE_TOKEN_NEW_SESSION_TTL_SECONDS', 60),
      liveTokenHoldMs: number(env, 'LIVE_TOKEN_HOLD_SECONDS', 900) * 1000,
      maxLiveTokensPerDay: number(env, 'MAX_LIVE_TOKENS_PER_DAY', 12),
      sessionTtlMs: number(env, 'SESSION_TTL_HOURS', 168) * 3_600_000
    }
  };

  const missing = [];
  if (!config.prototypeAccessKey) missing.push('PROTOTYPE_ACCESS_KEY');
  if (config.adminEnabled && !config.adminToken) missing.push('ADMIN_TOKEN');
  if (config.textProvider === 'gemini' && !config.gemini.apiKey) missing.push('GEMINI_API_KEY');
  if (config.liveProvider === 'gemini' && !config.gemini.apiKey) missing.push('GEMINI_API_KEY');
  if (missing.length) {
    throw new Error(`Missing required Phase 1 configuration: ${[...new Set(missing)].join(', ')}`);
  }

  if (!config.google.clientId) config.google.configured = false;
  else config.google.configured = Boolean(config.google.clientSecret && config.google.refreshToken);

  return Object.freeze(config);
}
