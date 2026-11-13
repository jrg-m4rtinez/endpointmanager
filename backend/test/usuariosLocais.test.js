import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { buildTestApp, loginAs } from './helpers/app'
import { loadConfig } from '../src/config'

const run = promisify(execFile)
const X = { 'X-Requested-With': 'XMLHttpRequest' }
const SCRIPT = path.resolve(__dirname, '../scripts/criar-admin-local.js')

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})

async function setup(opts) {
  ctx = await buildTestApp(opts)
  const admin = request.agent(ctx.app)
  await loginAs(admin, { sub: 'adm', email: 'adm@lab.local', name: 'Adm' })
  await ctx.pool.query("UPDATE usuario SET papel = 'admin' WHERE sub = 'adm'")
  return admin
}

const criar = (ag, body) => ag.post('/usuarios').set(X).send(body)
const login = (ag, email, senha) => ag.post('/auth/local/login').set(X).send({ email, senha })

describe('POST /usuarios (criar local)', () => {
  it('admin cria local → 201 com senhaTemporaria (16 chars); usuário loga com ela e cai em trocarSenha', async () => {
    const admin = await setup()
    const r = await criar(admin, { nome: ' Ana ', email: ' Ana@X.com ', papel: 'leitor' })
    expect(r.status).toBe(201)
    expect(r.body.senhaTemporaria).toMatch(/^[A-Za-z0-9]{16}$/)
    expect(r.body.usuario).toEqual({ id: expect.any(Number), nome: 'Ana', email: 'Ana@X.com', papel: 'leitor', origem: 'local' })
    expect(JSON.stringify(r.body)).not.toMatch(/argon2|senha_hash/)
    const { rows } = await ctx.pool.query('SELECT sub, trocar_senha, senha_hash FROM usuario WHERE id = $1', [r.body.usuario.id])
    expect(rows[0].sub).toBe('local:ana@x.com')
    expect(rows[0].trocar_senha).toBe(true)
    expect(rows[0].senha_hash).not.toContain(r.body.senhaTemporaria)

    const ag = request.agent(ctx.app)
    const l = await login(ag, 'ana@x.com', r.body.senhaTemporaria)
    expect(l.status).toBe(200)
    expect(l.body).toEqual({ trocarSenha: true })
  })

  it('valida nome, e-mail e papel → 400', async () => {
    const admin = await setup()
    for (const body of [
      { email: 'a@x.com', papel: 'leitor' },
      { nome: '  ', email: 'a@x.com', papel: 'leitor' },
      { nome: 'A', papel: 'leitor' },
      { nome: 'A', email: 'semarroba', papel: 'leitor' },
      { nome: 'A', email: '@x', papel: 'leitor' },
      { nome: 'A', email: 'a@', papel: 'leitor' },
      { nome: 'A', email: 'a b@x.com', papel: 'leitor' },
      { nome: 'A', email: ['a@x.com'], papel: 'leitor' },
      { nome: 'A', email: 'a@x.com', papel: 'root' },
      { nome: 'A', email: 'a@x.com' },
    ]) {
      expect((await criar(admin, body)).status).toBe(400)
    }
    expect((await criar(admin, { nome: 'S', email: 'sam@sus.com', papel: 'leitor' })).status).toBe(201)
  })

  it('email já existe (SSO, outra caixa) → 409 email_em_uso; local duplicado também', async () => {
    const admin = await setup()
    await loginAs(request.agent(ctx.app), { sub: 'sso1', email: 'Bia@X.com', name: 'Bia' })
    const r = await criar(admin, { nome: 'Bia', email: 'bia@x.COM', papel: 'leitor' })
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ error: 'email_em_uso' })
    expect((await criar(admin, { nome: 'C', email: 'c@x.com', papel: 'leitor' })).status).toBe(201)
    expect((await criar(admin, { nome: 'C', email: 'C@x.com', papel: 'leitor' })).status).toBe(409)
  })

  it('leitor não cria (403); sem XHR → 403 csrf', async () => {
    const admin = await setup()
    const { body } = await criar(admin, { nome: 'L', email: 'l@x.com', papel: 'leitor' })
    const ag = request.agent(ctx.app)
    await ctx.pool.query('UPDATE usuario SET trocar_senha = false WHERE email = $1', ['l@x.com'])
    expect((await login(ag, 'l@x.com', body.senhaTemporaria)).status).toBe(200)
    expect((await criar(ag, { nome: 'N', email: 'n@x.com', papel: 'leitor' })).status).toBe(403)
    const sem = await admin.post('/usuarios').send({ nome: 'N', email: 'n@x.com', papel: 'leitor' })
    expect(sem.status).toBe(403)
    expect(sem.body).toEqual({ error: 'csrf' })
  })

  it('loginLocal desligado → 400 login_local_desligado', async () => {
    const admin = await setup({ loginLocal: 'desligado' })
    const r = await criar(admin, { nome: 'A', email: 'a@x.com', papel: 'leitor' })
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ error: 'login_local_desligado' })
  })
})

