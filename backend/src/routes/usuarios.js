const express = require('express')
const { requireRole } = require('../auth/guards')
const { httpError } = require('../errors')
const { asyncH, parseId } = require('./crudHelpers')

const PAPEIS = ['pendente', 'leitor', 'admin']
const COLUNAS = 'id, nome, email, papel, ultimo_login, created_at'

function usuariosRouter() {
  const r = express.Router()
  const admin = requireRole('admin')

  r.get('/usuarios', admin, asyncH(async (req, res) => {
    const { rows } = await req.app.locals.pool.query(
      `SELECT ${COLUNAS} FROM usuario
        ORDER BY (papel = 'pendente') DESC, nome, id`
    )
    res.json(rows)
  }))

  r.put('/usuarios/:id', admin, asyncH(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) throw httpError(404, 'Não encontrado')
    const papel = (req.body || {}).papel
    if (!PAPEIS.includes(papel)) throw httpError(400, 'Papel inválido')

    const client = await req.app.locals.pool.connect()
    try {
      await client.query('BEGIN')
      // Trava as linhas de admin: checagem + update serializados.
      const { rows: admins } = await client.query(
        "SELECT id FROM usuario WHERE papel = 'admin' ORDER BY id FOR UPDATE"
      )
      const { rows: alvo } = await client.query(
        'SELECT id, papel FROM usuario WHERE id = $1 FOR UPDATE', [id]
      )
      if (!alvo.length) {
        await client.query('ROLLBACK')
        throw httpError(404, 'Não encontrado')
      }
      if (alvo[0].papel === 'admin' && papel !== 'admin' && admins.length <= 1) {
        await client.query('ROLLBACK')
        throw httpError(409, 'ultimo_admin')
      }
      const { rows } = await client.query(
        `UPDATE usuario SET papel = $1 WHERE id = $2 RETURNING ${COLUNAS}`, [papel, id]
      )
      await client.query('COMMIT')
      res.json(rows[0])
    } catch (err) {
      try { await client.query('ROLLBACK') } catch (_) { /* já encerrada */ }
      throw err
    } finally {
      client.release()
    }
  }))

  return r
}

module.exports = { usuariosRouter }
