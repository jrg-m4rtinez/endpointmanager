const express = require('express')
const { requireRole } = require('../auth/guards')
const { asyncH } = require('./crudHelpers')
const { listarNaoClassificados } = require('./naoClassificados')

const statsRouter = ({ ddClient }) => {
  const r = express.Router()
  r.get('/stats', requireRole('leitor', 'admin'), asyncH(async (req, res) => {
    const pool = req.app.locals.pool
    const [{ rows }, pendentes] = await Promise.all([
      pool.query(`SELECT count(*)::int AS classificados,
                         count(*) FILTER (WHERE criticidade = 4)::int AS criticos
                    FROM departamento_endpoint`),
      listarNaoClassificados(pool, ddClient)
        .then((l) => l.filter((i) => !i.ignorado).length)
        .catch(() => null), // DD fora do ar ou não configurado
    ])
    res.json({ pendentes, ...rows[0] })
  }))
  return r
}

module.exports = { statsRouter }
