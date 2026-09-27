# Cinebridge Recommendation Service

Microsserviço REST em Node.js LTS, TypeScript estrito, Fastify e Prisma/PostgreSQL. Requer Node.js LTS 22 ou 24, conforme a faixa declarada em `package.json`; os scripts npm funcionam no Windows e Linux.

## Executar

```sh
npm install
copy .env.example .env
npm run prisma:generate
npm run dev
```

No Linux, use `cp .env.example .env` no lugar de `copy`. Sem `DATABASE_URL`, o serviço usa um catálogo local de demonstração. Com PostgreSQL configurado, execute `npm run prisma:push` para criar/atualizar o schema local e a aplicação consulta profissionais via Prisma; indisponibilidade do banco aciona o catálogo de fallback. Para produção, configure notificações reais implementando `NotificationGateway` e substituindo a implementação local baseada em log.

## API

- `POST /recommendations`: recebe `genero`, `orcamento`, `prazo` (ISO-8601), `papeisObrigatorios`, `competencias` opcional e `strategy` opcional (`similaridade`, `colaborativa` ou `orcamento`).
- `POST /recommendations/:recommendationId/roles/:papel/replacements`: recebe `rejeitadoId` para pedir uma alternativa ou `substitutoId` para indicar alguém. Somente o papel informado é recalculado; os outros membros ficam fixos.
- `POST /recommendations/:recommendationId/reassess`: recebe `project` com os novos dados e refaz toda a equipe quando o orçamento varia ao menos 20%, o prazo muda ao menos 7 dias ou os papéis obrigatórios mudam.
- `POST /recommendations/:recommendationId/invitations/:papel/respond`: recebe `status` (`ACEITO` ou `RECUSADO`) e emite evento para os observers.
- `GET /health`: verificação de saúde.

Projetos, equipes, membros, recomendações e convites são persistidos via Prisma quando PostgreSQL está configurado. O estado de sessão usado para operações subsequentes fica em memória, tem limite FIFO de 10.000 itens e não é restaurado após reinício nesta primeira etapa; sessões antigas podem retornar 404 depois de removidas do limite. O EventEmitter é encapsulado pela interface `EventBus`, permitindo trocar o transporte sem alterar o serviço de domínio.

## Testes

```sh
npm test
npm run test:coverage
npm run build
```