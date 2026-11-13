const crypto = require('node:crypto')
const argon2 = require('@node-rs/argon2')

// argon2id com os parâmetros padrão da lib (spec L2).
const OPCOES = { algorithm: argon2.Algorithm.Argon2id }

// Sem 0 O 1 l I, para a senha temporária ser ditada sem confusão.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const TAMANHO_TEMPORARIA = 16
const MINIMO = 12
// Teto só para não fazer hash de textos enormes.
const MAXIMO = 256

function hashSenha(texto) {
  return argon2.hash(texto, OPCOES)
}

// Hash malformado ou entrada inválida → false (nunca lança).
async function verificarSenha(hash, texto) {
  if (typeof hash !== 'string' || typeof texto !== 'string') return false
  try {
    return await argon2.verify(hash, texto)
  } catch (_) {
    return false
  }
}

function gerarSenhaTemporaria() {
  let s = ''
  for (let i = 0; i < TAMANHO_TEMPORARIA; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)]
  return s
}

function validarNovaSenha(texto) {
  if (typeof texto !== 'string' || !texto) return 'Informe a nova senha'
  if (texto.length < MINIMO) return `A nova senha deve ter no mínimo ${MINIMO} caracteres`
  if (texto.length > MAXIMO) return `A nova senha deve ter no máximo ${MAXIMO} caracteres`
  return null
}

module.exports = { hashSenha, verificarSenha, gerarSenhaTemporaria, validarNovaSenha, MAXIMO }
