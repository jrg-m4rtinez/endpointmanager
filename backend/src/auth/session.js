const session = require('express-session')
const PgStore = require('connect-pg-simple')(session)

const COOKIE_NAME = 'em.sid'
const EIGHT_HOURS = 8 * 60 * 60 * 1000

function sessionMiddleware(pool, config) {
  if (!config.sessionSecret) throw new Error('SESSION_SECRET é obrigatório')
  return session({
    name: COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgStore({ pool, tableName: 'em_sessao', createTableIfMissing: true }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!config.secureCookies,
      maxAge: EIGHT_HOURS,
    },
  })
}

module.exports = { sessionMiddleware, COOKIE_NAME }