describe('redefinir-senha', () => {
  it('local → nova senha funciona, a antiga não; zera bloqueio; SSO → 400 usuario_sso; inexistente → 404', async () => {
    const admin = await setup()
    const c = await criar(admin, { nome: 'A', email: 'a@x.com', papel: 'leitor' })
    const id = c.body.usuario.id
    await ctx.pool.query(
      "UPDATE usuario SET falhas_login = 3, bloqueado_ate = now() + interval '10 minutes', trocar_senha = false WHERE id = $1", [id]
    )
    const r = await admin.post(`/usuarios/${id}/redefinir-senha`).set(X)
    expect(r.status).toBe(200)
    expect(Object.keys(r.body)).toEqual(['senhaTemporaria'])
    expect(r.body.senhaTemporaria).toMatch(/^[A-Za-z0-9]{16}$/)
    const { rows } = await ctx.pool.query('SELECT trocar_senha, falhas_login, bloqueado_ate FROM usuario WHERE id = $1', [id])
    expect(rows[0]).toEqual({ trocar_senha: true, falhas_login: 0, bloqueado_ate: null })
    const ag = request.agent(ctx.app)
    expect((await login(ag, 'a@x.com', c.body.senhaTemporaria)).status).toBe(401)
    expect((await login(ag, 'a@x.com', r.body.senhaTemporaria)).status).toBe(200)

    const sso = (await ctx.pool.query("SELECT id FROM usuario WHERE sub = 'adm'")).rows[0].id
    const s = await admin.post(`/usuarios/${sso}/redefinir-senha`).set(X)
    expect(s.status).toBe(400)
    expect(s.body).toEqual({ error: 'usuario_sso' })
    expect((await admin.post('/usuarios/99999/redefinir-senha').set(X)).status).toBe(404)
    expect((await admin.post('/usuarios/abc/redefinir-senha').set(X)).status).toBe(404)
    expect((await admin.post(`/usuarios/${id}/redefinir-senha`)).status).toBe(403)
  })
})

describe('papel e listagem', () => {
  it('promover local a admin funciona; rebaixar o único admin (local) → 409 ultimo_admin', async () => {
    const admin = await setup()
    const c = await criar(admin, { nome: 'A', email: 'a@x.com', papel: 'leitor' })
    const id = c.body.usuario.id
    expect((await admin.put(`/usuarios/${id}`).set(X).send({ papel: 'admin' })).status).toBe(200)
    // Entra como o local e deixa o SSO como leitor: o local vira o único admin.
    await ctx.pool.query('UPDATE usuario SET trocar_senha = false WHERE id = $1', [id])
    const ag = request.agent(ctx.app)
    expect((await login(ag, 'a@x.com', c.body.senhaTemporaria)).status).toBe(200)
    await ctx.pool.query("UPDATE usuario SET papel = 'leitor' WHERE sub = 'adm'")
    const r = await ag.put(`/usuarios/${id}`).set(X).send({ papel: 'leitor' })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('ultimo_admin')
  })

  it('GET /usuarios traz origem e nunca senha_hash', async () => {
    const admin = await setup()
    await criar(admin, { nome: 'A', email: 'a@x.com', papel: 'leitor' })
    const r = await admin.get('/usuarios')
    expect(r.status).toBe(200)
    expect(r.body.map((u) => u.origem).sort()).toEqual(['local', 'sso'])
    expect(JSON.stringify(r.body)).not.toMatch(/senha_hash|argon2|senhaTemporaria/)
    for (const u of r.body) expect(u).not.toHaveProperty('senha_hash')
  })
})

