# Hub Lopes Imobiliária

Hub da equipe da Lopes Imobiliária. Veio do Hub ADM (repositório `hub-ferramentas`) e do CRM (repositório `crm`),
copiando só o layout e o funcionamento. Nenhum dado de lá veio junto: o banco começa vazio.

| O quê | Onde | Quem vê |
|---|---|---|
| **Início** | barra lateral | todos: saudação, resumo do dia, ícone do CRM, leads esperando, follow-ups e vendas do mês |
| **CRM** | ícone na tela inicial e atalho na barra lateral | todos: dashboard, quadro por etapa, leads e follow-ups |
| **Agenda** | barra lateral | todos: Google Agenda dos corretores, calendário com feriados, agendar visita, Meet |
| **Colaboradores** | barra lateral | só o administrador: cadastrar corretores, criar o acesso de cada um, vendas por corretor |

Também tem busca rápida (`Ctrl K` ou `/`), atalhos `Alt 1` (CRM), `Alt 2` (Agenda) e `Alt 3` (Colaboradores),
tema claro/escuro e o menu da conta (trocar a senha e sair).

## Login

- **Administrador:** usuário e senha das variáveis `ADMIN_USUARIO` e `ADMIN_SENHA` do Railway.
  O administrador é criado sozinho na primeira vez que o servidor sobe.
- **Colaboradores:** o administrador cria em Colaboradores → Novo colaborador → "Pode entrar no hub".
  O hub sugere o usuário e gera a senha. Depois de salvar, aparece o acesso pronto para enviar pelo WhatsApp ou copiar.
- O usuário não diferencia maiúscula de minúscula (`Lopes` = `lopes`).
- Entrar no hub também entra no CRM, e vice-versa: é o mesmo endereço e o mesmo login.
- Tirar o acesso ou desativar um colaborador derruba a sessão dele na hora.
- 8 senhas erradas seguidas do mesmo lugar bloqueiam por 15 minutos.
- **Esqueceu a senha do administrador:** no Railway, defina `ADMIN_REDEFINIR_SENHA=1` e a senha nova em
  `ADMIN_SENHA`, espere o servidor subir de novo e depois apague `ADMIN_REDEFINIR_SENHA`.

## Vendas por corretor

As vendas saem do CRM: lead na etapa **Venda**, com o nome do corretor em **Responsável** e o **Valor** preenchido.
Quando um lead vira venda (na ficha ou arrastando no quadro), o CRM já pergunta o valor e o corretor.
Mover vários leads de uma vez na página Leads não pergunta.

- Os corretores que aparecem em "Responsável" são os colaboradores **ativos** (o nome liga a pessoa aos leads).
- Renomear um colaborador leva os leads dele junto.
- Lead cadastrado por um colaborador já fica com ele como responsável.
- Vendas sem corretor aparecem num aviso em Colaboradores, com link para o CRM.
- O histórico de cada lead mostra quem fez cada mudança.

## Arquivos

```
public_html/
  index.html   o hub (tela, estilo e código num arquivo só)
  crm/         o CRM (as 4 páginas .html são iguais de propósito: a tela sai do endereço)
  marca.js     nome, logo e cores: o único arquivo a editar para trocar a marca
  senha.js     campo de senha sem preenchimento automático, com o olhinho
server/
  index.js     servidor Node: entrega o site e responde /api.php (hub) e /crm/api.php (CRM)
  db.js        Postgres: tabelas criadas sozinhas (usuarios, sessoes, leads, lead_historico, followups, config)
  auth.js      login, sessões e o administrador inicial
  rotas/       ações do hub (colaboradores, senha) e do CRM
  test/        testes (precisam de um banco vazio só para teste)
Dockerfile     o que o Railway usa para subir o servidor
```

## Railway

Projeto **Lopes Imobiliária**: serviço `hub` (este repositório, pelo `Dockerfile`, a cada push) e serviço `Postgres`.

| Variável (serviço `hub`) | Para quê |
|---|---|
| `DATABASE_URL` | referência ao Postgres: `${{Postgres.DATABASE_URL}}` |
| `ADMIN_USUARIO` | usuário do administrador (padrão `Lopes`) |
| `ADMIN_SENHA` | senha inicial do administrador (mínimo 6 caracteres) |
| `PORT` | `8080` (a porta do domínio) |

## Marca (`marca.js`)

| Campo | O que muda |
|---|---|
| `empresa` | rodapé, título da aba e nome da conta do administrador |
| `nomeHub` | nome na tela de entrada ("Hub Lopes") |
| `hub` | para onde o "Voltar ao Hub" do CRM leva (`/`) |
| `saudacao` | "Bom dia, **equipe**" do administrador (o colaborador vê o próprio nome) |
| `iniciais` | botão redondo da conta do administrador |
| `site` | link do rodapé e ação "Abrir o site" na busca (vazio = sem link) |
| `logo` | imagem da logo na mesma pasta, ex.: `logo.png` (vazio = símbolo da casinha) |
| `cor` | cor principal: botões, ícone do CRM, dia de hoje, gráficos |
| `acento` | cor de destaque: cartão de vendas, detalhes |

## Rodar no computador

```bash
cd server && npm install
```

```bash
DATABASE_URL=postgres://... ADMIN_USUARIO=Lopes ADMIN_SENHA=uma-senha node server/index.js
```

Sem `DATABASE_URL`, o site abre mas não dá para entrar. Abrindo só os arquivos de `public_html`
(sem o servidor), o hub e o CRM entram em **modo exemplo**: qualquer usuário e senha, dados de exemplo
guardados só naquele navegador.

Testes (um banco vazio só para teste; as tabelas são limpas, nunca aponte para o banco de verdade):

```bash
cd server && TESTE_DATABASE_URL=postgres://... npm test
```

## Próximos passos

1. Definir o que só os colaboradores acessam (ex.: cada corretor ver só os próprios leads no CRM).
2. Assinatura mensal pelo Asaas: cobrança recorrente e aviso no hub quando o cartão não passar, com Pix ou cartão.
