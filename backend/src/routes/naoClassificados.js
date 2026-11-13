const express = require('express')
const { requireRole } = require('../auth/guards')
const { httpError } = require('../errors')
const { asyncH, textoObrigatorio } = require('./crudHelpers')
const { normalizeHost } = require('../defectdojo/hosts')
const { DefectDojoError } = require('../defectdojo/client')

// Hosts do DD sem endpoint classificado (comparação normalizada nos dois lados).
// Cada item vem com `ignorado`; quem chama filtra se quiser.
async function listarNaoClassificados(pool, ddClient, { force = false } = {}) {
  if (!ddClient) throw httpError(503, 'defectdojo_nao_configurado')
  let hosts
  try {
    hosts = await ddClient.listHosts({ force })
  } catch (err) {
    if (err instanceof DefectDojoError || err.name === 'DefectDojoError') {
      const e = httpError(502, 'defectdojo_indisponivel')
      e.detalhe = err.message
      throw e
    }
    throw err
  }
  const [cls, ign] = await Promise.all([
    pool.query('SELECT lower(trim(endpoint)) AS h FROM departamento_endpoint'),
    pool.query('SELECT host FROM endpoint_ignorado'),
  ])
  const classificados = new Set(cls.rows.map((r) => r.h))
  const ignorados = new Set(ign.rows.map((r) => r.host))
  return hosts
    .filter((h) => !classificados.has(normalizeHost(h.host)))
    .map((h) => ({
      host: h.host,
      produtos: h.produtos,
      findingsAtivos: h.findingsAtivos,
      ignorado: ignorados.has(normalizeHost(h.host)),
    }))
    .sort((a, b) => b.findingsAtivos - a.findingsAtivos || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
}

const naoClassificadosRouter = ({ ddClient }) => {
  const r = express.Router()
  const leitura = requireRole('leitor', 'admin')
  const escrita = requireRole('admin')
  r.get('/nao-classificados', leitura, asyncH(async (req, res) => {
    const todos = await listarNaoClassificados(req.app.locals.pool, ddClient, { force: req.query.atualizar === '1' })
    res.json({ itens: req.query.ignorados === '1' ? todos : todos.filter((i) => !i.ignorado) })
  }))
  r.post('/nao-classificados/ignorados', escrita, asyncH(async (req, res) => {
    const host = normalizeHost(textoObrigatorio((req.body || {}).host, 'host'))
    const { rowCount } = await req.app.locals.pool.query(
      'INSERT INTO endpoint_ignorado (host, ignorado_por) VALUES ($1,$2) ON CONFLICT (host) DO NOTHING',
      [host, req.user.id]
    )
    res.status(rowCount ? 201 : 200).json({ host })
  }))
  r.delete('/nao-classificados/ignorados/:host', escrita, asyncH(async (req, res) => {
    await req.app.locals.pool.query('DELETE FROM endpoint_ignorado WHERE host = $1', [normalizeHost(req.params.host)])
    res.status(204).end()
  }))
  return r
}

module.exports = { naoClassificadosRouter, listarNaoClassificados }
