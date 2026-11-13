const express = require('express')
const { requireRole } = require('../auth/guards')
const { httpError } = require('../errors')

const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next)

// Converte violação de unicidade (23505) em 409 com mensagem específica.
async function runWrite(promise, msgDuplicado) {
  try {
    return await promise
  } catch (err) {
    if (err.code === '23505') throw httpError(409, msgDuplicado)
    throw err
  }
}

function textoObrigatorio(valor, campo) {
  const v = typeof valor === 'string' ? valor.trim() : ''
  if (!v) throw httpError(400, `${campo} é obrigatório`)
  return v
}

// id inválido (não numérico) é tratado como inexistente.
function parseId(raw) {
  return /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null
}

// Router CRUD: GET leitor|admin; escrita admin. `handlers` = { list, create, update, remove }.
function crudRouter(base, { list, create, update, remove }) {
  const r = express.Router()
  const leitura = requireRole('leitor', 'admin')
  const escrita = requireRole('admin')
  const comId = (fn) =>
    asyncH(async (req, res) => {
      const id = parseId(req.params.id)
      if (id === null) throw httpError(404, 'Não encontrado')
      return fn(req, res, id)
    })
  r.get(base, leitura, asyncH(async (req, res) => res.json(await list(req.app.locals.pool))))
  r.post(base, escrita, asyncH(async (req, res) => res.status(201).json(await create(req.app.locals.pool, req.body || {}))))
  r.put(`${base}/:id`, escrita, comId(async (req, res, id) => {
    const row = await update(req.app.locals.pool, id, req.body || {})
    if (!row) throw httpError(404, 'Não encontrado')
    res.json(row)
  }))
  r.delete(`${base}/:id`, escrita, comId(async (req, res, id) => {
    const { rowCount } = await remove(req.app.locals.pool, id)
    if (!rowCount) throw httpError(404, 'Não encontrado')
    res.status(204).end()
  }))
  return r
}

module.exports = { asyncH, parseId, crudRouter, runWrite, textoObrigatorio }
