// Cria (ou redefine) um admin local direto no servidor, para quando ninguém consegue entrar.
// Uso: docker compose exec backend node scripts/criar-admin-local.js <email> "<nome>"
// Só precisa das variáveis PG_*.
const { loadConfig } = require('../src/config')
const { createPool } = require('../src/db')
const { migrate } = require('../src/migrate')
const { hashSenha, gerarSenhaTemporaria } = require('../src/auth/senha')

async function main() {
  const email = (process.argv[2] || '').trim()
  const nome = (process.argv[3] || '').trim()
  if (!email || !nome || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('Uso: node scripts/criar-admin-local.js <email> "<nome>" (informe um e-mail válido e o nome)')
  }
  const config = loadConfig(process.env)
  if (!config.loginLocal) {
    console.warn('Atenção: LOGIN_LOCAL=desligado. O admin será criado, mas não consegue entrar pelo login local enquanto estiver desligado.')
  }
  const pool = createPool(config)
  try {
    await migrate(pool)
    const { rows } = await pool.query(
      'SELECT id, origem FROM usuario WHERE lower(email) = lower($1) ORDER BY id',
      [email]
    )
    if (rows.some((u) => u.origem !== 'local') && !rows.some((u) => u.origem === 'local')) {
      throw new Error(`O e-mail ${email} pertence a um usuário SSO. Ele entra pelo SSO; não é possível criar senha local para ele.`)
    }
    const senhaTemporaria = gerarSenhaTemporaria()
    const hash = await hashSenha(senhaTemporaria)
    const local = rows.find((u) => u.origem === 'local')
    if (local) {
      await pool.query(
        `UPDATE usuario SET senha_hash = $1, trocar_senha = true, falhas_login = 0, bloqueado_ate = NULL, papel = 'admin'
          WHERE id = $2`,
        [hash, local.id]
      )
      console.log(`Usuário local ${email} já existia: senha redefinida e papel admin garantido.`)
    } else {
      await pool.query(
        `INSERT INTO usuario (sub, email, nome, papel, origem, senha_hash, trocar_senha)
         VALUES ($1, $2, $3, 'admin', 'local', $4, true)`,
        ['local:' + email.toLowerCase(), email, nome, hash]
      )
      console.log(`Admin local ${email} criado.`)
    }
    console.log(`Senha temporária: ${senhaTemporaria}`)
    console.log('Entre com ela; é preciso trocar a senha no primeiro login (o sistema vai exigir).')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(`Falha: ${err.message}`)
  process.exit(1)
})
