const crypto = require('node:crypto')
const { hashSenha, verificarSenha, MAXIMO } = require('./senha')

const MAX_FALHAS = 5
const BLOQUEIO = '15 minutes'

// Hash fictício, calculado ao criar o router de auth (eager): e-mail inexistente, conta SSO ou
// bloqueada também pagam um verify, para o tempo de resposta não revelar se a conta existe.
function criarHashFicticio() {
  return hashSenha(crypto.randomBytes(24).toString('hex'))
}

async function falhar(hashFicticio, senha) {
  await verificarSenha(await hashFicticio, typeof senha === 'string' ? senha : '')
  return null
}

// Regra L5: cada falha conta; na 5ª, bloqueia por 15 min e zera o contador.
// Durante o bloqueio nada conta e o bloqueio não é estendido; até a senha certa recebe null.
async function autenticarLocal(pool, email, senha, hashFicticio) {
  if (typeof email !== 'string' || !email.trim() || typeof senha !== 'string' || !senha || senha.length > MAXIMO) {
    return falhar(hashFicticio, senha)
  }
  const { rows } = await pool.query(
    `SELECT id, senha_hash, (bloqueado_ate IS NOT NULL AND bloqueado_ate > now()) AS bloqueado
       FROM usuario
      WHERE origem = 'local' AND lower(email) = lower($1)
      ORDER BY id LIMIT 1`,
    [email.trim()]
  )
  const u = rows[0]
  if (!u || !u.senha_hash || u.bloqueado) return falhar(hashFicticio, senha)

  if (!(await verificarSenha(u.senha_hash, senha))) {
    await pool.query(
      `UPDATE usuario SET
         falhas_login  = CASE WHEN falhas_login + 1 >= $2 THEN 0 ELSE falhas_login + 1 END,
         bloqueado_ate = CASE WHEN falhas_login + 1 >= $2 THEN now() + interval '${BLOQUEIO}' ELSE bloqueado_ate END
       WHERE id = $1 AND (bloqueado_ate IS NULL OR bloqueado_ate <= now())`,
      [u.id, MAX_FALHAS]
    )
    return null
  }

  // Condição repetida: um bloqueio aplicado por request concorrente vence este login.
  const { rows: ok } = await pool.query(
    `UPDATE usuario SET falhas_login = 0, bloqueado_ate = NULL, ultimo_login = now()
      WHERE id = $1 AND (bloqueado_ate IS NULL OR bloqueado_ate <= now())
      RETURNING id, sub, email, nome, papel, origem, trocar_senha`,
    [u.id]
  )
  return ok[0] || null
}

module.exports = { autenticarLocal, criarHashFicticio }
