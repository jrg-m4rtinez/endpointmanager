// Migração aditiva e idempotente. Nunca altera colunas legadas (Grafana lê estas tabelas).
async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento_endpoint (
      id SERIAL PRIMARY KEY,
      endpoint VARCHAR(255) NOT NULL UNIQUE,
      criticidade INTEGER NOT NULL CHECK (criticidade BETWEEN 1 AND 4),
      departamento_id INTEGER REFERENCES departamento(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipo (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
  // ALTER TABLE pega ACCESS EXCLUSIVE mesmo com IF NOT EXISTS: só roda se a coluna faltar.
  const { rows: tipoCol } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'departamento_endpoint' AND column_name = 'tipo_id'`
  )
  if (!tipoCol.length) {
    await pool.query(`
      ALTER TABLE departamento_endpoint
        ADD COLUMN IF NOT EXISTS tipo_id INTEGER REFERENCES tipo(id) ON DELETE SET NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuario (
      id SERIAL PRIMARY KEY,
      sub VARCHAR UNIQUE NOT NULL,
      email VARCHAR,
      nome VARCHAR,
      papel VARCHAR NOT NULL DEFAULT 'pendente' CHECK (papel IN ('pendente','leitor','admin')),
      ultimo_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS endpoint_ignorado (
      id SERIAL PRIMARY KEY,
      host VARCHAR(255) UNIQUE NOT NULL,
      ignorado_por INTEGER REFERENCES usuario(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`)
  await pool.query(`
    INSERT INTO tipo (nome)
    SELECT v.nome FROM (VALUES ('Servidor'), ('Aplicação Web'), ('Banco de Dados')) AS v(nome)
    WHERE NOT EXISTS (SELECT 1 FROM tipo)`)
}

module.exports = { migrate }
