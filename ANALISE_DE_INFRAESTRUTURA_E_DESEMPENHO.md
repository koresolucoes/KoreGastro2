# Análise de Infraestrutura: Desempenho, Disponibilidade e Estabilidade

Este relatório apresenta uma análise detalhada da arquitetura baseada em **Vercel Serverless** e **Supabase**, focando em como aproveitar os recursos dos **planos Pro** de ambas as plataformas para maximizar o rendimento, a disponibilidade e a estabilidade do sistema.

---

## 1. Contexto e Desafios da Arquitetura Atual

A arquitetura que combina frontend (Angular/React) e funções serverless hospedadas na Vercel com um banco de dados relacional (PostgreSQL) gerenciado pelo Supabase é extremamente moderna e escalável. No entanto, ela apresenta desafios inerentes:

*   **Cold Starts (Vercel):** O tempo de inicialização de funções serverless pode aumentar a latência das requisições.
*   **Exaustão de Conexões (Supabase):** Como as funções serverless são efêmeras e podem escalar massivamente, cada requisição pode abrir uma nova conexão com o banco de dados, o que rapidamente esgota o limite do PostgreSQL.
*   **Timeouts de Execução:** Processos demorados (como relatórios pesados ou processamento em lote) podem exceder o tempo limite padrão das funções serverless.
*   **Distribuição Global:** Se os usuários estão distantes do datacenter onde a Vercel e o Supabase estão hospedados, a latência de rede impacta a percepção de performance.

---

## 2. Vercel (Plano Pro): Otimização de Execução e Rendimento

O plano Pro da Vercel oferece diversas ferramentas para mitigar os problemas de latência e execução.

### 2.1. Serverless Functions: Limites Expandidos
No plano Pro, as Serverless Functions ganham maior capacidade:
*   **Duração Máxima:** O timeout pode ser configurado para até **300 segundos** (5 minutos), comparado aos 10s do plano Hobby. Isso é vital para endpoints de relatórios, processamento de folha de pagamento (`/api/rh/folha-pagamento.ts`) e webhooks pesados.
*   **Concorrência:** Suporte para picos de tráfego muito maiores sem *throttling* (estrangulamento de requisições).

### 2.2. Vercel Edge Functions e Edge Network
*   **O que é:** Em vez de executar código em um servidor central (ex: `us-east-1`), as Edge Functions rodam na CDN da Vercel, o mais próximo possível do usuário.
*   **Como aproveitar:** Migrar middlewares (como verificação de autenticação ou roteamento) e APIs leves (que não exigem bibliotecas Node.js complexas) para o Edge. Isso elimina o *Cold Start* quase por completo e reduz a latência inicial para milissegundos.

### 2.3. Vercel Web Analytics e Speed Insights
*   **O que é:** Ferramentas nativas para monitorar os Core Web Vitals (LCP, FID, CLS) e a experiência do usuário real.
*   **Como aproveitar:** Identificar gargalos de renderização no frontend (Angular/React). Saber exatamente quais páginas demoram mais para carregar ou apresentam instabilidade visual, permitindo atuar cirurgicamente na interface do PDV ou do Cardápio Digital.

### 2.4. Cache e Vercel Edge Network
*   **Stale-While-Revalidate (SWR):** Utilizar cabeçalhos de cache inteligentes. Páginas públicas (como o menu público ou chamadas de catálogo do iFood) podem ser cacheadas na borda (Edge). A Vercel entrega a resposta instantaneamente do cache enquanto revalida os dados em background com o Supabase. Isso alivia a carga no banco de dados e aumenta drasticamente o rendimento.

### 2.5. Vercel WAF (Web Application Firewall) e Proteção DDoS
*   O plano Pro oferece mitigação avançada contra ataques DDoS e ferramentas de WAF, garantindo que picos anômalos de tráfego malicioso não derrubem a aplicação, mantendo a **disponibilidade**.

---

## 3. Supabase (Plano Pro): Estabilidade de Dados e Escalabilidade

O Supabase não é apenas um banco de dados, mas um ecossistema. O plano Pro desbloqueia ferramentas essenciais para produção de missão crítica (como um sistema de PDV e gestão de restaurantes).

