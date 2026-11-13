// Cliente HTTP do frontend. Todas as rotas passam por /api (nginx → backend).

const MENSAGENS = {
  nao_autenticado: 'Sua sessão expirou. Faça login novamente.',
  aguardando_liberacao: 'Seu acesso ainda aguarda liberação por um administrador.',
  sem_permissao: 'Você não tem permissão para realizar esta ação.',
  csrf: 'Requisição bloqueada por segurança. Recarregue a página e tente de novo.',
  defectdojo_indisponivel: 'O DefectDojo está indisponível no momento. Tente novamente em instantes.',
  defectdojo_nao_configurado: 'A integração com o DefectDojo não está configurada.',
  ultimo_admin: 'Não é possível remover ou rebaixar o último administrador.',
}

export class ApiError extends Error {
  constructor(status, code, message, detalhe) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detalhe = detalhe
  }
}

// Códigos são snake_case; qualquer outra coisa é mensagem pt-BR vinda do backend.
const ehCodigo = s => typeof s === 'string' && /^[a-z0-9_]+$/.test(s)

function mensagemPara(status, code) {
  if (code && MENSAGENS[code]) return MENSAGENS[code]
  if (typeof code === 'string' && code && !ehCodigo(code)) return code
  if (status >= 500) return `Erro no servidor (HTTP ${status}). Tente novamente.`
  return `Não foi possível concluir a operação (HTTP ${status}).`
}

export function irParaLogin() {
  window.location.href = '/api/auth/login'
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
  const init = { method, credentials: 'same-origin', headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch('/api' + path, init)
  } catch {
    throw new ApiError(0, 'rede', 'Não foi possível contatar o servidor. Verifique sua conexão.')
  }

  if (res.status === 204) return null

  if (res.status === 401) {
    irParaLogin()
    // A página está saindo: não resolve para não piscar erros na tela.
    return new Promise(() => {})
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const code = data?.error
    throw new ApiError(res.status, code, mensagemPara(res.status, code), data?.detalhe)
  }
  return data
}

export async function logout() {
  const { redirect } = await api('/auth/logout', { method: 'POST' })
  window.location.href = redirect || '/'
}
