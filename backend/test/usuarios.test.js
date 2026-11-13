import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import { buildTestApp, loginAs } from './helpers/app'

let ctx
afterEach(async () => {
  if (ctx) await ctx.drop()
  ctx = null
})

const X = { 'X-Requested-With': 'XMLHttpRequest' }

async function setup() {
  ctx = await buildTestApp()
  const admin = request.agent(ctx.app)
  await loginAs(admin, { sub: 'adm', email: 'adm@lab.local', name: 'Adm' })
  await ctx.pool.query("UPDATE usuario SET papel = 'admin' WHERE sub = 'adm'")
  return admin
}
async function novoUsuario(sub, nome) {
  const ag = request.agent(ctx.app)
  await loginAs(ag, { sub, email: `${sub}@lab.local`, name: nome })
  const { rows } = await ctx.pool.query('SELECT id FROM usuario WHERE sub = $1', [sub])
  return { ag, id: rows[0].id }
}

describe('usuarios', () => {
  it('admin lista usuários, pendentes primeiro', async () => {
    const admin = await setup()
    await novoUsuario('p1', 'Zé Pendente')
    const r = await admin.get('/usuarios')
    expect(r.status).toBe(200)
    expect(r.body.map((u) => u.papel)).toEqual(['pendente', 'admin'])
    expect(Object.keys(r.body[0]).sort()).toEqual(['created_at', 'email', 'id', 'nome', 'origem', 'papel', 'ultimo_login'])
  })

  it('admin promove pendente a leitor; o leitor passa a ter GET /endpoints 200 sem novo login', async () => {
    const admin = await setup()
    const { ag, id } = await novoUsuario('p1', 'Pendente')
    expect((await ag.get('/endpoints')).status).toBe(403)
    const r = await admin.put(`/usuarios/${id}`).set(X).send({ papel: 'leitor' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ id, papel: 'leitor' })
    expect((await ag.get('/endpoints')).status).toBe(200)
  })

  it('rebaixar o único admin → 409 ultimo_admin', async () => {
    const admin = await setup()
    const { rows } = await ctx.pool.query("SELECT id FROM usuario WHERE sub = 'adm'")
    const r = await admin.put(`/usuarios/${rows[0].id}`).set(X).send({ papel: 'leitor' })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('ultimo_admin')
  })

  it('com 2 admins, rebaixar um → 200', async () => {
    const admin = await setup()
    const { id } = await novoUsuario('a2', 'Outro')
    await ctx.pool.query("UPDATE usuario SET papel = 'admin' WHERE id = $1", [id])
    const r = await admin.put(`/usuarios/${id}`).set(X).send({ papel: 'leitor' })
    expect(r.status).toBe(200)
    expect(r.body.papel).toBe('leitor')
  })

  it('papel inválido → 400; id inexistente → 404', async () => {
    const admin = await setup()
    const { id } = await novoUsuario('p1', 'P')
    expect((await admin.put(`/usuarios/${id}`).set(X).send({ papel: 'root' })).status).toBe(400)
    expect((await admin.put(`/usuarios/${id}`).set(X).send({})).status).toBe(400)
    expect((await admin.put('/usuarios/99999').set(X).send({ papel: 'leitor' })).status).toBe(404)
    expect((await admin.put('/usuarios/abc').set(X).send({ papel: 'leitor' })).status).toBe(404)
  })

  it('leitor em GET /usuarios → 403', async () => {
    await setup()
    const { ag, id } = await novoUsuario('l1', 'Leitor')
    await ctx.pool.query("UPDATE usuario SET papel = 'leitor' WHERE id = $1", [id])
    expect((await ag.get('/usuarios')).status).toBe(403)
  })
})