describe('script criar-admin-local', () => {
  function rodar(args) {
    const u = new URL(ctx.url)
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PG_HOST: u.hostname,
      PG_PORT: u.port,
      PG_USER: decodeURIComponent(u.username),
      PG_PASSWORD: decodeURIComponent(u.password),
      PG_DATABASE: u.pathname.slice(1),
    }
    return run(process.execPath, [SCRIPT, ...args], { env }).then(
      (r) => ({ code: 0, ...r }),
      (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr })
    )
  }

  it('cria admin local novo; reexecutar redefine senha; e-mail SSO → exit 1', async () => {
    await setup()
    const a = await rodar(['Emerg@X.com', 'Emergência'])
    expect(a.code).toBe(0)
    const s1 = (a.stdout.match(/Senha temporária: (\S{16})/) || [])[1]
    expect(s1).toBeTruthy()
    expect(a.stdout).toMatch(/trocar/i)
    let { rows } = await ctx.pool.query("SELECT papel, origem, trocar_senha, sub FROM usuario WHERE email = 'Emerg@X.com'")
    expect(rows[0]).toEqual({ papel: 'admin', origem: 'local', trocar_senha: true, sub: 'local:emerg@x.com' })
    expect((await login(request.agent(ctx.app), 'emerg@x.com', s1)).status).toBe(200)

    await ctx.pool.query("UPDATE usuario SET papel = 'leitor', falhas_login = 4 WHERE sub = 'local:emerg@x.com'")
    const b = await rodar(['emerg@x.com', 'Emergência'])
    expect(b.code).toBe(0)
    const s2 = (b.stdout.match(/Senha temporária: (\S{16})/) || [])[1]
    expect(s2).not.toBe(s1)
    ;({ rows } = await ctx.pool.query("SELECT papel, falhas_login, bloqueado_ate FROM usuario WHERE sub = 'local:emerg@x.com'"))
    expect(rows).toEqual([{ papel: 'admin', falhas_login: 0, bloqueado_ate: null }])
    expect((await login(request.agent(ctx.app), 'emerg@x.com', s1)).status).toBe(401)
    expect((await login(request.agent(ctx.app), 'emerg@x.com', s2)).status).toBe(200)

    const c = await rodar(['adm@lab.local', 'Adm'])
    expect(c.code).toBe(1)
    expect(c.stderr).toMatch(/SSO/)
    const d = await rodar([])
    expect(d.code).toBe(1)
    expect(d.stderr).toMatch(/Uso/)
  }, 30000)
})

describe('trust proxy', () => {
  it('TRUST_PROXY: padrão 1; inteiro ≥ 0; inválido → erro pt-BR', () => {
    expect(loadConfig({}).trustProxy).toBe(1)
    expect(loadConfig({ TRUST_PROXY: '0' }).trustProxy).toBe(0)
    expect(loadConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2)
    for (const v of ['-1', 'abc', '1.5', 'true']) expect(() => loadConfig({ TRUST_PROXY: v })).toThrow(/TRUST_PROXY/)
  })

  it('limite por IP usa X-Forwarded-For (HTTP, sem https)', async () => {
    ctx = await buildTestApp()
    const tentar = (ip) =>
      request(ctx.app).post('/auth/local/login').set(X).set('X-Forwarded-For', ip).send({ email: 'n@x.com', senha: 'qualquer-coisa' })
    for (let i = 0; i < 20; i++) expect((await tentar('1.1.1.1')).status).toBe(401)
    expect((await tentar('1.1.1.1')).status).toBe(429)
    expect((await tentar('2.2.2.2')).status).toBe(401)
  })
})