### 3.1. Connection Pooling (Supavisor) - *Crítico*
*   **O problema:** Milhares de execuções serverless concorrentes tentarão abrir conexões diretas com o Postgres, causando falhas de conexão.
*   **A solução:** O Supabase Pro fornece o **Supavisor**, um pooler de conexões nativo (escalável em IPv4 e IPv6).
*   **Como aproveitar:** Alterar todas as strings de conexão do backend (ex: no Drizzle ORM ou Prisma) para usar a porta de pooling (geralmente porta 6543) ao invés da porta direta (5432). Isso permite que o banco gerencie dezenas de milhares de requisições concorrentes da Vercel usando apenas um pequeno pool de conexões físicas reais.

### 3.2. Point-in-Time Recovery (PITR) e Backups Diários
*   **O que é:** O plano Pro realiza backups automáticos diários retidos por 7 a 30 dias. Mais importante ainda, oferece o PITR, que permite restaurar o banco de dados para **qualquer segundo específico** no passado.
*   **Como aproveitar:** Garante **Estabilidade de Dados** absoluta. Se uma atualização em lote (ex: migração de estoque ou recálculo de folha de pagamento) corromper dados, é possível reverter o banco para o segundo exato antes do incidente.

### 3.3. Computação Dedicada e Auto-scaling
*   No plano Pro, você deixa a infraestrutura compartilhada (micro) e passa para instâncias dedicadas. O Supabase permite dimensionar a CPU e a RAM (Compute Add-ons) conforme a demanda cresce, garantindo que relatórios pesados (como `comparative-report` ou `menu-engineering`) não afetem a performance transacional do PDV em tempo real.

### 3.4. Read Replicas (Réplicas de Leitura)
*   **Como aproveitar:** Para aumentar a **disponibilidade e rendimento**, o Supabase Pro permite configurar Read Replicas. O tráfego de leitura intensiva (como dashboards analíticos e catálogos públicos) pode ser roteado para a réplica, deixando o banco de dados primário livre para focar exclusivamente nas gravações (novos pedidos, transações de PDV).

### 3.5. Supabase Edge Functions e Webhooks
*   As funções do Supabase rodam em Deno e têm latência baixíssima para operações de banco de dados. Processos disparados por mudanças no banco (ex: enviar notificação no WhatsApp quando um pedido muda de status) devem usar os *Database Webhooks* apontando para Edge Functions do próprio Supabase para aliviar a Vercel.

### 3.6. Log Drains e Integração de Monitoramento
*   O plano Pro permite exportar os logs do banco de dados (Log Drains) para ferramentas como Datadog, New Relic ou Logflare. Isso é crucial para debugar lentidão em consultas (Slow Queries) e garantir a estabilidade a longo prazo.

---

## 4. Recomendações Estratégicas para o Sistema Atual

Considerando a estrutura de pastas e as funcionalidades do sistema (Integrações iFood/Cielo/Mercado Pago, Módulos de RH, KDS, Estoque e PDV), aqui estão os passos recomendados:

1.  **Resolver Conexões de Banco:** Garantir que o diretório `/api/` e os utilitários de ORM utilizem exclusivamente a Connection String de *Pooling* do Supabase (`Transaction Mode`).
2.  **Otimização de Rotas Demoradas:** Configurar as funções serverless em `vercel.json` (ou export de configuração no framework) para aumentar o `maxDuration` das rotas de integração, como `/api/ifood-proxy`, relatórios (`/api/v2/reports.ts`) e processamento de RH.
3.  **Implementar Caching Ofensivo:** Endpoints como `/api/public-table-occupied` e `/api/v2/catalog` devem retornar cabeçalhos `Cache-Control: s-maxage=60, stale-while-revalidate`. Isso faz com que a Vercel sirva o conteúdo instantaneamente, suportando alto tráfego com zero custo de banco.
4.  **Habilitar PITR:** Configurar o Point-in-Time Recovery no Supabase para proteção contra falhas catastróficas, vital para um sistema que lida com inventário financeiro e folhas de pagamento.
5.  **Revisão de Índices no Postgres:** Com o aumento da capacidade de computação, utilizar o painel de "Query Performance" do Supabase Pro para identificar consultas lentas e criar os índices apropriados, garantindo a estabilidade da execução.

## Conclusão

A junção de **Vercel Pro** e **Supabase Pro** fornece infraestrutura de nível Enterprise sem a sobrecarga de gerenciar clusters (como Kubernetes). O segredo para extrair o máximo dessas plataformas é usar o **Connection Pooling** do Supabase para suportar a elasticidade da Vercel, adotar o **Caching na Borda (SWR)** para rotas públicas, e confiar no **PITR** para a inviolabilidade dos dados de negócio do restaurante.
