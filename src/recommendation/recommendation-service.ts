import { randomUUID } from "node:crypto";
import { MembroSugerido, Papel, Projeto, StatusConvite } from "../domain/entities";
import { EventBus } from "../events/recommendation-events";
import { ProfessionalRepository } from "../repositories/professional-repository";
import { InMemoryRecommendationPersistence, RecommendationPersistence } from "../repositories/recommendation-persistence";
import { criarEstrategia } from "./strategies";
import { OrquestradorPadrao, ResultadoOrquestracao } from "../team/orchestrator";

export interface ProjetoInput {
  genero: string;
  orcamento: number;
  prazo: string;
  papeisObrigatorios: Papel[];
  competencias?: Record<string, number>;
}

export interface ResultadoRecomendacao extends ResultadoOrquestracao {
  id: string;
  criadaEm: string;
}

export class ApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export class RecommendationService {
  private readonly sessoes = new Map<string, ResultadoRecomendacao>();
  private readonly limiteSessoes: number;

  constructor(
    private readonly repository: ProfessionalRepository,
    private readonly eventBus: EventBus,
    private readonly estrategiaPadrao: string,
    private readonly persistence: RecommendationPersistence = new InMemoryRecommendationPersistence(),
    limiteSessoes = 10_000
  ) {
    if (!Number.isInteger(limiteSessoes) || limiteSessoes < 1) {
      throw new Error("O limite de sessões deve ser um inteiro positivo");
    }
    this.limiteSessoes = limiteSessoes;
  }

  async recomendar(input: ProjetoInput, estrategiaNome = this.estrategiaPadrao): Promise<ResultadoRecomendacao> {
    const projeto = this.criarProjeto(input);
    const estrategia = criarEstrategia(estrategiaNome);
    const profissionais = await this.repository.listarDisponiveis(projeto);
    const resultado = await new OrquestradorPadrao(estrategia).montarEquipe(projeto, profissionais);
    const recomendacao: ResultadoRecomendacao = {
      ...resultado,
      id: randomUUID(),
      criadaEm: new Date().toISOString()
    };
    this.salvarSessao(recomendacao);
    await this.persistence.salvar(recomendacao);
    for (const membro of recomendacao.membros) this.publicarEvento(recomendacao, membro, "profissional_recomendado");
    return recomendacao;
  }

  async substituirPapel(
    recomendacaoId: string,
    papel: Papel,
    opcoes: { rejeitadoId?: string; substitutoId?: string }
  ): Promise<ResultadoRecomendacao> {
    const atual = this.obterSessao(recomendacaoId);
    if (!atual.projeto.papeisObrigatorios.includes(papel)) {
      throw new ApiError(400, "O papel não faz parte do projeto");
    }
    const membroAtual = atual.membros.find((membro) => membro.papel === papel);
    const papeisFixos = atual.membros.filter((membro) => membro.papel !== papel);
    const profissionais = await this.repository.listarDisponiveis(atual.projeto);
    const estrategia = criarEstrategia(atual.estrategia);
    const excluidos = new Set([opcoes.rejeitadoId, membroAtual?.profissional.id].filter(
      (id): id is string => Boolean(id)
    ));

    if (opcoes.substitutoId) {
      const profissional = profissionais.find((item) => item.id === opcoes.substitutoId);
      if (!profissional || !profissional.papeis.includes(papel)) {
        throw new ApiError(400, "O substituto não está disponível para o papel solicitado");
      }
      if (papeisFixos.some((membro) => membro.profissional.id === profissional.id)) {
        throw new ApiError(400, "O profissional já ocupa outro papel na equipe");
      }
      excluidos.delete(profissional.id);
    }

    const orquestrador = new OrquestradorPadrao(estrategia);
    let resultado: ResultadoOrquestracao;
    if (opcoes.substitutoId) {
      const ranking = estrategia.pontuar(atual.projeto, papel, profissionais);
      const item = ranking.find((candidato) => candidato.profissional.id === opcoes.substitutoId);
      if (!item) throw new ApiError(400, "Não foi possível pontuar o substituto");
      resultado = await orquestrador.montarEquipe(atual.projeto, profissionais, {
        papeisAlvo: [],
        membrosFixos: [...papeisFixos, { papel, ...item }]
      });
    } else {
      resultado = await orquestrador.montarEquipe(atual.projeto, profissionais, {
        papeisAlvo: [papel],
        membrosFixos: papeisFixos,
        profissionaisExcluidos: [...excluidos]
      });
    }

    const atualizada: ResultadoRecomendacao = {
      ...atual,
      membros: resultado.membros,
      parcial: resultado.membros.length < atual.projeto.papeisObrigatorios.length,
      criadaEm: new Date().toISOString()
    };
    this.salvarSessao(atualizada);
    await this.persistence.salvar(atualizada);
    const novoMembro = atualizada.membros.find((membro) => membro.papel === papel);
    if (novoMembro) this.publicarEvento(atualizada, novoMembro, "profissional_recomendado");
    return atualizada;
  }

