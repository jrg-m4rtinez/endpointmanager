import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { freshDatabase } from './helpers/db'
import express from 'express'
import { createApp } from '../src/app'
import { healthRouter } from '../src/routes/health'

let db

beforeAll(async () => {
  db = await freshDatabase()
})
afterAll(async () => {
  await db.drop()
})

describe('GET /health', () => {
  it('retorna db ok e defectdojo nao_configurado sem ddClient', async () => {
    const app = createApp({ pool: db.pool, ddClient: null, oidc: null, config: { sessionSecret: 's', appBaseUrl: 'http://x' } })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'nao_configurado' })
  })

  it('retorna defectdojo ok quando ping resolve', async () => {
    const ddClient = { ping: async () => {} }
    const app = createApp({ pool: db.pool, ddClient, oidc: null, config: { sessionSecret: 's', appBaseUrl: 'http://x' } })
    const res = await request(app).get('/health')
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'ok' })
  })

  it('retorna defectdojo erro quando ddClient.ping() rejeita', async () => {
    const ddClient = { ping: async () => { throw new Error('boom') } }
    const app = createApp({ pool: db.pool, ddClient, oidc: null, config: { sessionSecret: 's', appBaseUrl: 'http://x' } })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'erro' })
  })

  it('retorna db erro quando o banco falha', async () => {
    const pool = { query: async () => { throw new Error('down') } }
    const app = createApp({ pool, ddClient: null, oidc: null, config: { sessionSecret: 's', appBaseUrl: 'http://x' } })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.db).toBe('erro')
  })
})

describe('cabeçalhos', () => {
  it('não expõe X-Powered-By', async () => {
    const app = createApp({ pool: db.pool, ddClient: null, oidc: null, config: { sessionSecret: 's', appBaseUrl: 'http://x' } })
    const res = await request(app).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})

describe('GET /health: cache do ping do DefectDojo', () => {
  function appWith(ddClient, now) {
    const app = express()
    app.use(healthRouter({ pool: db.pool, ddClient, now }))
    return app
  }

  it('sucesso fica em cache por 30 s', async () => {
    let t = 1000
    let calls = 0
    const app = appWith({ ping: async () => { calls++ } }, () => t)
    expect((await request(app).get('/health')).body.defectdojo).toBe('ok')
    t += 29000
    expect((await request(app).get('/health')).body.defectdojo).toBe('ok')
    expect(calls).toBe(1)
    t += 1001
    await request(app).get('/health')
    expect(calls).toBe(2)
  })

  it('falha também fica em cache por 30 s', async () => {
    let t = 1000
    let calls = 0
    const app = appWith({ ping: async () => { calls++; throw new Error('x') } }, () => t)
    expect((await request(app).get('/health')).body.defectdojo).toBe('erro')
    expect((await request(app).get('/health')).body.defectdojo).toBe('erro')
    expect(calls).toBe(1)
    t += 30001
    await request(app).get('/health')
    expect(calls).toBe(2)
  })
})
