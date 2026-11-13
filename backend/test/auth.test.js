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
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'nome', 'papel'])
  })

  it('BOOTSTRAP_ADMIN_EMAIL vira admin, sem diferenciar caixa', async () => {
    const agent = await setup({ bootstrapAdminEmail: 'admin@lab.local' })
    await loginAs(agent, { sub: 'a1', email: 'Admin@Lab.Local', name: 'A' })
    expect((await agent.get('/auth/me')).body.papel).toBe('admin')
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
