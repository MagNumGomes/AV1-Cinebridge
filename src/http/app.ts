import Fastify, { FastifyInstance } from "fastify";
import { Papel } from "../domain/entities";
import { EventBus } from "../events/recommendation-events";
import { ProfessionalRepository } from "../repositories/professional-repository";
import { ApiError, ProjetoInput, RecommendationService } from "../recommendation/recommendation-service";
import { criarEstrategia } from "../recommendation/strategies";
import { InMemoryRecommendationPersistence, RecommendationPersistence } from "../repositories/recommendation-persistence";

const papeisValidos = new Set<string>(Object.values(Papel));

function validarProjeto(body: unknown): ProjetoInput {
  if (typeof body !== "object" || body === null) throw new ApiError(400, "Corpo da requisição inválido");
  const dado = body as Record<string, unknown>;
  if (typeof dado.genero !== "string" || dado.genero.trim().length === 0) {
    throw new ApiError(400, "Gênero é obrigatório");
  }
  if (typeof dado.orcamento !== "number" || !Number.isFinite(dado.orcamento) || dado.orcamento <= 0) {
    throw new ApiError(400, "Orçamento deve ser um número positivo");
  }
  if (typeof dado.prazo !== "string" || !Number.isFinite(new Date(dado.prazo).getTime())) {
    throw new ApiError(400, "Prazo deve ser uma data válida");
  }
  if (!Array.isArray(dado.papeisObrigatorios) || dado.papeisObrigatorios.length === 0
    || !dado.papeisObrigatorios.every((papel) => typeof papel === "string" && papeisValidos.has(papel))) {
    throw new ApiError(400, "Informe papéis obrigatórios válidos");
  }
  if (dado.competencias !== undefined && (typeof dado.competencias !== "object" || dado.competencias === null
    || Array.isArray(dado.competencias)
    || !Object.values(dado.competencias).every((peso) => typeof peso === "number" && Number.isFinite(peso)))) {
    throw new ApiError(400, "Competências devem mapear nomes para pesos numéricos");
  }
  return {
    genero: dado.genero,
    orcamento: dado.orcamento,
    prazo: dado.prazo,
    papeisObrigatorios: dado.papeisObrigatorios as Papel[],
    competencias: dado.competencias as Record<string, number> | undefined
  };
}

export function criarApp(
  repository: ProfessionalRepository,
  eventBus: EventBus,
  estrategiaPadrao: string,
  persistence: RecommendationPersistence = new InMemoryRecommendationPersistence()
): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const service = new RecommendationService(repository, eventBus, estrategiaPadrao, persistence);

  app.setErrorHandler((erro, _request, reply) => {
    const statusCode = erro instanceof ApiError ? erro.statusCode : 500;
    if (statusCode >= 500) app.log.error(erro);
    const mensagem = erro instanceof Error ? erro.message : "Erro interno";
    reply.status(statusCode).send({ erro: statusCode === 500 ? "Erro interno" : mensagem });
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/recommendations", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const projeto = validarProjeto(request.body);
    const strategy = body?.strategy;
    if (strategy !== undefined && typeof strategy !== "string") throw new ApiError(400, "strategy deve ser texto");
    if (typeof strategy === "string") {
      try { criarEstrategia(strategy); } catch { throw new ApiError(400, "Estratégia desconhecida"); }
    }
    const resultado = await service.recomendar(projeto, strategy as string | undefined);
    return reply.status(201).send(resultado);
  });

  app.post<{ Params: { recommendationId: string; papel: string } }>(
    "/recommendations/:recommendationId/roles/:papel/replacements",
    async (request) => {
      if (!papeisValidos.has(request.params.papel)) throw new ApiError(400, "Papel inválido");
      if (typeof request.body !== "object" || request.body === null) throw new ApiError(400, "Corpo da requisição inválido");
      const body = request.body as Record<string, unknown>;
      if (body.rejeitadoId !== undefined && typeof body.rejeitadoId !== "string") {
        throw new ApiError(400, "rejeitadoId deve ser texto");
      }
      if (body.substitutoId !== undefined && typeof body.substitutoId !== "string") {
        throw new ApiError(400, "substitutoId deve ser texto");
      }
      return service.substituirPapel(request.params.recommendationId, request.params.papel as Papel, {
        rejeitadoId: body.rejeitadoId as string | undefined,
        substitutoId: body.substitutoId as string | undefined
      });
    }
  );

  app.post<{ Params: { recommendationId: string } }>(
    "/recommendations/:recommendationId/reassess",
    async (request) => {
      const body = request.body as Record<string, unknown>;
      const projeto = validarProjeto(body?.project);
      const strategy = body?.strategy;
      if (strategy !== undefined && typeof strategy !== "string") throw new ApiError(400, "strategy deve ser texto");
      if (typeof strategy === "string") {
        try { criarEstrategia(strategy); } catch { throw new ApiError(400, "Estratégia desconhecida"); }
      }
      return service.reavaliar(request.params.recommendationId, projeto, strategy as string | undefined);
    }
  );

  app.post<{ Params: { recommendationId: string; papel: string } }>(
    "/recommendations/:recommendationId/invitations/:papel/respond",
    async (request) => {
      if (!papeisValidos.has(request.params.papel)) throw new ApiError(400, "Papel inválido");
      const body = request.body as Record<string, unknown>;
      if (body?.status !== "ACEITO" && body?.status !== "RECUSADO") {
        throw new ApiError(400, "status deve ser ACEITO ou RECUSADO");
      }
      return service.responderConvite(
        request.params.recommendationId,
        request.params.papel as Papel,
        body.status
      );
    }
  );

  return app;
}