<div align="center">

![Matriz SWOT](../swot-alph.png)

*Fonte: Autoria própia*

</div>

## Matriz SWOT

### Forças

O projeto se apoia em uma plataforma de inteligência on-chain já consolidada, permitindo que o novo módulo seja incorporado a um ecossistema existente em vez de ser construído do zero. Essa base é reforçada pela integração direta com a aba "Fees", o que garante relevância imediata para o fluxo de usuários institucionais, e por uma arquitetura tecnológica já compatível com dados em tempo real (WebSockets, backend em Node.js e entrega contínua via SSE).

Outro diferencial é o código aberto sob licença MIT, que permite à Alphractal reaproveitar livremente a solução sem ficar dependente do clube para mantê-la (reduzindo o risco de lock-in), enquanto os integrantes ganham um projeto de portfólio validado por uma empresa real.

### Fraquezas

O ponto de partida do projeto é justamente a limitação que ele busca resolver: o sistema atual depende de médias históricas estáticas, sem uma camada de ingestão e processamento em tempo real capaz de acompanhar novos blocos e a volatilidade da mempool. Isso cria um ponto cego que expõe usuários institucionais a riscos de execução.

Além disso, por se tratar de um protótipo acadêmico entregue em ambiente isolado, a solução carece de auditorias de segurança e testes de estresse, o que limita sua confiabilidade para uso institucional real. Somado a isso, a inexistência de manutenção após o encerramento do projeto significa que falhas ou necessidades de evolução futura ficarão sem suporte formal.

### Oportunidades

A arquitetura de ingestão em tempo real desenvolvida como prova de conceito abre caminho para expandir o monitoramento a outras redes L1 e L2 e para ser reaproveitada em outros indicadores e módulos analíticos da plataforma. Isso se conecta a uma demanda de mercado crescente: investidores institucionais buscam cada vez mais previsibilidade de custos em operações de alto volume.

Ao transformar dados históricos em indicadores operacionais acionáveis, o projeto também posiciona a Alphractal para se diferenciar da concorrência por meio de estimativas financeiras em tempo real, integradas à experiência que já oferece aos seus usuários.

### Ameaças

O principal risco competitivo vem de plataformas consolidadas de inteligência on-chain, como Blocknative, Dune e Nansen, que podem lançar ou aprimorar funcionalidades semelhantes. No plano técnico, o crescimento de transações privadas e mecanismos de proteção contra MEV pode reduzir a representatividade dos dados observados na mempool pública, além de mudanças futuras no protocolo Ethereum exigirem adaptações constantes.

Por fim, a solução depende de fatores externos que fogem do controle do projeto: a disponibilidade dos provedores de RPC (Alchemy/Infura), sujeitos a instabilidade e limites de uso, e a volatilidade cambial na conversão de gás para dólar, que pode afetar a precisão das estimativas financeiras.
