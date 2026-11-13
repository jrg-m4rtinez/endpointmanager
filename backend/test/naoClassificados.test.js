import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import { buildTestApp, loginAs } from './helpers/app'
import { DefectDojoError } from '../src/defectdojo/client'

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})

const X = { 'X-Requested-With': 'XMLHttpRequest' }
const HOSTS = [
  { host: 'a.lab', produtos: ['P1'], findingsAtivos: 2 },
  { host: 'db01.infra.lab', produtos: ['P2'], findingsAtivos: 5 },
  { host: 'b.lab', produtos: [], findingsAtivos: 5 },
]

async function setup({ papel = 'admin', ddClient } = {}) {
  const calls = []
  const dd = ddClient === undefined
    ? { listHosts: async (o) => (calls.push(o), HOSTS), ping: async () => {} }
    : ddClient
  ctx = await buildTestApp({ ddClient: dd })
  const agent = request.agent(ctx.app)
  await loginAs(agent, { sub: 'u-' + papel, email: `${papel}@lab.local`, name: papel })
  await ctx.pool.query('UPDATE usuario SET papel = $1', [papel])
  return { agent, calls }
}
const addEp = (a, endpoint, criticidade = 1) =>
  a.post('/endpoints').set(X).send({ endpoint, criticidade })
const hosts = (r) => r.body.itens.map((i) => i.host)

describe('nao-classificados', () => {
  it('lista só hosts do DD sem classificação, ordenados por findings desc', async () => {
    const { agent } = await setup()
    await addEp(agent, 'a.lab')
    const r = await agent.get('/nao-classificados')
    expect(r.status).toBe(200)
    expect(r.body.itens).toEqual([
      { host: 'b.lab', produtos: [], findingsAtivos: 5, ignorado: false },
      { host: 'db01.infra.lab', produtos: ['P2'], findingsAtivos: 5, ignorado: false },
    ])
  })

  it('endpoint cadastrado "DB01.infra.lab " conta como classificado', async () => {
    const { agent } = await setup()
    await ctx.pool.query("INSERT INTO departamento_endpoint (endpoint, criticidade) VALUES ('DB01.infra.lab ', 1)")
    const r = await agent.get('/nao-classificados')
    expect(hosts(r)).toEqual(['b.lab', 'a.lab'])
  })

  it('ignorar remove da lista; ?ignorados=1 mostra com ignorado:true; DELETE desfaz', async () => {
    const { agent } = await setup()
    const p = await agent.post('/nao-classificados/ignorados').set(X).send({ host: '  B.Lab ' })
    expect(p.status).toBe(201)
    const p2 = await agent.post('/nao-classificados/ignorados').set(X).send({ host: 'b.lab' })
    expect(p2.status).toBe(200)
    expect(hosts(await agent.get('/nao-classificados'))).toEqual(['db01.infra.lab', 'a.lab'])
    const todos = await agent.get('/nao-classificados?ignorados=1')
    expect(todos.body.itens.find((i) => i.host === 'b.lab').ignorado).toBe(true)
    expect(todos.body.itens).toHaveLength(3)
    const d = await agent.delete('/nao-classificados/ignorados/B.LAB%20').set(X)
    expect(d.status).toBe(204)
    expect(hosts(await agent.get('/nao-classificados'))).toContain('b.lab')
  })

  it('atualizar=1 repassa force', async () => {
    const { agent, calls } = await setup()
    await agent.get('/nao-classificados')
    await agent.get('/nao-classificados?atualizar=1')
    expect(calls.map((c) => !!c.force)).toEqual([false, true])
  })

  it('classificar via POST /endpoints remove da lista e limpa ignorado', async () => {
    const { agent } = await setup()
    await agent.post('/nao-classificados/ignorados').set(X).send({ host: 'b.lab' })
    const c = await addEp(agent, ' B.lab')
    expect(c.status).toBe(201)
    expect(hosts(await agent.get('/nao-classificados?ignorados=1'))).not.toContain('b.lab')
    const { rows } = await ctx.pool.query('SELECT 1 FROM endpoint_ignorado')
    expect(rows).toHaveLength(0)
  })

  it('POST /endpoints duas vezes para o mesmo host → segundo 409', async () => {
    const { agent } = await setup()
    expect((await addEp(agent, 'x.lab')).status).toBe(201)
    expect((await addEp(agent, 'x.lab')).status).toBe(409)
  })

  it('DD lança DefectDojoError → 502; GET /endpoints segue 200', async () => {
    const dd = { listHosts: async () => { throw new DefectDojoError('fora do ar') }, ping: async () => {} }
    const { agent } = await setup({ ddClient: dd })
    const r = await agent.get('/nao-classificados')
    expect(r.status).toBe(502)
    expect(r.body).toEqual({ error: 'defectdojo_indisponivel', detalhe: 'fora do ar' })
    expect((await agent.get('/endpoints')).status).toBe(200)
    expect((await agent.get('/stats')).body.pendentes).toBeNull()
  })

  it('sem ddClient → 503; /stats.pendentes = null', async () => {
    const { agent } = await setup({ ddClient: null })
    const r = await agent.get('/nao-classificados')
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ error: 'defectdojo_nao_configurado' })
    const s = await agent.get('/stats')
    expect(s.status).toBe(200)
    expect(s.body.pendentes).toBeNull()
  })

  it('/stats conta pendentes, classificados e criticos', async () => {
    const { agent } = await setup()
    await addEp(agent, 'a.lab', 4)
    await addEp(agent, 'z.lab', 2)
    await agent.post('/nao-classificados/ignorados').set(X).send({ host: 'b.lab' })
    const s = await agent.get('/stats')
    expect(s.body).toEqual({ pendentes: 1, classificados: 2, criticos: 1 })
  })

  it('leitor: GET 200, POST ignorados 403', async () => {
    const { agent } = await setup({ papel: 'leitor' })
    expect((await agent.get('/nao-classificados')).status).toBe(200)
    expect((await agent.get('/stats')).status).toBe(200)
    expect((await agent.post('/nao-classificados/ignorados').set(X).send({ host: 'a.lab' })).status).toBe(403)
    expect((await agent.delete('/nao-classificados/ignorados/a.lab').set(X)).status).toBe(403)
  })
})
