const { Pool } = require('pg')

function createPool(config) {
  return new Pool(config.pg)
}

async function waitForDb(pool, { retries = 30, delayMs = 2000 } = {}) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (e) {
      lastErr = e
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw new Error(`Banco indisponível após ${retries} tentativas: ${lastErr && lastErr.message}`)
}

module.exports = { createPool, waitForDb }
