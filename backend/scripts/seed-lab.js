// Seed idempotente do Postgres do LAB (departamentos e endpoints de exemplo).
// Uso: docker compose -f docker-compose.yml -f docker-compose.lab.yml exec backend node scripts/seed-lab.js
const { loadConfig } = require('../src/config')
const { createPool } = require('../src/db')
const { migrate } = require('../src/migrate')

const DEPARTAMENTOS = ['TI_INFRA', 'FINANCEIRO', 'VAREJO']
const ENDPOINTS = [
  { endpoint: 'db01.infra.lab', criticidade: 4, departamento: 'TI_INFRA', tipo: 'Banco de Dados' },
  { endpoint: 'intranet.lab', criticidade: 2, departamento: 'TI_INFRA', tipo: 'Aplicação Web' },
]

async function main() {
  const pool = createPool(loadConfig(process.env))
  try {
    await migrate(pool)
    for (const nome of DEPARTAMENTOS) {
      await pool.query('INSERT INTO departamento (nome) VALUES ($1) ON CONFLICT DO NOTHING', [nome])
    }
    for (const t of new Set(ENDPOINTS.map((e) => e.tipo))) {
      await pool.query('INSERT INTO tipo (nome) VALUES ($1) ON CONFLICT DO NOTHING', [t])
    }
    for (const e of ENDPOINTS) {
      await pool.query(
        `INSERT INTO departamento_endpoint (endpoint, criticidade, departamento_id, tipo_id)
         VALUES ($1, $2, (SELECT id FROM departamento WHERE nome = $3), (SELECT id FROM tipo WHERE nome = $4))
         ON CONFLICT DO NOTHING`,
        [e.endpoint, e.criticidade, e.departamento, e.tipo]
      )
    }
    const { rows } = await pool.query(
      `SELECT e.endpoint, e.criticidade, d.nome AS departamento, t.nome AS tipo
       FROM departamento_endpoint e
       LEFT JOIN departamento d ON d.id = e.departamento_id
       LEFT JOIN tipo t ON t.id = e.tipo_id
       ORDER BY e.endpoint`
    )
    console.log('Seed do lab aplicado.')
    console.table(rows)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(`Falha no seed do lab: ${err.message}`)
  process.exit(1)
})
