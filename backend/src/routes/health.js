const express = require('express')

function healthRouter({ pool, ddClient }) {
  const router = express.Router()
  router.get('/health', async (req, res) => {
    let db = 'ok'
    try {
      await pool.query('SELECT 1')
    } catch {
      db = 'erro'
    }
    let defectdojo = 'nao_configurado'
    if (ddClient) {
      try {
        await ddClient.ping()
        defectdojo = 'ok'
      } catch {
        defectdojo = 'erro'
      }
    }
    res.json({ db, defectdojo })
  })
  return router
}

module.exports = { healthRouter }
