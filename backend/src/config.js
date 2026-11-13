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

module.exports = { loadConfig }
