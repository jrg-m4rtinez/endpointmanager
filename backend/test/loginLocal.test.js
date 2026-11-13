import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import { buildTestApp, loginAs } from './helpers/app'
import { loadConfig } from '../src/config'
import { hashSenha, verificarSenha, gerarSenhaTemporaria, validarNovaSenha } from '../src/auth/senha'

const XHR = { 'X-Requested-With': 'XMLHttpRequest' }
const SENHA = 'senha-correta-123'

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})
async function setup(opts) {
  ctx = await buildTestApp(opts)
  return request.agent(ctx.app)
}

async function criarLocal(pool, { email, senha = SENHA, nome = 'Local', papel = 'leitor', trocar = false }) {
  const { rows } = await pool.query(
    `INSERT INTO usuario (sub, email, nome, papel, origem, senha_hash, trocar_senha)
     VALUES ($1, $2, $3, $4, 'local', $5, $6) RETURNING id`,
    ['local:' + email.toLowerCase(), email, nome, papel, await hashSenha(senha), trocar]
  )
  return rows[0].id
}

function login(agent, email, senha) {
  return agent.post('/auth/local/login').set(XHR).send({ email, senha })
}

function trocar(agent, senhaAtual, novaSenha) {
  return agent.post('/auth/local/senha').set(XHR).send({ senhaAtual, novaSenha })
}

function sid(res) {
  const c = (res.headers['set-cookie'] || []).find((x) => x.startsWith('em.sid='))
  return c && c.split(';')[0]
}

describe('config LOGIN_LOCAL', () => {
  it('ausente ou ligado → true; desligado → false; outro → erro pt-BR', () => {
    expect(loadConfig({}).loginLocal).toBe(true)
    expect(loadConfig({ LOGIN_LOCAL: 'ligado' }).loginLocal).toBe(true)
    expect(loadConfig({ LOGIN_LOCAL: 'desligado' }).loginLocal).toBe(false)
    expect(() => loadConfig({ LOGIN_LOCAL: 'talvez' })).toThrow(/LOGIN_LOCAL/)
    expect(() => loadConfig({ LOGIN_LOCAL: 'talvez' })).toThrow(/ligado.*desligado/)
  })
})

describe('senha.js', () => {
  it('gerarSenhaTemporaria: 16 chars, só do alfabeto permitido; hash nunca igual ao texto', async () => {
    const vistas = new Set()
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaTemporaria()
      expect(s).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{16}$/)
      vistas.add(s)
    }
    expect(vistas.size).toBe(200)
    const s = gerarSenhaTemporaria()
    const h = await hashSenha(s)
    expect(h).not.toBe(s)
    expect(h).not.toContain(s)
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verificarSenha(h, s)).toBe(true)
    expect(await verificarSenha(h, s + 'x')).toBe(false)
    expect(await verificarSenha('lixo', s)).toBe(false)
  })

  it('validarNovaSenha: < 12 → mensagem; >= 12 → null', () => {
    expect(validarNovaSenha('curta')).toMatch(/12/)
    expect(validarNovaSenha(undefined)).toEqual(expect.any(String))
    expect(validarNovaSenha('a'.repeat(12))).toBeNull()
  })
})

