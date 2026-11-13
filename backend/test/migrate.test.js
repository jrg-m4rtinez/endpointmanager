import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { freshDatabase } from './helpers/db'
import { migrate } from '../src/migrate'

let db, pool

beforeEach(async () => {
  db = await freshDatabase()
  pool = db.pool
})
afterEach(async () => {
  await db.drop()
})

async function tables(pool) {
  const r = await pool.query("select table_name from information_schema.tables where table_schema='public'")
  return r.rows.map((x) => x.table_name)
}
async function columns(pool, table) {
  const r = await pool.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
    [table]
  )
  return r.rows.map((x) => x.column_name)
}
async function columnDefs(pool, tableNames) {
  const r = await pool.query(
    `select table_name, column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name = any($1)
      order by table_name, column_name`,
    [tableNames]
  )
  return r.rows
}
// Schema v1 exato do backend/server.js antigo
async function createV1Schema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento_endpoint (
      id SERIAL PRIMARY KEY,
      endpoint VARCHAR(255) NOT NULL UNIQUE,
      criticidade INTEGER NOT NULL CHECK (criticidade BETWEEN 1 AND 4),
      departamento_id INTEGER REFERENCES departamento(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query("insert into departamento (nome) values ('TI')")
  await pool.query("insert into departamento_endpoint (endpoint, criticidade, departamento_id) values ('a.local', 2, 1)")
}

describe('migrate', () => {
  it('cria tabelas novas e coluna tipo_id', async () => {
    await migrate(pool)
    const t = await tables(pool)
    expect(t).toEqual(
      expect.arrayContaining(['departamento', 'departamento_endpoint', 'tipo', 'usuario', 'endpoint_ignorado'])
    )
    expect(await columns(pool, 'departamento_endpoint')).toContain('tipo_id')
  })

  it('é idempotente e não altera colunas legadas', async () => {
    await createV1Schema(pool)
    const before = await columnDefs(pool, ['departamento', 'departamento_endpoint'])
    await migrate(pool)
    await migrate(pool)
    const after = await columnDefs(pool, ['departamento', 'departamento_endpoint'])
    expect(after.filter((c) => c.column_name !== 'tipo_id')).toEqual(before)
    expect((await pool.query('select count(*)::int c from departamento_endpoint')).rows[0].c).toBe(1)
  })

  it('semeia tipos padrão só quando vazio', async () => {
    await migrate(pool)
    expect((await pool.query('select nome from tipo order by nome')).rows.map((r) => r.nome)).toEqual([
      'Aplicação Web',
      'Banco de Dados',
      'Servidor',
    ])
    await pool.query("delete from tipo where nome='Servidor'")
    await migrate(pool)
    expect((await pool.query('select count(*)::int c from tipo')).rows[0].c).toBe(2)
  })
})