  async reavaliar(
    recomendacaoId: string,
    input: ProjetoInput,
    estrategiaNome?: string
  ): Promise<ResultadoRecomendacao> {
    const anterior = this.obterSessao(recomendacaoId);
    const prazoAnterior = anterior.projeto.prazo.getTime();
    const prazoNovo = new Date(input.prazo).getTime();
    const variacaoOrcamento = Math.abs(input.orcamento - anterior.projeto.orcamento)
      / Math.max(anterior.projeto.orcamento, 1);
    const variacaoPrazoDias = Math.abs(prazoNovo - prazoAnterior) / (1000 * 60 * 60 * 24);
    const papeisAlterados = input.papeisObrigatorios.some((papel) => !anterior.projeto.papeisObrigatorios.includes(papel))
      || anterior.projeto.papeisObrigatorios.some((papel) => !input.papeisObrigatorios.includes(papel));
    if (variacaoOrcamento < 0.2 && variacaoPrazoDias < 7 && !papeisAlterados) {
      throw new ApiError(400, "A alteração não atinge o limite para reavaliação completa");
    }
    return this.recomendar(input, estrategiaNome ?? anterior.estrategia);
  }

  async responderConvite(
    recomendacaoId: string,
    papel: Papel,
    status: "ACEITO" | "RECUSADO"
  ): Promise<ResultadoRecomendacao> {
    const recomendacao = this.obterSessao(recomendacaoId);
    const membro = recomendacao.membros.find((item) => item.papel === papel);
    if (!membro) throw new ApiError(404, "Não há convite associado a este papel");
    await this.persistence.registrarConvite(
      recomendacao,
      papel,
      status === "ACEITO" ? StatusConvite.ACEITO : StatusConvite.RECUSADO
    );
    this.publicarEvento(recomendacao, membro, status === "ACEITO" ? "convite_aceito" : "convite_recusado");
    return recomendacao;
  }

  private criarProjeto(input: ProjetoInput): Projeto {
    return new Projeto(
      randomUUID(),
      input.genero,
      input.orcamento,
      new Date(input.prazo),
      input.papeisObrigatorios,
      input.competencias ?? {}
    );
  }

  private obterSessao(id: string): ResultadoRecomendacao {
    const sessao = this.sessoes.get(id);
    if (!sessao) throw new ApiError(404, "Recomendação não encontrada");
    return sessao;
  }

  private salvarSessao(recomendacao: ResultadoRecomendacao): void {
    this.sessoes.delete(recomendacao.id);
    if (this.sessoes.size >= this.limiteSessoes) {
      const maisAntiga = this.sessoes.keys().next().value as string | undefined;
      if (maisAntiga !== undefined) this.sessoes.delete(maisAntiga);
    }
    this.sessoes.set(recomendacao.id, recomendacao);
  }

  private publicarEvento(
    recomendacao: ResultadoRecomendacao,
    membro: MembroSugerido,
    tipo: "profissional_recomendado" | "convite_aceito" | "convite_recusado"
  ): void {
    this.eventBus.publicar({
      tipo,
      projetoId: recomendacao.projeto.id,
      papel: membro.papel,
      profissionalId: membro.profissional.id,
      recomendacaoId: recomendacao.id,
      ocorridoEm: new Date().toISOString()
    });
  }
}