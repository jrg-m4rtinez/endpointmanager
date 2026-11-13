// Adaptador OIDC real (openid-client v6). Contrato igual ao de test/helpers/fakeOidc.js:
//   startLogin(session) -> Promise<url>, guarda state/PKCE na sessão;
//   finishLogin(session, currentUrl) -> Promise<{ sub, email, name, idToken }>;
//   logoutUrl(idToken) -> string | null.
const client = require('openid-client')

async function createOidc(config) {
  const { issuer, clientId, clientSecret } = config.oidc
  const base = String(config.appBaseUrl).replace(/\/+$/, '')
  const redirectUri = base + '/api/auth/callback'
  const options = issuer.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined
  const cfg = await client.discovery(new URL(issuer), clientId, clientSecret, undefined, options)

  return {
    async startLogin(session) {
      const codeVerifier = client.randomPKCECodeVerifier()
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
      const state = client.randomState()
      session.oidc = { codeVerifier, state }
      await new Promise((resolve, reject) => session.save((err) => (err ? reject(err) : resolve())))
      return client.buildAuthorizationUrl(cfg, {
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      }).href
    },

    async finishLogin(session, currentUrl) {
      const pending = session.oidc
      if (!pending) throw new Error('estado de login ausente na sessão')
      delete session.oidc
      const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: pending.state,
      })
      const claims = tokens.claims()
      return { sub: claims.sub, email: emailFromClaims(claims), name: claims.name ?? null, idToken: tokens.id_token }
    },

    logoutUrl(idToken) {
      if (!idToken || !cfg.serverMetadata().end_session_endpoint) return null
      return client.buildEndSessionUrl(cfg, {
        id_token_hint: idToken,
        post_logout_redirect_uri: base + '/',
      }).href
    },
  }
}

// Admin bootstrap é concedido só pelo e-mail (D2): e-mail explicitamente não verificado não conta.
// Ausência de email_verified (Entra ID) é aceita.
function emailFromClaims(claims) {
  if (claims.email_verified === false) return null
  return claims.email ?? claims.preferred_username ?? null
}

module.exports = { createOidc, emailFromClaims }
