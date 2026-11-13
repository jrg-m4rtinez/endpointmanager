import { describe, it, expect } from 'vitest'
import { assertRequiredEnv, REQUIRED_VARS } from '../src/config'
import { emailFromClaims } from '../src/auth/oidc'

describe('assertRequiredEnv', () => {
  const full = Object.fromEntries(REQUIRED_VARS.map((k) => [k, 'x']))

  it('aceita env completo sem DD_*', () => {
    expect(() => assertRequiredEnv(full)).not.toThrow()
  })

  it('lista as variáveis ausentes em pt-BR', () => {
    const env = { ...full, SESSION_SECRET: '', OIDC_ISSUER: undefined }
    expect(() => assertRequiredEnv(env)).toThrow(
      /Variáveis de ambiente obrigatórias ausentes: SESSION_SECRET, OIDC_ISSUER/
    )
  })
})

describe('emailFromClaims', () => {
  it('usa email, depois preferred_username', () => {
    expect(emailFromClaims({ email: 'a@x', preferred_username: 'b@x' })).toBe('a@x')
    expect(emailFromClaims({ preferred_username: 'b@x' })).toBe('b@x')
  })

  it('email_verified ausente (Entra) é aceito', () => {
    expect(emailFromClaims({ email: 'a@x' })).toBe('a@x')
  })

  it('email_verified === false → null', () => {
    expect(emailFromClaims({ email: 'a@x', email_verified: false })).toBeNull()
  })
})
