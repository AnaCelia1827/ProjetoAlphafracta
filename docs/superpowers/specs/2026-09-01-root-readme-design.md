# Design do README raiz do Alphractal

## Objetivo

Criar um `README.md` na raiz que permita a uma pessoa conhecer o produto,
entender como os dados atravessam o sistema e executar o monorepo localmente no
Windows ou no Linux sem precisar descobrir comandos em arquivos internos.

## Público e idioma

O documento será escrito em português do Brasil e atenderá tanto pessoas que
querem avaliar o projeto quanto desenvolvedores que precisam configurá-lo. Os
termos técnicos e nomes de recursos do código permanecem em inglês quando essa
é a nomenclatura oficial.

## Estrutura do documento

O README terá as seguintes seções, nesta ordem:

1. apresentação curta do Alphractal e escopo somente leitura;
2. funcionalidades disponíveis no dashboard;
3. explicação do fluxo entre Alchemy, Coinbase, API, MongoDB, SSE e Next.js;
4. tecnologias e organização do monorepo;
5. pré-requisitos comuns e específicos de Windows e Linux;
6. configuração das variáveis do backend e do frontend;
7. instruções independentes para executar no Linux e no Windows;
8. formas de executar com MongoDB via Docker ou sem persistência;
9. URLs locais, endpoints REST/SSE e comandos de qualidade;
10. resolução dos problemas de configuração mais prováveis;
11. limitações atuais e referências para a documentação técnica detalhada.

## Decisões de conteúdo

- Usar `npm install` na raiz, respeitando o `package-lock.json` e os workspaces.
- Informar explicitamente a exigência de Node.js 24 e npm 11 declarada no
  `package.json`.
- Tratar Docker e MongoDB como opcionais para o modo ao vivo, pois a API opera
  em memória quando `MONGODB_URI` não está definida.
- Explicar que uma chave da Alchemy é obrigatória e nunca deve ser exposta no
  frontend.
- Usar `cp` no Linux e `Copy-Item` no PowerShell, evitando comandos que só
  funcionem em um dos sistemas.
- Orientar a execução da API e do frontend em dois terminais, nas portas 3001 e
  3000 respectivamente.
- Não prometer suporte, funcionalidade ou processo de implantação que não
  esteja representado no código e na documentação atual.

## Validação

A entrega será conferida contra `package.json`, os arquivos `.env.example`, o
`docker-compose.yml`, as rotas Express, o proxy do Next.js e
`docs/architecture.md`. Também serão executados o verificador de formatação do
repositório e os comandos de qualidade aplicáveis, com no máximo dois workers
nos testes para respeitar os limites de memória da máquina.

## Escopo do commit

O commit de implementação adicionará apenas o `README.md` raiz. Arquivos locais
preexistentes que não façam parte desta solicitação permanecerão intactos e não
serão incluídos.
