import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import { buildTestApp, loginAs } from './helpers/app'

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})

async function setup(papel = 'admin') {
  ctx = await buildTestApp()
  const agent = request.agent(ctx.app)
  await loginAs(agent, { sub: 'u-' + papel, email: `${papel}@lab.local`, name: papel })
  await ctx.pool.query('UPDATE usuario SET papel = $1', [papel])
  return agent
}
const X = { 'X-Requested-With': 'XMLHttpRequest' }
const post = (a, url, body) => a.post(url).set(X).send(body)
const put = (a, url, body) => a.put(url).set(X).send(body)
const del = (a, url) => a.delete(url).set(X)

describe.each([
  ['departamentos', 'Departamento'],
  ['tipos', 'Tipo'],
])('%s', (rota, label) => {
  const url = `/${rota}`
  it('admin cria, edita, lista e remove', async () => {
    const a = await setup()
    const c = await post(a, url, { nome: '  Zeta  ' })
    expect(c.status).toBe(201)
    expect(c.body).toMatchObject({ nome: 'Zeta' })
    const id = c.body.id
    const u = await put(a, `${url}/${id}`, { nome: 'Alfa-X' })
    expect(u.status).toBe(200)
    expect(u.body.nome).toBe('Alfa-X')
    const l = await a.get(url)
    expect(l.status).toBe(200)
    const row = l.body.find((r) => r.id === id)
    expect(row).toMatchObject({ nome: 'Alfa-X', total_endpoints: 0 })
    expect(row.created_at).toBeTruthy()
    // ordenado por nome (mesma ordenação do Postgres para nomes ASCII simples)
    expect(l.body.map((r) => r.nome)[0]).toBe('Alfa-X')
    expect((await del(a, `${url}/${id}`)).status).toBe(204)
    expect((await a.get(url)).body.find((r) => r.id === id)).toBeUndefined()
  })
  it('nome vazio/espaços → 400', async () => {
    const a = await setup()
    for (const nome of ['', '   ', undefined]) {
      const r = await post(a, url, { nome })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'nome é obrigatório' })
    }
    const c = await post(a, url, { nome: 'Ok' })
    expect((await put(a, `${url}/${c.body.id}`, { nome: ' ' })).status).toBe(400)
  })
  it('duplicado → 409', async () => {
    const a = await setup()
    await post(a, url, { nome: 'Dup' })
    const r = await post(a, url, { nome: 'Dup' })
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ error: `${label} já existe` })
    const o = await post(a, url, { nome: 'Outro' })
    const p = await put(a, `${url}/${o.body.id}`, { nome: 'Dup' })
    expect(p.status).toBe(409)
    expect(p.body).toEqual({ error: `${label} já existe` })
  })
  it('PUT/DELETE id inexistente → 404', async () => {
    const a = await setup()
    expect((await put(a, `${url}/999999`, { nome: 'X' })).status).toBe(404)
    expect((await del(a, `${url}/999999`)).status).toBe(404)
    expect((await del(a, `${url}/abc`)).status).toBe(404)
  })
})

