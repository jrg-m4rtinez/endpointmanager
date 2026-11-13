// Valor da opção "Sem departamento" / "Sem tipo" no select; vira null no envio.
export const SEM = 'sem'

export const idOuNull = v => (typeof v === 'number' ? v : null)

/** [{ id, nome }] → opções do InlineSelect, com "Sem …" no topo. */
export function opcoesComSem(lista, rotuloSem) {
  return [{ value: SEM, label: rotuloSem }, ...lista.map(x => ({ value: x.id, label: x.nome }))]
}
