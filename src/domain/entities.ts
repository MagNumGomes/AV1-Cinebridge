export enum Papel {
  DIRETOR = "DIRETOR",
  DIRETOR_FOTOGRAFIA = "DIRETOR_FOTOGRAFIA",
  SONOPLASTA = "SONOPLASTA",
  EDITOR = "EDITOR",
  ROTEIRISTA = "ROTEIRISTA",
  EFETOS_VISUAIS = "EFETOS_VISUAIS"
}

export enum StatusConvite {
  PENDENTE = "PENDENTE",
  ACEITO = "ACEITO",
  RECUSADO = "RECUSADO"
}

export class Competencia {
  constructor(readonly nome: string, readonly peso = 1) {}
}

export class Avaliacao {
  constructor(
    readonly nota: number,
    readonly generoProjeto: string,
    readonly comentario?: string
  ) {}
}

export class Profissional {
  constructor(
    readonly id: string,
    readonly nome: string,
    readonly email: string,
    readonly papeis: Papel[],
    readonly generos: string[],
    readonly competencias: Competencia[],
    readonly avaliacoes: Avaliacao[],
    readonly valorDiaria: number,
    readonly disponivelAte?: Date
  ) {}
}

export class MembroEquipe {
  constructor(readonly papel: Papel, readonly profissional: Profissional) {}
}

export class Equipe {
  constructor(readonly membros: MembroEquipe[]) {}
}

export class Projeto {
  constructor(
    readonly id: string,
    readonly genero: string,
    readonly orcamento: number,
    readonly prazo: Date,
    readonly papeisObrigatorios: Papel[],
    readonly competencias: Record<string, number> = {},
    readonly equipe?: Equipe
  ) {}
}

export class Recomendacao {
  constructor(
    readonly id: string,
    readonly projetoId: string,
    readonly papel: Papel,
    readonly profissional: Profissional,
    readonly pontuacao: number,
    readonly motivo: string
  ) {}
}

export class Convite {
  constructor(
    readonly id: string,
    readonly projetoId: string,
    readonly profissionalId: string,
    readonly status: StatusConvite
  ) {}
}

export interface PontuacaoProfissional {
  profissional: Profissional;
  pontuacao: number;
  motivo: string;
}

export interface MembroSugerido extends PontuacaoProfissional {
  papel: Papel;
}