describe('endpoints', () => {
  it('POST com tipo e departamento → GET traz nomes', async () => {
    const a = await setup()
    const d = (await post(a, '/departamentos', { nome: 'TI' })).body
    const t = (await post(a, '/tipos', { nome: 'Servidor X' })).body
    const c = await post(a, '/endpoints', {
      endpoint: '  Host.Lab.local ',
      criticidade: 3,
      departamento_id: d.id,
      tipo_id: t.id,
    })
    expect(c.status).toBe(201)
    const l = await a.get('/endpoints')
    expect(l.body).toHaveLength(1)
    expect(l.body[0]).toMatchObject({
      endpoint: 'Host.Lab.local',
      criticidade: 3,
      departamento_id: d.id,
      departamento_nome: 'TI',
      tipo_id: t.id,
      tipo_nome: 'Servidor X',
    })
    expect(l.body[0].created_at).toBeTruthy()
    const p = await put(a, `/endpoints/${c.body.id}`, { endpoint: 'h2', criticidade: 1, departamento_id: '', tipo_id: null })
    expect(p.status).toBe(200)
    const l2 = await a.get('/endpoints')
    expect(l2.body[0]).toMatchObject({ endpoint: 'h2', departamento_id: null, tipo_id: null, tipo_nome: null })
    expect((await put(a, '/endpoints/99999', { endpoint: 'x', criticidade: 1 })).status).toBe(404)
    expect((await del(a, '/endpoints/99999')).status).toBe(404)
    expect((await del(a, `/endpoints/${c.body.id}`)).status).toBe(204)
  })
  it('endpoint vazio → 400', async () => {
    const a = await setup()
    const r = await post(a, '/endpoints', { endpoint: ' ', criticidade: 1 })
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ error: 'endpoint é obrigatório' })
  })
  it('criticidade 0, 5, "x" → 400', async () => {
    const a = await setup()
    for (const criticidade of [0, 5, 'x', 1.5, undefined]) {
      const r = await post(a, '/endpoints', { endpoint: 'h', criticidade })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'criticidade deve ser 1 a 4' })
    }
  })
  it('tipo_id inexistente → 400', async () => {
    const a = await setup()
    const r = await post(a, '/endpoints', { endpoint: 'h', criticidade: 1, tipo_id: 999999 })
    expect(r.status).toBe(400)
  })
  it('endpoint duplicado → 409', async () => {
    const a = await setup()
    await post(a, '/endpoints', { endpoint: 'h', criticidade: 1 })
    const r = await post(a, '/endpoints', { endpoint: 'h', criticidade: 2 })
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ error: 'Endpoint já existe' })
  })
  it('remover tipo em uso deixa endpoint com tipo_id null', async () => {
    const a = await setup()
    const t = (await post(a, '/tipos', { nome: 'Temp' })).body
    await post(a, '/endpoints', { endpoint: 'h', criticidade: 1, tipo_id: t.id })
    expect((await del(a, `/tipos/${t.id}`)).status).toBe(204)
    expect((await a.get('/endpoints')).body[0].tipo_id).toBeNull()
  })
  it('GET /tipos e /departamentos trazem total_endpoints', async () => {
    const a = await setup()
    const t = (await post(a, '/tipos', { nome: 'Cont' })).body
    const d = (await post(a, '/departamentos', { nome: 'Dep' })).body
    await post(a, '/endpoints', { endpoint: 'h1', criticidade: 1, tipo_id: t.id, departamento_id: d.id })
    await post(a, '/endpoints', { endpoint: 'h2', criticidade: 1, tipo_id: t.id })
    expect((await a.get('/tipos')).body.find((r) => r.id === t.id).total_endpoints).toBe(2)
    expect((await a.get('/departamentos')).body.find((r) => r.id === d.id).total_endpoints).toBe(1)
  })
})

describe('permissões', () => {
  it('sem sessão → 401 em GET e POST', async () => {
    ctx = await buildTestApp()
    const a = request.agent(ctx.app)
    for (const u of ['/departamentos', '/tipos', '/endpoints']) {
      expect((await a.get(u)).status).toBe(401)
      expect((await post(a, u, { nome: 'x' })).status).toBe(401)
    }
  })
  it('pendente → 403 aguardando_liberacao em GET', async () => {
    const a = await setup('pendente')
    const r = await a.get('/endpoints')
    expect(r.status).toBe(403)
    expect(r.body).toEqual({ error: 'aguardando_liberacao' })
  })
  it('leitor: GET 200, escrita 403 sem_permissao', async () => {
    const a = await setup('leitor')
    for (const u of ['/departamentos', '/tipos', '/endpoints']) {
      expect((await a.get(u)).status).toBe(200)
      for (const r of [await post(a, u, { nome: 'x' }), await put(a, `${u}/1`, { nome: 'x' }), await del(a, `${u}/1`)]) {
        expect(r.status).toBe(403)
        expect(r.body).toEqual({ error: 'sem_permissao' })
      }
    }
  })
  it('admin sem X-Requested-With → 403 csrf', async () => {
    const a = await setup('admin')
    const r = await a.post('/tipos').send({ nome: 'x' })
    expect(r.status).toBe(403)
    expect(r.body).toEqual({ error: 'csrf' })
  })
})
