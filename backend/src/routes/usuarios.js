const express = require('express')
const { requireRole } = require('../auth/guards')
const { httpError } = require('../errors')
const { asyncH, parseId } = require('./crudHelpers')
const { hashSenha, gerarSenhaTemporaria } = require('../auth/senha')

const PAPEIS = ['pendente', 'leitor', 'admin']
const COLUNAS = 'id, nome, email, papel, origem, ultimo_login, created_at'
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/

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

  r.post('/usuarios', admin, asyncH(async (req, res) => {
    if (!req.app.locals.config.loginLocal) throw httpError(400, 'login_local_desligado')
    const { nome, email, papel } = req.body || {}
    const nomeOk = typeof nome === 'string' ? nome.trim() : ''
    const emailOk = typeof email === 'string' ? email.trim() : ''
    if (!nomeOk) throw httpError(400, 'Informe o nome')
    if (!EMAIL_RE.test(emailOk)) throw httpError(400, 'Informe um e-mail válido')
    if (!PAPEIS.includes(papel)) throw httpError(400, 'Papel inválido')

    const pool = req.app.locals.pool
    const { rows: existe } = await pool.query('SELECT 1 FROM usuario WHERE lower(email) = lower($1) LIMIT 1', [emailOk])
    if (existe.length) throw httpError(409, 'email_em_uso')

    const senhaTemporaria = gerarSenhaTemporaria()
    let rows
    try {
      ;({ rows } = await pool.query(
        `INSERT INTO usuario (sub, email, nome, papel, origem, senha_hash, trocar_senha)
         VALUES ($1, $2, $3, $4, 'local', $5, true)
         RETURNING id, nome, email, papel, origem`,
        ['local:' + emailOk.toLowerCase(), emailOk, nomeOk, papel, await hashSenha(senhaTemporaria)]
      ))
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'email_em_uso') // corrida: mesmo sub
      throw err
    }
    res.status(201).json({ usuario: rows[0], senhaTemporaria })
  }))

  r.post('/usuarios/:id/redefinir-senha', admin, asyncH(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) throw httpError(404, 'Não encontrado')
    const pool = req.app.locals.pool
    const { rows } = await pool.query('SELECT origem FROM usuario WHERE id = $1', [id])
    if (!rows.length) throw httpError(404, 'Não encontrado')
    if (rows[0].origem !== 'local') throw httpError(400, 'usuario_sso')
    const senhaTemporaria = gerarSenhaTemporaria()
    await pool.query(
      `UPDATE usuario SET senha_hash = $1, trocar_senha = true, falhas_login = 0, bloqueado_ate = NULL
        WHERE id = $2 AND origem = 'local'`,
      [await hashSenha(senhaTemporaria), id]
    )
    res.json({ senhaTemporaria })
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
