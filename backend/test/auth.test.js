import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { buildTestApp, loginAs } from './helpers/app'
import { requireAuth, requireRole } from '../src/auth/guards'

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})
async function setup(opts) {
  ctx = await buildTestApp(opts)
  return request.agent(ctx.app)
}

describe('auth', () => {
  it('GET /auth/me sem sessão → 401', async () => {
    const agent = await setup()
    const res = await agent.get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'nao_autenticado' })
  })

  it('GET /auth/login redireciona para o provedor', async () => {
    const agent = await setup()
    const res = await agent.get('/auth/login')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('idp.fake')
  })

  it('primeiro login cria usuário pendente e não vaza tokens', async () => {
    const agent = await setup()
    const cb = await loginAs(agent, { sub: 'u1', email: 'novo@lab.local', name: 'Novo' })
    expect(cb.status).toBe(302)
    expect(cb.headers.location).toBe('http://localhost:3000/')
    const res = await agent.get('/auth/me')
    expect(res.body).toMatchObject({ email: 'novo@lab.local', papel: 'pendente' })
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'nome', 'origem', 'papel', 'trocarSenha'])
    expect(res.body).toMatchObject({ origem: 'sso', trocarSenha: false })
  })

  it('BOOTSTRAP_ADMIN_EMAIL vira admin, sem diferenciar caixa', async () => {
    const agent = await setup({ bootstrapAdminEmail: 'admin@lab.local' })
    await loginAs(agent, { sub: 'a1', email: 'Admin@Lab.Local', name: 'A' })
    expect((await agent.get('/auth/me')).body.papel).toBe('admin')
  })

  it('bootstrap rebaixado continua rebaixado se já existe outro admin', async () => {
    const agent = await setup({ bootstrapAdminEmail: 'admin@lab.local' })
    await loginAs(agent, { sub: 'a1', email: 'admin@lab.local', name: 'A' })
    await loginAs(agent, { sub: 'u2', email: 'outro@lab.local', name: 'O' })
    await ctx.pool.query("UPDATE usuario SET papel='admin' WHERE sub='u2'")
    await ctx.pool.query("UPDATE usuario SET papel='leitor' WHERE sub='a1'")
    await loginAs(agent, { sub: 'a1', email: 'admin@lab.local', name: 'A' })
    expect((await agent.get('/auth/me')).body.papel).toBe('leitor')
  })

  it('outro sub com o e-mail de bootstrap não vira admin se já existe admin', async () => {
    const agent = await setup({ bootstrapAdminEmail: 'admin@lab.local' })
    await loginAs(agent, { sub: 'a1', email: 'admin@lab.local', name: 'A' })
    await loginAs(agent, { sub: 'evil', email: 'ADMIN@lab.local', name: 'E' })
    expect((await agent.get('/auth/me')).body.papel).toBe('pendente')
    const { rows } = await ctx.pool.query("SELECT sub FROM usuario WHERE papel='admin'")
    expect(rows.map((r) => r.sub)).toEqual(['a1'])
  })

  it('segundo login atualiza nome/email e mantém papel', async () => {
    const agent = await setup()
    await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    await ctx.pool.query("UPDATE usuario SET papel='leitor' WHERE sub='u1'")
    await loginAs(agent, { sub: 'u1', email: 'b@lab.local', name: 'B' })
    expect((await agent.get('/auth/me')).body).toMatchObject({ email: 'b@lab.local', nome: 'B', papel: 'leitor' })
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM usuario')
    expect(rows[0].n).toBe(1)
  })

  it('mudança de papel vale na hora', async () => {
    const agent = await setup()
    await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    await ctx.pool.query("UPDATE usuario SET papel='admin' WHERE sub='u1'")
    expect((await agent.get('/auth/me')).body.papel).toBe('admin')
  })

  it('callback com erro do provedor → 302 para /?erro=login e sem sessão', async () => {
    const agent = await setup()
    await agent.get('/auth/login')
    const res = await agent.get('/auth/callback?error=access_denied')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/?erro=login')
    expect((await agent.get('/auth/me')).status).toBe(401)
  })

  it('POST /auth/logout sem X-Requested-With → 403', async () => {
    const agent = await setup()
    await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    const res = await agent.post('/auth/logout')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'csrf' })
  })

  it('POST /auth/logout → sessão some (me → 401)', async () => {
    const agent = await setup()
    await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    const res = await agent.post('/auth/logout').set('X-Requested-With', 'XMLHttpRequest')
    expect(res.status).toBe(200)
    expect(res.body.redirect).toContain('id_token_hint=idt-u1')
    expect((await agent.get('/auth/me')).status).toBe(401)
  })

  it('cookie de sessão é httpOnly e SameSite=Lax', async () => {
    const agent = await setup()
    const res = await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('em.sid='))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })
})

describe('cookie em produção (APP_BASE_URL https)', () => {
  const PROD = { appBaseUrl: 'https://em.exemplo.com' }
  const sid = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('em.sid='))

  it('com X-Forwarded-Proto: https → Set-Cookie com Secure', async () => {
    await setup(PROD)
    // O cookie jar do supertest não reenvia cookie Secure por http: repassa à mão.
    const l = await request(ctx.app).get('/auth/login').set('X-Forwarded-Proto', 'https')
    expect(sid(l)).toMatch(/;\s*Secure/i)
    const qs = new URLSearchParams({ sub: 'u1', email: 'a@lab.local', name: 'A' }).toString()
    const res = await request(ctx.app)
      .get(`/auth/callback?${qs}`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sid(l).split(';')[0])
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://em.exemplo.com/')
    expect(sid(res)).toBeTruthy()
    expect(sid(res)).toMatch(/;\s*Secure/i)
  })

  it('sem X-Forwarded-Proto → nenhum cookie de sessão', async () => {
    const agent = await setup(PROD)
    const l = await agent.get('/auth/login')
    expect(l.status).toBe(302)
    expect(sid(l)).toBeUndefined()
    const res = await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    expect(sid(res)).toBeUndefined()
  })
})

describe('guards', () => {
  it('requireRole: pendente → aguardando_liberacao, leitor em rota admin → sem_permissao', async () => {
    const agent = await setup()
    const r = express.Router()
    r.use(requireAuth, requireRole('admin'))
    r.get('/x', (req, res) => res.json({ ok: true }))
    ctx.app.use('/t', r)
    await loginAs(agent, { sub: 'u1', email: 'a@lab.local', name: 'A' })
    let res = await agent.get('/t/x')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'aguardando_liberacao' })
    await ctx.pool.query("UPDATE usuario SET papel='leitor'")
    res = await agent.get('/t/x')
    expect(res.body).toEqual({ error: 'sem_permissao' })
    await ctx.pool.query("UPDATE usuario SET papel='admin'")
    expect((await agent.get('/t/x')).status).toBe(200)
  })
})
