const { crudRouter, runWrite, textoObrigatorio } = require('./crudHelpers')
const { httpError } = require('../errors')
const { normalizeHost } = require('../defectdojo/hosts')

const SELECT = `SELECT e.id, e.endpoint, e.criticidade, e.departamento_id, d.nome AS departamento_nome,
                       e.tipo_id, t.nome AS tipo_nome, e.created_at
                  FROM departamento_endpoint e
                  LEFT JOIN departamento d ON d.id = e.departamento_id
                  LEFT JOIN tipo t ON t.id = e.tipo_id`

function idOpcional(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  // Valor fora de int4 ou não inteiro: referência inexistente.
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw httpError(400, 'Referência inválida')
  return n
}

function parseBody(body) {
  const endpoint = textoObrigatorio(body.endpoint, 'endpoint')
  const { criticidade } = body
  if (!Number.isInteger(criticidade) || criticidade < 1 || criticidade > 4) {
    throw httpError(400, 'criticidade deve ser 1 a 4')
  }
  return [endpoint, criticidade, idOpcional(body.departamento_id), idOpcional(body.tipo_id)]
}

const DUP = 'Endpoint já existe'

const endpointsRouter = () =>
  crudRouter('/endpoints', {
    list: async (pool) => (await pool.query(`${SELECT} ORDER BY e.endpoint`)).rows,
    create: async (pool, body) => {
      const vals = parseBody(body)
      const { rows } = await runWrite(
        pool.query(
          `INSERT INTO departamento_endpoint (endpoint, criticidade, departamento_id, tipo_id)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          vals
        ),
        DUP
      )
      // Classificado: sai da lista de ignorados.
      await pool.query('DELETE FROM endpoint_ignorado WHERE host = $1', [normalizeHost(vals[0])])
      return (await pool.query(`${SELECT} WHERE e.id = $1`, [rows[0].id])).rows[0]
    },
    update: async (pool, id, body) => {
      const vals = parseBody(body)
      const { rowCount } = await runWrite(
        pool.query(
          `UPDATE departamento_endpoint SET endpoint=$1, criticidade=$2, departamento_id=$3, tipo_id=$4
            WHERE id = $5`,
          [...vals, id]
        ),
        DUP
      )
      if (!rowCount) return null
      return (await pool.query(`${SELECT} WHERE e.id = $1`, [id])).rows[0]
    },
    remove: (pool, id) => pool.query('DELETE FROM departamento_endpoint WHERE id = $1', [id]),
  })

module.exports = { endpointsRouter }
