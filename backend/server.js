const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Run migrations on startup
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departamento_endpoint (
      id SERIAL PRIMARY KEY,
      endpoint VARCHAR(255) NOT NULL UNIQUE,
      criticidade INTEGER NOT NULL CHECK (criticidade BETWEEN 1 AND 4),
      departamento_id INTEGER REFERENCES departamento(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Migrations applied.');
}

migrate().catch(console.error);

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ─── Departamentos ────────────────────────────────────────────────────────────

app.get('/departamentos', async (req, res) => {
  const result = await pool.query('SELECT * FROM departamento ORDER BY nome');
  res.json(result.rows);
});

app.post('/departamentos', async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
  try {
    const result = await pool.query(
      'INSERT INTO departamento (nome) VALUES ($1) RETURNING *',
      [nome.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Departamento já existe' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/departamentos/:id', async (req, res) => {
  const { nome } = req.body;
  try {
    const result = await pool.query(
      'UPDATE departamento SET nome = $1 WHERE id = $2 RETURNING *',
      [nome.trim(), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/departamentos/:id', async (req, res) => {
  await pool.query('DELETE FROM departamento WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ─── Endpoints ────────────────────────────────────────────────────────────────

app.get('/endpoints', async (req, res) => {
  const result = await pool.query(`
    SELECT e.*, d.nome AS departamento_nome
    FROM departamento_endpoint e
    LEFT JOIN departamento d ON e.departamento_id = d.id
    ORDER BY e.endpoint
  `);
  res.json(result.rows);
});

app.post('/endpoints', async (req, res) => {
  const { endpoint, criticidade, departamento_id } = req.body;
  if (!endpoint || !criticidade) return res.status(400).json({ error: 'endpoint e criticidade são obrigatórios' });
  try {
    const result = await pool.query(
      'INSERT INTO departamento_endpoint (endpoint, criticidade, departamento_id) VALUES ($1, $2, $3) RETURNING *',
      [endpoint.trim(), criticidade, departamento_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Endpoint já existe' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/endpoints/:id', async (req, res) => {
  const { endpoint, criticidade, departamento_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE departamento_endpoint SET endpoint = $1, criticidade = $2, departamento_id = $3 WHERE id = $4 RETURNING *',
      [endpoint.trim(), criticidade, departamento_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/endpoints/:id', async (req, res) => {
  await pool.query('DELETE FROM departamento_endpoint WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

const PORT = 3001;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
