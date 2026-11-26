# GMR Financeiro

Primeiro incremento local do sistema financeiro da igreja, com React, TypeScript, Cloudflare Workers e D1. Revisão de acesso e identidade: cadastro sujeito a aprovação, Master separado e identidade configurável da igreja. O PostgreSQL e o Docker existentes na máquina não são utilizados nem alterados.

## Executar no VS Code

Abra **esta pasta** no VS Code e use seu terminal integrado. Requer Node.js 22 ou superior e npm. Foi verificado com Node.js 24.

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run db:migrate
npm.cmd run dev
```

Abra o endereço indicado pelo Vite, normalmente **http://127.0.0.1:5173**. A API local utiliza a porta **8787**. Use `Ctrl+C` para encerrar os dois processos.

As dependências já foram instaladas nesta entrega; `npm.cmd install` é necessário ao copiar o projeto para outro local sem `node_modules`. O `package-lock.json` mantém as versões resolvidas. Para instalação reproduzível em outra máquina, use `npm.cmd ci`.

Para visualizar somente a versão compilada, depois de compilar e aplicar as migrations:

```powershell
npm.cmd run preview
```

Nesse caso, abra **http://127.0.0.1:8787**. Os dados persistem localmente em `.wrangler/`. Não apague essa pasta se quiser preservar os registros locais. A prévia visual e os testes desta entrega utilizam bancos isolados fora dessa pasta, sem misturar os exemplos com seus dados.

## Primeiro acesso

**Na pasta original desta entrega, o Master local já foi provisionado.** O login e a senha temporária foram entregues ao proprietário no chat. A senha não está no código, no README ou no ZIP. Sua troca será obrigatória antes de acessar qualquer área do sistema.

1. O proprietário entra com o Master, troca a senha e entra novamente.
2. A pessoa que será responsável pela igreja abre **Solicitar acesso**, escolhe **Responsável pelo sistema na igreja** e informa nome, login e sua própria senha.
3. O proprietário acessa **Usuários**, analisa a solicitação e aprova o responsável com um perfil adequado, como **Administrador**.
4. Os demais usuários solicitam acesso como **Integrante da equipe**. O responsável ou alguém com a permissão **Usuários · Aprovar** escolhe o perfil e autoriza a entrada.
5. Cadastro pendente ou recusado não permite login. A escolha de responsável no formulário não concede privilégios; só o proprietário autoriza esse papel.
6. Em **Identidade da igreja**, a pessoa autorizada cadastra nome e logo. Após o login, a identidade da igreja ganha destaque e a GMR aparece como fornecedora em posição secundária.

Os usuários escolhem suas próprias senhas ao solicitar acesso. A troca obrigatória continua aplicável ao Master provisionado e às senhas temporárias redefinidas por um gestor. Ações de aprovação e recusa são auditadas; as operações do Master seguem indisponíveis para consulta na aplicação.

### Nova instalação a partir do ZIP

O ZIP não inclui o banco local nem credenciais. Depois de instalar dependências, compilar e aplicar as migrations, o proprietário executa uma única vez:

```powershell
npm.cmd run master:provision
```

O comando gera uma senha temporária aleatória, exibe-a no terminal e grava somente seu hash no banco. Ele não substitui um Master existente e não expõe um cadastro público para criar Master. Cada instalação recebe uma senha diferente.

### Nome e logo da igreja

A identidade da igreja é editável por quem possui **Identidade da igreja · Gerenciar**. São aceitas logos PNG, JPEG ou WebP de até 150 KB e 4096 × 4096 pixels. O nome e a logo permanecem no banco local após reiniciar a aplicação. A imagem GMR fornecida foi incorporada sem alterações em `public/gmr-logo.png`, com tema azul, azul-marinho e detalhes dourados.

## Funcionalidades deste incremento

- Login individual, logout e sessões com expiração de oito horas.
- Senhas protegidas por PBKDF2, limitação de tentativas e cookies HttpOnly/SameSite; Secure fora de localhost.
- Troca obrigatória de senha temporária, troca da própria senha e redefinição por usuário autorizado.
- Senhas de 8 a 128 caracteres, com botão de mostrar/ocultar. Copiar e colar permanecem disponíveis pelo teclado, sem ícones dedicados. Textos, foco e passagem do mouse seguem a paleta azul.
- O “X” fecha a troca opcional de senha. Na troca obrigatória, fechar encerra a sessão e retorna ao login; a exigência de trocar a senha permanece no próximo acesso.
- Invalidação de sessões após redefinição, troca de senha ou alteração administrativa do usuário.
- Perfis configuráveis e autorização por ação no servidor; bloqueio de concessão de permissões não possuídas.
- Proteção do último administrador ativo.
- Solicitação pública de acesso sem ativação automática, autorização do responsável pelo proprietário e aprovação dos demais por permissão específica.
- Cadastro de nome e logo da igreja, exibidos em destaque após o login; identidade GMR na tela inicial.
- Contas bancárias e dinheiro em espécie; caixas; categorias e subcategorias.
- Criação, edição e desativação de cadastros; saldos precisam estar zerados para desativar contas e caixas.
- Usuários e perfis sem exclusão física; perfis com usuários ativos não podem ser desativados.
- Abertura de saldo em posição não apropriada, com possibilidade de exigir aprovação por outro usuário.
- Entradas e saídas simples, com valor positivo em centavos, descrição obrigatória, categoria obrigatória e subcategoria opcional.
- Forma de pagamento nas saídas: dinheiro, Pix, crédito ou débito. Apenas pagamentos já efetivados.
- Datas retroativas; movimentação separada da data e hora de registro.
- Prévia do saldo antes de confirmar, aviso para valores negativos e bloqueio de saldo total negativo em espécie.
- Dashboard de saldos, entradas, saídas e posição não apropriada; detalhamento de caixas por conta.
- Consulta de movimentações com filtros por data, conta e caixa (até 500 por consulta).
- Auditoria de ações de usuários comuns (300 registros mais recentes), sem senhas.
- Gravação conjunta de operação, efeitos e auditoria, com proteções de integridade no banco.

Permissões de consulta dos cadastros devem ser concedidas junto às ações que os utilizam. Exemplo: quem inclui movimentações precisa consultar categorias e subcategorias para selecioná-las. A escolha de perfis para autorizar usuários mostra apenas os perfis cujas permissões o aprovador pode conceder.

Os saldos atuais consideram todo o histórico efetivado. Os filtros do dashboard alteram os indicadores do período e as movimentações; não transformam os saldos atuais em saldos históricos. Aberturas não compõem receitas ou despesas.

## Recorte e próximos incrementos

**Rateio fica para o próximo commit**, conforme combinado. Apropriações, devoluções, transferências, ajustes posteriores à abertura e edição/cancelamento de movimentações ainda não têm fluxo operacional neste incremento. Portanto, uma abertura permanece não apropriada até a entrega da apropriação. O cadastro de categorias e os lançamentos simples já funcionam; a V1 completa ainda não está concluída.

A interface de subcategorias permite criação, edição do nome e desativação/reativação.

Os detalhes destinados à V1.1 e V2 permanecem nessas versões. O cadastro inicial e a política simples de aprovação já permitem testar a abertura; o tratamento completo do ciclo de solicitações e a política específica do Master permanecem na V1.1. Nesta base, quando a política de dupla aprovação está ativa, o endpoint de aprovação sempre rejeita a autoaprovação, sem exceção técnica para o Master.

## Verificação

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
```

