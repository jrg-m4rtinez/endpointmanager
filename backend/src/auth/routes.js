const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { upsertUserOnLogin } = require('./users')
const { requireAuth, requireXhrOnWrite } = require('./guards')
const { COOKIE_NAME } = require('./session')
const { autenticarLocal } = require('./local')
const { hashSenha, verificarSenha, validarNovaSenha } = require('./senha')

function regenerar(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())))
}
function salvar(req) {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())))
}

function authRouter({ pool, oidc, config }) {
  const r = express.Router()

  r.get('/auth/login', async (req, res, next) => {
    try {
      res.redirect(await oidc.startLogin(req.session))
    } catch (err) {
      next(err)
    }
  })

  r.get('/auth/callback', async (req, res) => {
    try {
      // O nginx remove o prefixo /api; reconstrói a URL pública para casar com o redirect_uri.
      const currentUrl = new URL(config.appBaseUrl.replace(/\/+$/, '') + '/api' + req.originalUrl)
      const claims = await oidc.finishLogin(req.session, currentUrl)
      const user = await upsertUserOnLogin(pool, claims, config.bootstrapAdminEmail)
      await regenerar(req)
      req.session.userId = user.id
      req.session.idToken = claims.idToken
      await salvar(req)
      res.redirect(config.appBaseUrl + '/')
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') console.error('falha no login OIDC:', err.message)
      res.redirect('/?erro=login')
    }
  })

  r.get('/auth/me', requireAuth, (req, res) => {
    const { id, nome, email, papel, origem, trocar_senha } = req.user
    res.json({ id, nome, email, papel, origem, trocarSenha: trocar_senha })
  })

  r.get('/auth/config', (req, res) => {
    res.json({ local: config.loginLocal })
  })

  if (!config.loginLocal) {
    r.use('/auth/local', (req, res) => res.status(404).json({ error: 'Não encontrado' }))
  } else {
    // Limite por IP (por instância do app). Conta login e troca de senha juntos.
    const limiteLocal = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ error: 'muitas_tentativas' }),
    })

    r.post('/auth/local/login', requireXhrOnWrite, limiteLocal, async (req, res, next) => {
      try {
        const { email, senha } = req.body || {}
        const user = await autenticarLocal(pool, email, senha)
        if (!user) return res.status(401).json({ error: 'credenciais_invalidas' })
        await regenerar(req)
        req.session.userId = user.id
        await salvar(req)
        res.json({ trocarSenha: user.trocar_senha })
      } catch (err) {
        next(err)
      }
    })

    // Sem requireSenhaTrocada: é aqui que a senha temporária é trocada.
    r.post('/auth/local/senha', requireXhrOnWrite, requireAuth, limiteLocal, async (req, res, next) => {
      try {
        if (req.user.origem !== 'local') return res.status(400).json({ error: 'usuario_sso' })
        const { senhaAtual, novaSenha } = req.body || {}
        const invalida = validarNovaSenha(novaSenha)
        if (invalida) return res.status(400).json({ error: invalida })
        const { rows } = await pool.query('SELECT senha_hash FROM usuario WHERE id = $1', [req.user.id])
        if (!(await verificarSenha(rows[0] && rows[0].senha_hash, senhaAtual))) {
          return res.status(400).json({ error: 'senha_atual_incorreta' })
        }
        if (novaSenha === senhaAtual) {
          return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' })
        }
        await pool.query(
          `UPDATE usuario SET senha_hash = $1, trocar_senha = false, falhas_login = 0, bloqueado_ate = NULL
            WHERE id = $2`,
          [await hashSenha(novaSenha), req.user.id]
        )
        res.json({ ok: true })
      } catch (err) {
        next(err)
      }
    })
  }

  r.post('/auth/logout', requireXhrOnWrite, (req, res, next) => {
    const idToken = req.session && req.session.idToken
    const redirect = (idToken && oidc.logoutUrl(idToken)) || '/'
    req.session.destroy((err) => {
      if (err) return next(err)
      res.clearCookie(COOKIE_NAME)
      res.json({ redirect })
    })
  })

  return r
}

module.exports = { authRouter }
