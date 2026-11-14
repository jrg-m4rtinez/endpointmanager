// Cliente HTTP do frontend. Todas as rotas passam por /api (nginx → backend).

const MENSAGENS = {
  nao_autenticado: 'Sua sessão expirou. Faça login novamente.',
  aguardando_liberacao: 'Seu acesso ainda aguarda liberação por um administrador.',
  sem_permissao: 'Você não tem permissão para realizar esta ação.',
  csrf: 'Requisição bloqueada por segurança. Recarregue a página e tente de novo.',
  defectdojo_indisponivel: 'O DefectDojo está indisponível no momento. Tente novamente em instantes.',
  defectdojo_nao_configurado: 'A integração com o DefectDojo não está configurada.',
  ultimo_admin: 'Não é possível remover ou rebaixar o último administrador.',
  credenciais_invalidas: 'E-mail ou senha inválidos.',
  muitas_tentativas: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  trocar_senha: 'Troque sua senha temporária antes de continuar.',
  senha_atual_incorreta: 'A senha atual está incorreta.',
  email_em_uso: 'Já existe um usuário com este e-mail.',
  usuario_sso: 'Este usuário entra com a Microsoft e não tem senha local.',
  login_local_desligado: 'O login com e-mail e senha está desligado neste servidor.',
}

// Eventos globais tratados pelo App (quem chamou a API pode estar em qualquer página).
export const EVENTO_SESSAO_EXPIRADA = 'sessao-expirada'
export const EVENTO_TROCAR_SENHA = 'trocar-senha'

// O 401 do próprio login local significa "credenciais inválidas", não sessão expirada.
const ROTA_LOGIN_LOCAL = '/auth/local/login'

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

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const code = data?.error
    // 401 → o App mostra a tela de Login; 403 trocar_senha → o App recarrega /auth/me e mostra TrocarSenha.
    if (res.status === 401 && path !== ROTA_LOGIN_LOCAL) {
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    } else if (res.status === 403 && code === 'trocar_senha') {
      window.dispatchEvent(new Event(EVENTO_TROCAR_SENHA))
    }
    throw new ApiError(res.status, code, mensagemPara(res.status, code), data?.detalhe)
  }
  return data
}

export async function logout() {
  const { redirect } = await api('/auth/logout', { method: 'POST' })
  window.location.href = redirect || '/'
}
