import { Avaliacao, Competencia, Papel, Profissional, Projeto } from "../src/domain/entities";
import {
  criarEstrategia,
  FiltragemColaborativa,
  RegrasOrcamento,
  SimilaridadeCosseno
} from "../src/recommendation/strategies";
import { profissional, projeto } from "./fixtures";

describe("estratégias de recomendação", () => {
  it("seleciona pela similaridade de competências", () => {
    const precisa = profissional("precisa", Papel.DIRETOR, {
      competencias: [new Competencia("fotografia", 1)]
    });
    const distante = profissional("distante", Papel.DIRETOR, {
      competencias: [new Competencia("roteiro", 1)]
    });
    const ranking = new SimilaridadeCosseno().pontuar(projeto(), Papel.DIRETOR, [distante, precisa]);
    expect(ranking[0]?.profissional.id).toBe("precisa");
  });

  it("usa o histórico específico do gênero na filtragem colaborativa", () => {
    const comHistorico = profissional("historico", Papel.DIRETOR, { nota: 5, generos: ["drama"] });
    const outroGenero = profissional("outro", Papel.DIRETOR, { nota: 3, generos: ["terror"] });
    const ranking = new FiltragemColaborativa().pontuar(projeto(), Papel.DIRETOR, [outroGenero, comHistorico]);
    expect(ranking[0]?.profissional.id).toBe("historico");
  });

  it("aplica limite de verba proporcional aos papéis", () => {
    const acessivel = profissional("acessivel", Papel.DIRETOR, { valorDiaria: 100 });
    const caro = profissional("caro", Papel.DIRETOR, { valorDiaria: 600 });
    const ranking = new RegrasOrcamento().pontuar(
      projeto([Papel.DIRETOR, Papel.EDITOR]), Papel.DIRETOR, [caro, acessivel]
    );
    expect(ranking.map((item) => item.profissional.id)).toEqual(["acessivel"]);
  });

  it("permite trocar a estratégia por identificador", () => {
    expect(criarEstrategia("orcamento")).toBeInstanceOf(RegrasOrcamento);
    expect(() => criarEstrategia("inexistente")).toThrow("Estratégia desconhecida");
  });

  it("trata vetores vazios, competências nulas e profissionais sem avaliação", () => {
    const pessoa = new Profissional("sem-dados", "Sem dados", "sem@test", [Papel.DIRETOR], [], [], [], 50);
    const semCompetencias = new Projeto("p", "drama", 100, new Date("2030-01-01"), [], {});
    expect(new SimilaridadeCosseno().pontuar(semCompetencias, Papel.DIRETOR, [pessoa])[0]?.pontuacao).toBe(0.06);
    expect(new FiltragemColaborativa().pontuar(projeto(), Papel.DIRETOR, [pessoa])[0]?.pontuacao).toBeCloseTo(0.48);
    expect(new RegrasOrcamento().pontuar(semCompetencias, Papel.DIRETOR, [pessoa])).toHaveLength(1);
    expect(new SimilaridadeCosseno().pontuar(projeto(), Papel.EDITOR, [pessoa])).toEqual([]);
    const vetorZero = new Projeto("p2", "drama", 100, new Date("2030-01-01"), [Papel.DIRETOR], { fotografia: 0 });
    expect(new SimilaridadeCosseno().pontuar(vetorZero, Papel.DIRETOR, [
      new Profissional("zero", "Zero", "zero@test", [Papel.DIRETOR], [], [new Competencia("fotografia", 1)], [new Avaliacao(3, "terror")], 10)
    ])[0]?.pontuacao).toBeCloseTo(0.06);
  });
});