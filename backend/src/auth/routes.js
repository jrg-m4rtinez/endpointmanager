const express = require('express')
const { upsertUserOnLogin } = require('./users')
const { requireAuth, requireXhrOnWrite } = require('./guards')
const { COOKIE_NAME } = require('./session')

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
      const currentUrl = new URL(req.originalUrl, config.appBaseUrl)
      const claims = await oidc.finishLogin(req.session, currentUrl)
      const user = await upsertUserOnLogin(pool, claims, config.bootstrapAdminEmail)
      await new Promise((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve()))
      )
      req.session.userId = user.id
      req.session.idToken = claims.idToken
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      )
      res.redirect(config.appBaseUrl + '/')
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') console.error('falha no login OIDC:', err.message)
      res.redirect('/?erro=login')
    }
  })

  r.get('/auth/me', requireAuth, (req, res) => {
    const { id, nome, email, papel } = req.user
    res.json({ id, nome, email, papel })
  })

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
