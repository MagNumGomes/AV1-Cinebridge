import { MembroSugerido, Papel, Projeto, Profissional } from "../domain/entities";
import { RecomendacaoStrategy } from "../recommendation/strategies";

export interface OpcoesOrquestracao {
  papeisAlvo?: Papel[];
  membrosFixos?: MembroSugerido[];
  profissionaisExcluidos?: string[];
}

export interface ResultadoOrquestracao {
  projeto: Projeto;
  estrategia: string;
  membros: MembroSugerido[];
  parcial: boolean;
}

export abstract class OrquestradorEquipe {
  constructor(protected readonly estrategia: RecomendacaoStrategy) {}

  async montarEquipe(
    projeto: Projeto,
    profissionais: Profissional[],
    opcoes: OpcoesOrquestracao = {}
  ): Promise<ResultadoOrquestracao> {
    this.validarRestricoes(projeto, profissionais);
    const projetoNormalizado = this.normalizarDados(projeto);
    const papeisAlvo = opcoes.papeisAlvo ?? projetoNormalizado.papeisObrigatorios;
    const membros = [...(opcoes.membrosFixos ?? [])];
    const idsUsados = new Set(membros.map((membro) => membro.profissional.id));
    const excluidos = new Set(opcoes.profissionaisExcluidos ?? []);

    for (const papel of papeisAlvo) {
      const ranking = this.estrategia.pontuar(projetoNormalizado, papel, profissionais);
      const escolhido = ranking.find((item) => !idsUsados.has(item.profissional.id)
        && !excluidos.has(item.profissional.id));
      if (!escolhido) continue;
      membros.push({ papel, ...escolhido });
      idsUsados.add(escolhido.profissional.id);
    }

    const membrosPosProcessados = this.posProcessar(projetoNormalizado, membros);
    return {
      projeto: new Projeto(
        projetoNormalizado.id,
        projetoNormalizado.genero,
        projetoNormalizado.orcamento,
        projetoNormalizado.prazo,
        projetoNormalizado.papeisObrigatorios,
        projetoNormalizado.competencias
      ),
      estrategia: this.estrategia.nome,
      membros: membrosPosProcessados,
      parcial: membrosPosProcessados.length < projetoNormalizado.papeisObrigatorios.length
    };
  }

  protected abstract validarRestricoes(projeto: Projeto, profissionais: Profissional[]): void;
  protected abstract normalizarDados(projeto: Projeto): Projeto;
  protected abstract posProcessar(projeto: Projeto, membros: MembroSugerido[]): MembroSugerido[];
}

export class OrquestradorPadrao extends OrquestradorEquipe {
  protected validarRestricoes(projeto: Projeto): void {
    if (!Number.isFinite(projeto.orcamento) || projeto.orcamento <= 0) {
      throw new Error("O orçamento deve ser maior que zero");
    }
    if (!Number.isFinite(projeto.prazo.getTime())) throw new Error("Prazo inválido");
    if (projeto.papeisObrigatorios.length === 0) throw new Error("Informe ao menos um papel obrigatório");
  }

  protected normalizarDados(projeto: Projeto): Projeto {
    const papeisUnicos = [...new Set(projeto.papeisObrigatorios)];
    const competencias = Object.fromEntries(
      Object.entries(projeto.competencias).map(([nome, peso]) => [nome.trim().toLowerCase(), peso])
    );
    return new Projeto(
      projeto.id,
      projeto.genero.trim().toLowerCase(),
      projeto.orcamento,
      projeto.prazo,
      papeisUnicos,
      competencias,
      projeto.equipe
    );
  }

  protected posProcessar(_projeto: Projeto, membros: MembroSugerido[]): MembroSugerido[] {
    return [...membros].sort((a, b) => a.papel.localeCompare(b.papel));
  }
}