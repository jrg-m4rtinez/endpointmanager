const express = require('express')

// /health é anônimo: o resultado do ping ao DefectDojo (sucesso ou falha) fica em cache
// por ttlMs para que chamadas repetidas não batam no DefectDojo a cada vez.
function healthRouter({ pool, ddClient, now = Date.now, ttlMs = 30000 }) {
  const router = express.Router()
  let ddCache = null // { at, status }

  async function ddStatus() {
    if (!ddClient) return 'nao_configurado'
    if (ddCache && now() - ddCache.at < ttlMs) return ddCache.status
    let status
    try {
      await ddClient.ping()
      status = 'ok'
    } catch {
      status = 'erro'
    }
    ddCache = { at: now(), status }
    return status
  }

  router.get('/health', async (req, res) => {
    let db = 'ok'
    try {
      await pool.query('SELECT 1')
    } catch {
      db = 'erro'
    }
    const defectdojo = await ddStatus()
    res.json({ db, defectdojo })
  })
  return router
}

module.exports = { healthRouter }
