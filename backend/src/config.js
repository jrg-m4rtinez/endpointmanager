function loadConfig(env = process.env) {
  const appBaseUrl = env.APP_BASE_URL || 'http://localhost:3000'
  const ddUrl = env.DD_URL || ''
  const ddKey = env.DD_API_KEY || ''
  return {
    pg: {
      host: env.PG_HOST,
      port: parseInt(env.PG_PORT || '5432', 10),
      user: env.PG_USER,
      password: env.PG_PASSWORD,
      database: env.PG_DATABASE,
    },
    appBaseUrl,
    sessionSecret: env.SESSION_SECRET,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    oidc: {
      issuer: env.OIDC_ISSUER,
      clientId: env.OIDC_CLIENT_ID,
      clientSecret: env.OIDC_CLIENT_SECRET,
    },
    dd: ddUrl && ddKey ? { url: ddUrl, apiKey: ddKey } : null,
    secureCookies: appBaseUrl.startsWith('https://'),
  }
}

const REQUIRED_VARS = [
  'PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DATABASE',
  'SESSION_SECRET', 'APP_BASE_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
]

// Falha rápida na subida: lança erro listando as variáveis obrigatórias ausentes.
// DD_* são opcionais (sem elas o app sobe sem integração com o DefectDojo).
function assertRequiredEnv(env = process.env) {
  const missing = REQUIRED_VARS.filter((k) => !env[k] || !String(env[k]).trim())
  if (missing.length) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}. Confira o .env (modelo em .env.example).`
    )
  }
}

module.exports = { loadConfig, assertRequiredEnv, REQUIRED_VARS }
