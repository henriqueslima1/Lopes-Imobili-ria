# Hub Lopes Imobiliária

Tela inicial da equipe da Lopes Imobiliária, montada a partir do Hub ADM (repositório `hub-ferramentas`).
Vieram só o layout e o jeito de usar. Nenhum dado, cartão ou ferramenta de lá veio junto.

Por enquanto o hub tem:

| O quê | Onde | Para quê |
|---|---|---|
| **Início** | barra lateral | saudação, resumo do dia, ícones das ferramentas e números do CRM |
| **CRM** | ícone na tela inicial e atalho na barra lateral (com a bolha de leads esperando) | abre o CRM em `/crm/` |
| **Agenda** | barra lateral (e ícone na tela inicial) | Google Agenda dos corretores, calendário do mês com feriados, agendar visita e reunião no Meet |

Também tem busca rápida (`Ctrl K` ou `/`), atalhos `Alt 1` (CRM) e `Alt 2` (Agenda), tema claro/escuro e tela de entrada com senha.

## Arquivos

```
public_html/
  index.html   o hub (tela, estilo e código num arquivo só)
  marca.js     nome, logo e cores da imobiliária: o único arquivo a editar
  senha.js     campo de senha sem preenchimento automático, com o olhinho
server/
  index.js     servidor Node (sem dependências) que entrega o public_html
Dockerfile     o que o Railway usa para subir o servidor
```

No Railway, o projeto **Lopes Imobiliária** sobe este repositório pelo `Dockerfile` a cada push.
Por enquanto o servidor só entrega os arquivos. O `api.php` ainda não existe, então o hub abre em modo exemplo.

## Ver funcionando (modo exemplo)

Sem servidor, o hub abre em **modo exemplo**: qualquer senha entra, os números do CRM são de exemplo
e tocar no CRM mostra um aviso em vez de abrir uma página vazia.

```bash
node server/index.js
```

Depois abra `http://localhost:8080/`.

## Marca (`marca.js`)

| Campo | O que muda |
|---|---|
| `empresa` | rodapé e título da aba |
| `hub` | nome na tela de entrada ("Hub Lopes") |
| `saudacao` | "Bom dia, **equipe**" |
| `iniciais` | botão redondo da conta |
| `site` | link do rodapé e ação "Abrir o site" na busca (vazio = sem link) |
| `logo` | imagem da logo na mesma pasta, ex.: `logo.png` (vazio = símbolo da casinha) |
| `cor` | cor principal: botões, ícone do CRM, dia de hoje |
| `acento` | cor de destaque: ícone da Agenda e detalhes |

As outras cores (brilhos do fundo, versão escura, sombras) saem dessas duas.
Para trocar a identidade inteira, basta mudar `cor` e `acento`.

## O que o servidor precisa responder

A tela chama `api.php?acao=NOME` com POST e corpo em JSON. É o mesmo formato do Hub ADM:

| Ação | Resposta |
|---|---|
| `sessao` | `{ "logado": true/false }` |
| `entrar` | recebe `{ "senha" }`, responde `{ "ok": true }` ou status 401 com `{ "erro": "..." }` |
| `sair` | `{ "ok": true }` |
| `dados` | `{ "numeros": { "crm": { "novos", "responderam", "atrasados", "hoje" } } }` |

- `novos` + `responderam` = leads esperando (bolha do CRM e primeiro cartão).
- `hoje` + `atrasados` = follow-ups do dia (segundo cartão). Com atrasados, o número fica amarelo.
- Sem `crm` na resposta, o hub mostra só o cartão da Agenda.
- Status 401 em qualquer ação faz a tela pedir a senha de novo.

Endereços do CRM que o hub usa: `/crm/`, `/crm/quadro.html`, `/crm/quadro.html?novo=1`,
`/crm/quadro.html#col-respondeu` e `/crm/followups.html`. São os mesmos do CRM atual (repositório `crm`).

A Agenda (pessoas, cores e sala fixa do Meet) fica salva em cada navegador.
Cada pessoa configura uma vez no próprio computador.

## Próximos passos

1. Servidor: login, Postgres e a rota `api.php`, reaproveitando o `server/` do `hub-ferramentas`.
2. CRM da Lopes em `/crm/`.
3. Assinatura mensal pelo Asaas: cobrança recorrente e aviso no hub quando o cartão não passar, com opção de pagar por Pix ou cartão.
