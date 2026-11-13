const { crudRouter, runWrite, textoObrigatorio } = require('./crudHelpers')

// CRUD de tabelas { id, nome UNIQUE, created_at } referenciadas por departamento_endpoint.fk.
// `tabela` e `fk` são constantes internas, nunca entrada do usuário.
function nomeRouter({ base, tabela, fk, rotulo }) {
  const dup = `${rotulo} já existe`
  return crudRouter(base, {
    list: async (pool) =>
      (await pool.query(
        `SELECT t.id, t.nome, t.created_at, COUNT(e.id)::int AS total_endpoints
           FROM ${tabela} t LEFT JOIN departamento_endpoint e ON e.${fk} = t.id
          GROUP BY t.id ORDER BY t.nome`
      )).rows,
    create: async (pool, body) => {
      const nome = textoObrigatorio(body.nome, 'nome')
      const { rows } = await runWrite(
        pool.query(`INSERT INTO ${tabela} (nome) VALUES ($1) RETURNING id, nome, created_at`, [nome]),
        dup
      )
      return { ...rows[0], total_endpoints: 0 }
    },
    update: async (pool, id, body) => {
      const nome = textoObrigatorio(body.nome, 'nome')
      const { rows } = await runWrite(
        pool.query(
          `UPDATE ${tabela} SET nome = $1 WHERE id = $2
           RETURNING id, nome, created_at,
             (SELECT COUNT(*)::int FROM departamento_endpoint WHERE ${fk} = $2) AS total_endpoints`,
          [nome, id]
        ),
        dup
      )
      return rows[0]
    },
    remove: (pool, id) => pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [id]),
  })
}

module.exports = { nomeRouter }
