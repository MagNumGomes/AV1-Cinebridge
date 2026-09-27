import {
  Equipe,
  MembroEquipe,
  Papel,
  Projeto
} from "../src/domain/entities";
import { SimilaridadeCosseno } from "../src/recommendation/strategies";
import { OrquestradorEquipe, OrquestradorPadrao } from "../src/team/orchestrator";
import {
  CalculadorCompatibilidade,
  GeradorRelatorio,
  ValidadorConsistencia
} from "../src/visitors/project-visitors";
import { profissional, projeto } from "./fixtures";

describe("Template Method de montagem de equipe", () => {
  it("mantém a ordem invariável validar, normalizar e pós-processar", async () => {
    const passos: string[] = [];
    class OrquestradorDeTeste extends OrquestradorEquipe {
      protected validarRestricoes(): void { passos.push("validar"); }
      protected normalizarDados(valor: Projeto): Projeto { passos.push("normalizar"); return valor; }
      protected posProcessar(_valor: Projeto, membros: never[]): never[] { passos.push("pos-processar"); return membros; }
    }
    await new OrquestradorDeTeste(new SimilaridadeCosseno())
      .montarEquipe(projeto(), [profissional("p1", Papel.DIRETOR)]);
    expect(passos).toEqual(["validar", "normalizar", "pos-processar"]);
  });

  it("normaliza gênero e evita selecionar o mesmo profissional duas vezes", async () => {
    const projetoMisto = new Projeto("p", " Drama ", 1000, new Date("2030-06-01"), [Papel.DIRETOR, Papel.EDITOR]);
    const umProfissional = profissional("multi", Papel.DIRETOR);
    const resultado = await new OrquestradorPadrao(new SimilaridadeCosseno()).montarEquipe(
      projetoMisto,
      [umProfissional]
    );
    expect(resultado.projeto.genero).toBe("drama");
    expect(resultado.membros).toHaveLength(1);
    expect(resultado.parcial).toBe(true);
  });

  it("rejeita projeto sem papéis ou com orçamento inválido", async () => {
    await expect(new OrquestradorPadrao(new SimilaridadeCosseno()).montarEquipe(
      new Projeto("p", "drama", 0, new Date("2030-06-01"), [Papel.DIRETOR]), []
    )).rejects.toThrow("orçamento");
  });
});

describe("visitors", () => {
  it("detecta papel faltante, orçamento excedido e duplicidade", () => {
    const pessoa = profissional("p1", Papel.DIRETOR, { valorDiaria: 1500 });
    const equipe = new Equipe([
      new MembroEquipe(Papel.DIRETOR, pessoa),
      new MembroEquipe(Papel.DIRETOR, pessoa)
    ]);
    const projetoComEquipe = new Projeto(
      "p", "drama", 100, new Date("2030-06-01"), [Papel.DIRETOR, Papel.EDITOR], {}, equipe
    );
    const validador = new ValidadorConsistencia();
    expect(validador.visitarProjeto(projetoComEquipe)).toEqual(expect.arrayContaining([
      "Papel obrigatório ausente: EDITOR",
      "Equipe excede o orçamento do projeto"
    ]));
    expect(validador.visitarEquipe(equipe)).toEqual(["A equipe contém papéis duplicados"]);
    expect(validador.visitarProfissional(profissional("negativo", Papel.DIRETOR, { valorDiaria: -1 })))
      .toEqual(["Valor diário inválido"]);
    expect(validador.visitarProjeto(new Projeto("zero", "drama", 0, new Date(), [], {}, new Equipe([]))))
      .toContain("Orçamento deve ser positivo");
    expect(validador.visitarEquipe(new Equipe([]))).toEqual([]);
  });

  it("calcula compatibilidade e exporta relatório sem alterar domínio", () => {
    const pessoa = profissional("p1", Papel.DIRETOR, { nota: 5 });
    const equipe = new Equipe([new MembroEquipe(Papel.DIRETOR, pessoa)]);
    const projetoComEquipe = new Projeto("p", "drama", 1000, new Date("2030-06-01"), [Papel.DIRETOR], {}, equipe);
    const compatibilidade = new CalculadorCompatibilidade();
    expect(compatibilidade.visitarProjeto(projetoComEquipe)).toBe(100);
    expect(compatibilidade.visitarProjeto(projeto())).toBe(0);
    expect(compatibilidade.visitarEquipe(new Equipe([]))).toBe(0);
    expect(compatibilidade.visitarProfissional(profissional("sem-avaliacao", Papel.DIRETOR, { nota: 0 }))).toBe(0);
    const relatorio = new GeradorRelatorio().visitarProjeto(projetoComEquipe);
    expect(relatorio).toMatchObject({ id: "p", genero: "drama", papeisObrigatorios: [Papel.DIRETOR] });
    expect(new GeradorRelatorio().visitarProfissional(pessoa)).toMatchObject({ nome: "Profissional p1" });
    expect(new GeradorRelatorio().visitarEquipe(equipe)).toMatchObject({ totalMembros: 1 });
  });
});