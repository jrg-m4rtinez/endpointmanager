// Adaptador OIDC falso: os claims vêm da query do callback.
export function createFakeOidc() {
  return {
    async startLogin(session) {
      session.oidcState = 'fake-state'
      return 'http://idp.fake/authorize?state=fake-state'
    },
    async finishLogin(session, currentUrl) {
      const q = currentUrl.searchParams
      if (q.get('error')) throw new Error(`provedor: ${q.get('error')}`)
      if (!session.oidcState) throw new Error('estado ausente')
      delete session.oidcState
      return { sub: q.get('sub'), email: q.get('email'), name: q.get('name'), idToken: `idt-${q.get('sub')}` }
    },
    logoutUrl(idToken) {
      return idToken ? `http://idp.fake/logout?id_token_hint=${idToken}` : null
    },
  }
}
