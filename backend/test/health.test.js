import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { freshDatabase } from './helpers/db'
import { createApp } from '../src/app'

let db

beforeAll(async () => {
  db = await freshDatabase()
})
afterAll(async () => {
  await db.drop()
})

describe('GET /health', () => {
  it('retorna db ok e defectdojo nao_configurado sem ddClient', async () => {
    const app = createApp({ pool: db.pool, ddClient: null, oidc: null, config: {} })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'nao_configurado' })
  })

  it('retorna defectdojo ok quando ping resolve', async () => {
    const ddClient = { ping: async () => {} }
    const app = createApp({ pool: db.pool, ddClient, oidc: null, config: {} })
    const res = await request(app).get('/health')
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'ok' })
  })

  it('retorna defectdojo erro quando ddClient.ping() rejeita', async () => {
    const ddClient = { ping: async () => { throw new Error('boom') } }
    const app = createApp({ pool: db.pool, ddClient, oidc: null, config: {} })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ db: 'ok', defectdojo: 'erro' })
  })

  it('retorna db erro quando o banco falha', async () => {
    const pool = { query: async () => { throw new Error('down') } }
    const app = createApp({ pool, ddClient: null, oidc: null, config: {} })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.db).toBe('erro')
  })
})
