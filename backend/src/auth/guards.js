// Papel é relido do banco a cada request: mudança de papel vale na hora.
async function requireAuth(req, res, next) {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'nao_autenticado' })
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, sub, email, nome, papel FROM usuario WHERE id = $1',
      [userId]
    )
    if (!rows[0]) return res.status(401).json({ error: 'nao_autenticado' })
    req.user = rows[0]
    next()
  } catch (err) {
    next(err)
  }
}

function requireRole(...papeis) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'nao_autenticado' })
    if (papeis.includes(req.user.papel)) return next()
    const error = req.user.papel === 'pendente' ? 'aguardando_liberacao' : 'sem_permissao'
    res.status(403).json({ error })
  }
}

function requireXhrOnWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'csrf' })
  }
  next()
}

module.exports = { requireAuth, requireRole, requireXhrOnWrite }