describe('login local', () => {
  it('GET /auth/config → { local: true } por padrão; desligado → false e /auth/local/login 404', async () => {
    let agent = await setup()
    expect((await agent.get('/auth/config')).body).toEqual({ local: true })
    await ctx.drop()
    agent = await setup({ loginLocal: 'desligado' })
    const cfg = await agent.get('/auth/config')
    expect(cfg.status).toBe(200)
    expect(cfg.body).toEqual({ local: false })
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    expect((await login(agent, 'ana@x.com', SENHA)).status).toBe(404)
    expect((await trocar(agent, SENHA, 'outra-senha-longa')).status).toBe(404)
  })

  it('login local certo → 200 { trocarSenha }, sessão criada, /auth/me traz origem "local"', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com', nome: 'Ana' })
    const res = await login(agent, 'ana@x.com', SENHA)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ trocarSenha: false })
    const me = await agent.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ email: 'ana@x.com', nome: 'Ana', papel: 'leitor', origem: 'local', trocarSenha: false })
    expect(JSON.stringify(me.body)).not.toMatch(/argon2|senha_hash/)
    const { rows } = await ctx.pool.query("SELECT ultimo_login FROM usuario WHERE email='ana@x.com'")
    expect(rows[0].ultimo_login).not.toBeNull()
  })

  it('e-mail sem diferenciar caixa: "Ana@X.com" acha "ana@x.com"', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    expect((await login(agent, 'Ana@X.com', SENHA)).status).toBe(200)
  })

  it('senha errada, e-mail inexistente, conta SSO → todos 401 credenciais_invalidas idênticos', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    await loginAs(request.agent(ctx.app), { sub: 'sso1', email: 'sso@x.com', name: 'S' })
    const respostas = [
      await login(agent, 'ana@x.com', 'errada-errada'),
      await login(agent, 'ninguem@x.com', SENHA),
      await login(agent, 'sso@x.com', SENHA),
      await login(agent, '', ''),
      await login(agent, { $ne: 1 }, ['x']),
    ]
    for (const r of respostas) {
      expect(r.status).toBe(401)
      expect(r.body).toEqual({ error: 'credenciais_invalidas' })
    }
    expect((await agent.get('/auth/me')).status).toBe(401)
  })

  it('5 falhas bloqueiam: 6ª tentativa com senha CERTA → 401 genérico; após 15 min (ajustar bloqueado_ate no banco) → 200', async () => {
    const agent = await setup()
    const id = await criarLocal(ctx.pool, { email: 'ana@x.com' })
    for (let i = 0; i < 4; i++) expect((await login(agent, 'ana@x.com', 'errada-errada')).status).toBe(401)
    let { rows } = await ctx.pool.query('SELECT falhas_login, bloqueado_ate FROM usuario WHERE id=$1', [id])
    expect(rows[0]).toMatchObject({ falhas_login: 4, bloqueado_ate: null })
    expect((await login(agent, 'ana@x.com', 'errada-errada')).status).toBe(401)
    ;({ rows } = await ctx.pool.query(
      "SELECT falhas_login, bloqueado_ate > now() + interval '14 minutes' AS bloq FROM usuario WHERE id=$1", [id]
    ))
    expect(rows[0]).toEqual({ falhas_login: 0, bloq: true })
    const bloqAntes = (await ctx.pool.query('SELECT bloqueado_ate FROM usuario WHERE id=$1', [id])).rows[0].bloqueado_ate

    const certa = await login(agent, 'ana@x.com', SENHA)
    expect(certa.status).toBe(401)
    expect(certa.body).toEqual({ error: 'credenciais_invalidas' })
    expect((await login(agent, 'ana@x.com', 'errada-errada')).status).toBe(401)
    // Tentativas durante o bloqueio não contam nem estendem o bloqueio.
    ;({ rows } = await ctx.pool.query('SELECT falhas_login, bloqueado_ate FROM usuario WHERE id=$1', [id]))
    expect(rows[0].falhas_login).toBe(0)
    expect(rows[0].bloqueado_ate).toEqual(bloqAntes)
    expect((await agent.get('/auth/me')).status).toBe(401)

    await ctx.pool.query("UPDATE usuario SET bloqueado_ate = now() - interval '1 second' WHERE id=$1", [id])
    const ok = await login(agent, 'ana@x.com', SENHA)
    expect(ok.status).toBe(200)
    ;({ rows } = await ctx.pool.query('SELECT falhas_login, bloqueado_ate FROM usuario WHERE id=$1', [id]))
    expect(rows[0]).toEqual({ falhas_login: 0, bloqueado_ate: null })
  })

  it('login certo zera falhas_login', async () => {
    const agent = await setup()
    const id = await criarLocal(ctx.pool, { email: 'ana@x.com' })
    for (let i = 0; i < 3; i++) await login(agent, 'ana@x.com', 'errada-errada')
    expect((await ctx.pool.query('SELECT falhas_login FROM usuario WHERE id=$1', [id])).rows[0].falhas_login).toBe(3)
    expect((await login(agent, 'ana@x.com', SENHA)).status).toBe(200)
    expect((await ctx.pool.query('SELECT falhas_login FROM usuario WHERE id=$1', [id])).rows[0].falhas_login).toBe(0)
  })

  it('21ª tentativa do mesmo IP em 15 min → 429 muitas_tentativas', async () => {
    const agent = await setup()
    for (let i = 0; i < 20; i++) {
      expect((await login(agent, `n${i}@x.com`, 'qualquer-coisa')).status).toBe(401)
    }
    const r = await login(agent, 'n21@x.com', 'qualquer-coisa')
    expect(r.status).toBe(429)
    expect(r.body).toEqual({ error: 'muitas_tentativas' })
  })

  it('limite por IP é por instância do app (testes isolados)', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    expect((await login(agent, 'ana@x.com', SENHA)).status).toBe(200)
  })

  it('sem X-Requested-With → 403 csrf', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    const r = await agent.post('/auth/local/login').send({ email: 'ana@x.com', senha: SENHA })
    expect(r.status).toBe(403)
    expect(r.body).toEqual({ error: 'csrf' })
    expect((await agent.get('/auth/me')).status).toBe(401)
    expect((await login(agent, 'ana@x.com', SENHA)).status).toBe(200)
    const s = await agent.post('/auth/local/senha').send({ senhaAtual: SENHA, novaSenha: 'nova-senha-bem-longa' })
    expect(s.status).toBe(403)
    expect(s.body).toEqual({ error: 'csrf' })
  })

  it('trocar_senha=true: GET /endpoints → 403 trocar_senha; /auth/me 200 com trocarSenha:true', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com', papel: 'admin', trocar: true })
    const res = await login(agent, 'ana@x.com', SENHA)
    expect(res.body).toEqual({ trocarSenha: true })
    for (const path of ['/endpoints', '/departamentos', '/usuarios', '/stats']) {
      const r = await agent.get(path)
      expect(r.status).toBe(403)
      expect(r.body).toEqual({ error: 'trocar_senha' })
    }
    const w = await agent.post('/departamentos').set(XHR).send({ nome: 'X' })
    expect(w.status).toBe(403)
    expect(w.body).toEqual({ error: 'trocar_senha' })
    const me = await agent.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.trocarSenha).toBe(true)
  })

  it('POST /auth/local/senha: senhaAtual errada → 400 senha_atual_incorreta; nova < 12 ou igual à atual → 400; ok → 200 e /endpoints liberado', async () => {
    const agent = await setup()
    const id = await criarLocal(ctx.pool, { email: 'ana@x.com', trocar: true })
    await login(agent, 'ana@x.com', SENHA)

    const errada = await trocar(agent, 'nao-e-essa-aqui', 'nova-senha-bem-longa')
    expect(errada.status).toBe(400)
    expect(errada.body).toEqual({ error: 'senha_atual_incorreta' })

    const curta = await trocar(agent, SENHA, 'curta')
    expect(curta.status).toBe(400)
    expect(curta.body.error).toMatch(/12/)

    const igual = await trocar(agent, SENHA, SENHA)
    expect(igual.status).toBe(400)
    expect(igual.body.error).toEqual(expect.any(String))

    expect((await agent.get('/endpoints')).status).toBe(403)

    const ok = await trocar(agent, SENHA, 'nova-senha-bem-longa')
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).not.toMatch(/nova-senha|argon2/)
    expect((await agent.get('/endpoints')).status).toBe(200)
    expect((await agent.get('/auth/me')).body.trocarSenha).toBe(false)

    const { rows } = await ctx.pool.query('SELECT senha_hash, trocar_senha FROM usuario WHERE id=$1', [id])
    expect(rows[0].trocar_senha).toBe(false)
    expect(rows[0].senha_hash).not.toContain('nova-senha-bem-longa')

    const outro = request.agent(ctx.app)
    expect((await login(outro, 'ana@x.com', SENHA)).status).toBe(401)
    expect((await login(outro, 'ana@x.com', 'nova-senha-bem-longa')).status).toBe(200)
  })

  it('POST /auth/local/senha sem sessão → 401', async () => {
    const agent = await setup()
    expect((await trocar(agent, SENHA, 'nova-senha-bem-longa')).status).toBe(401)
  })

  it('POST /auth/local/senha por usuário SSO → 400', async () => {
    const agent = await setup()
    await loginAs(agent, { sub: 'sso1', email: 'sso@x.com', name: 'S' })
    const r = await trocar(agent, 'qualquer', 'nova-senha-bem-longa')
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ error: 'usuario_sso' })
  })

  it('sessão regenerada no login local (cookie muda)', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    const antes = sid(await agent.get('/auth/login'))
    expect(antes).toBeTruthy()
    const depois = sid(await login(agent, 'ana@x.com', SENHA))
    expect(depois).toBeTruthy()
    expect(depois).not.toBe(antes)
    // O cookie antigo não dá acesso.
    const velho = await request(ctx.app).get('/auth/me').set('Cookie', antes)
    expect(velho.status).toBe(401)
  })

  it('logout de usuário local → { redirect: "/" }', async () => {
    const agent = await setup()
    await criarLocal(ctx.pool, { email: 'ana@x.com' })
    await login(agent, 'ana@x.com', SENHA)
    const r = await agent.post('/auth/logout').set(XHR)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ redirect: '/' })
    expect((await agent.get('/auth/me')).status).toBe(401)
  })
})
