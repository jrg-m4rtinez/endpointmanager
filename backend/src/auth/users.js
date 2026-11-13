// BOOTSTRAP_ADMIN_EMAIL só concede o primeiro admin: promove apenas enquanto não existe
// nenhum admin. Depois disso o papel é gerido pela tela Acessos (rebaixar vale de verdade).
async function upsertUserOnLogin(pool, { sub, email, name }, bootstrapEmail) {
  const isBootstrap =
    !!bootstrapEmail && !!email && email.toLowerCase() === bootstrapEmail.toLowerCase()
  const { rows } = await pool.query(
    `INSERT INTO usuario (sub, email, nome, papel, ultimo_login)
     VALUES ($1, $2, $3,
             CASE WHEN $4 AND NOT EXISTS (SELECT 1 FROM usuario WHERE papel = 'admin')
                  THEN 'admin' ELSE 'pendente' END,
             now())
     ON CONFLICT (sub) DO UPDATE SET
       email = EXCLUDED.email,
       nome = EXCLUDED.nome,
       ultimo_login = now(),
       papel = CASE WHEN $4 AND NOT EXISTS (SELECT 1 FROM usuario WHERE papel = 'admin')
                    THEN 'admin' ELSE usuario.papel END
     RETURNING id, sub, email, nome, papel`,
    [sub, email, name, isBootstrap]
  )
  return rows[0]
}

module.exports = { upsertUserOnLogin }