Os testes iniciam a API em **8790** e aplicam as migrations em um banco isolado. Validam autenticação, troca de senha, encerramento de sessões, permissões, último administrador, invisibilidade administrativa do Master, sua auditoria indisponível, aprovação independente, lançamentos, abertura única, classificação, datas e integridade do saldo em espécie. Não usam dados reais.

## Organização do código

| Caminho                   | Conteúdo                                      |
| ------------------------- | --------------------------------------------- |
| `src/main.tsx`            | Interface e formulários React.                |
| `src/style.css`           | Estilos e layout responsivo.                  |
| `worker/index.ts`         | API, sessões, permissões e regras de negócio. |
| `migrations/`             | Estrutura e proteções do banco D1.            |
| `scripts/integration.mjs` | Testes com banco e servidor isolados.         |
| `wrangler.jsonc`          | Configuração local do Cloudflare Workers/D1.  |

## Publicação futura

Não foi criada conta Cloudflare, banco remoto, repositório remoto ou publicação. O identificador D1 em `wrangler.jsonc` é reservado para desenvolvimento local e deve ser substituído pelo identificador real somente na preparação da hospedagem.

Antes de publicar, validar autenticação e tempo de processamento no plano gratuito, provisionamento remoto seguro e comportamento sob uso simultâneo. O teste local não comprova os limites de CPU do plano hospedado. Não enfraquecer o tratamento de senhas para caber na cota gratuita; se necessário, rever a solução de autenticação.

Backup e recuperação continuam destinados à V1.1. Não utilizar esta primeira base como registro financeiro definitivo sem concluir e validar os próximos incrementos e preparar a operação da hospedagem.

Nenhum commit Git foi criado: a pasta inicial não continha repositório. O código está pronto para revisão local e posterior versionamento.

## Regressão da navegação e tela branca

