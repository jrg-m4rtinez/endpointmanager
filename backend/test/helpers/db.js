const crypto = require('node:crypto')
const { Pool } = require('pg')

const ADMIN_URL = process.env.TEST_PG_URL || 'postgres://postgres:test@localhost:55432/postgres'

async function freshDatabase() {
  const name = `t_${crypto.randomBytes(6).toString('hex')}`
  const admin = new Pool({ connectionString: ADMIN_URL })
  await admin.query(`CREATE DATABASE ${name}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  const pool = new Pool({ connectionString: url.toString() })
  return {
    pool,
    url: url.toString(),
    async drop() {
      await pool.end()
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await admin.end()
    },
  }
}

module.exports = { freshDatabase }