`npm test` mantém as 110 verificações da API e os 2 testes monetários, acrescenta 3 testes de contratos e valida os retornos reais da API local contra os contratos das telas. O banco usado é descartável e local.

Para os testes de navegador, execute `npm ci` e `npm run test:navigation`. É necessário ter Google Chrome instalado. A suíte inicia somente o Vite em `127.0.0.1:5178`, intercepta as chamadas `/api/*` com dados fictícios e não usa login, credenciais ou banco reais. Cobre Master e Administrador, 30 trocas de menu por perfil, resposta atrasada do dashboard, retorno inválido, erro HTTP e recuperação do Error Boundary sem perder o menu.

A tela só apresenta dados quando a chave da consulta concluída coincide com usuário, menu, filtros e atualização atuais. A consulta do dashboard verifica sua validade depois de todas as esperas. Respostas incompatíveis geram mensagem de erro, sem substituir valores financeiros ausentes por zero. O Error Boundary da página permite nova tentativa e navegação; a proteção externa permite recarregar se houver falha fora da página.

Validação local não substitui homologação da versão publicada. Publicação e push dependem de autorização explícita.

## Ajustes da homologação — Ministérios e lançamentos

A interface usa **Ministérios**, mantendo os identificadores e vínculos antigos de `boxes`. A migration `0005_homologation.sql` renomeia somente o cadastro cujo nome é exatamente “Caixa da Igreja” para “Administração Geral”, se esse nome ainda não existir. Outros nomes permanecem intactos.

- Categorias aceitam Entrada, Saída ou ambas, para todos os ministérios ou uma seleção de vários. As validações são aplicadas também pela API; configurações novas não reescrevem o histórico.
- A permissão `movements.edit` permite corrigir valor, categoria/subcategoria, data, descrição e forma de pagamento de entradas e saídas efetivadas. Tipo, conta, ministério e saldo de abertura ficam preservados. A edição exige motivo e versão atual; registra antes/depois, autor e horário. Não exige estorno manual. A diferença de valor atualiza o saldo na mesma transação, sem apagar lançamentos de saldo ou auditoria. Permanecem os limites monetários, a confirmação de saldo negativo e o bloqueio de dinheiro em espécie negativo.
- O cadastro de usuário permite restringir acesso a ministérios. O padrão atual continua sendo todos. Uma seleção vazia não concede acesso a movimentações. As consultas, saldos, totais, histórico e exportação respeitam o escopo no servidor; saldos sem ministério não são mostrados a usuários restritos. Usuários restritos podem operar conforme as permissões de seu perfil, mas não administrar usuários, perfis, cadastros globais ou saldos de abertura. Administradores precisam de acesso a todos os ministérios. Alterar o escopo encerra as sessões antigas.
- Usuário/login e Sair ficam somente na barra superior, sem duplicação no menu. A troca de senha fica no ícone de chave ao lado. O menu fixo tem rolagem própria em telas baixas e celulares.
- Histórico tem filtros por período (dias no horário de Brasília), usuário e ação; páginas de 100 registros. A permissão `audit.export` habilita CSV dos resultados filtrados, até 10.000 registros por exportação, com proteção contra fórmulas. A invisibilidade administrativa do Master permanece.

`npm test` executa os testes anteriores, uma atualização de banco antigo fictício e os novos cenários de homologação. `npm run test:navigation` executa 16 testes no Chrome, incluindo cinco resoluções e os seis cenários da correção da tela branca. Somente dados sintéticos e D1 local são usados.

### Preparação da publicação manual

A nova versão do Worker depende da migration **0005**. Na preparação da publicação, revisar a migration e o backup, aplicá-la no banco correto **antes de o Worker novo começar a atender** e depois publicar frontend/Worker juntos. Se o push aciona publicação automática, aplicar a migration antes desse push ou pausar o fluxo automático durante a preparação. O Worker anterior continua compatível com as colunas novas. Não publicar somente o frontend nem o Worker novo sem a migration. Não executar novamente migrations antigas, provisionamento Master ou comandos de limpeza no banco de produção.

Nenhum comando remoto de migration, commit, push ou deploy é executado pelos testes. Essas ações continuam sob controle manual do responsável. Homologar os novos fluxos após a publicação antes de retomar o manual.


## Identificação da versão

O rodapé autenticado informa a versão do sistema e a data de atualização. A versão vem de `version` e a data de `releaseDate` no `package.json`, incorporadas na compilação pelo Vite. Atualizar esses dois campos ao preparar uma nova versão; a data deve estar no formato YYYY-MM-DD. Assim a data exibida não muda a cada acesso nem usa o relógio do usuário. A versão 0.1.1 tem data de atualização 26/11/2026 e remove a duplicação dos dados de sessão e do botão Sair no menu lateral.
