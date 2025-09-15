# ChefOS - Sistema de Gestão de Restaurantes

**ChefOS** é um sistema de gestão para restaurantes completo, moderno e integrado. Desenvolvido com as tecnologias mais recentes, ele oferece uma solução completa para otimizar operações, desde o atendimento ao cliente no Ponto de Venda (PDV) até o controle de estoque, gestão de RH, reservas e análise de desempenho, tudo sincronizado em tempo real.

O sistema foi projetado para ser intuitivo, eficiente e poderoso, incorporando inteligência artificial para auxiliar em tarefas complexas como a criação de fichas técnicas e a previsão de compras.

---

## 🚀 Acesso à Versão de Testes

**O ChefOS está atualmente em uma fase exclusiva de testes.** Para explorar a plataforma e todas as suas funcionalidades, é necessário solicitar credenciais de acesso.

**Entre em contato para receber seu login de avaliação e testar o sistema.**

---

## ✨ Funcionalidades Principais

O ChefOS é modular e cobre todas as áreas críticas da gestão de um restaurante:

### 📊 **Dashboard Analítico**
- **Visão Geral em Tempo Real:** Acompanhe os principais indicadores de desempenho (KPIs) do dia assim que você entra no sistema.
- **Métricas Financeiras Chave:** Vendas totais, **Lucro Bruto**, **Ticket Médio**, mesas ocupadas, contagem de itens com estoque baixo e pedidos pendentes na cozinha.
- **Gráfico de Vendas vs. CMV:** Análise visual do faturamento contra o custo dos produtos vendidos nos últimos 7 ou 30 dias.
- **Análises Rápidas:** Rankings com os itens mais vendidos do dia, incluindo a **margem de lucro** individual de cada um, e uma lista das transações de venda mais recentes.

### 🍽️ **PDV (Ponto de Venda)**
- **Gerenciamento Visual de Mesas:** Crie múltiplos salões e organize as mesas com uma interface de arrastar e soltar (drag-and-drop).
- **Editor de Layout Completo:** No modo de edição, adicione, delete, redimensione e altere o número das mesas para espelhar perfeitamente o layout do seu salão.
- **Lançamento de Pedidos:** Uma interface rápida e intuitiva para garçons lançarem pedidos diretamente na mesa a partir de um menu categorizado e com busca.
- **Status em Tempo Real:** As cores das mesas mudam instantaneamente (`Livre`, `Ocupada`, `Pagando`), mantendo toda a equipe sincronizada.
- **Associação de Clientes:** Vincule um cliente do seu cadastro a uma mesa para registrar o histórico de consumo e habilitar o resgate de prêmios de fidelidade.
- **Ações Rápidas:** Imprima pré-contas, mova pedidos entre mesas e aplique descontos diretamente no painel do pedido.

### 🍳 **KDS (Kitchen Display System)**
- **Comandas Digitais:** Substitua as comandas de papel por um sistema digital eficiente que envia pedidos diretamente para as estações corretas (Cozinha, Bar, etc.).
- **Timers Inteligentes:** Cada item e pedido possui um timer de preparo, com cores que indicam o andamento e alertam sobre atrasos.
- **Alertas Sonoros:** Notificações audíveis para novos pedidos, itens atrasados e, mais importante, **alertas de atenção** para itens com observações críticas (como alergias).
- **Fluxo de Segurança:** Itens com observações críticas exigem um passo de "confirmação de ciência" pela cozinha, garantindo que a informação foi lida.
- **Lógica de Retenção (Hold):** O sistema calcula o tempo de preparo de cada item e segura os pratos mais rápidos para que tudo fique pronto ao mesmo tempo.
- **Modo "Expo":** Uma tela centralizada para o chef ou expedidor visualizar todos os itens prontos e garantir que os pedidos saiam completos e no tempo certo.

### 💰 **Caixa (Cashier)**
- **Venda Rápida:** Um PDV simplificado para vendas no balcão. Os pedidos podem ser pagos na hora ou enviados para a cozinha para pagamento posterior.
- **Fechamento de Conta:** Processe pagamentos das mesas e das vendas rápidas em espera. Suporta **múltiplos métodos de pagamento** para dividir a conta.
- **Gestão de Caixa:** Registre despesas, confira o saldo e realize o fechamento de caixa detalhado, que compara o valor esperado com o contado e gera um resumo para impressão.
- **Reimpressão:** Acesse o histórico de vendas do dia para reimprimir recibos ou conferir detalhes.

### 📦 **Estoque e Compras**
- **Controle de Insumos:** Gerencie todos os seus ingredientes, custos, unidades e fornecedores.
- **Alertas Automatizados:** O dashboard sinaliza itens com estoque baixo, próximos ao vencimento ou parados há muito tempo.
- **Controle de Lotes:** Registre números de lote e datas de validade para insumos recebidos, garantindo total rastreabilidade.
- **Contagem de Estoque (Auditoria):** Uma tela dedicada para realizar a contagem física do inventário. O sistema mostra a diferença entre o estoque contado e o do sistema e permite ajustar tudo com um único clique.
- **Previsão com IA (Gemini):** Utilize o histórico de vendas para prever a necessidade de compra de insumos para a próxima semana.
- **Ordens de Compra:** Crie, gerencie e receba ordens de compra. A IA pode gerar uma ordem de compra sugerida automaticamente. Ao receber um pedido, o sistema atualiza o estoque e também o **custo médio** do insumo.

### 📋 **Fichas Técnicas**
- **Custeio de Pratos (CMV):** Associe ingredientes e sub-receitas aos seus pratos para calcular o custo exato de cada um em tempo real.
- **Baixa Automática de Estoque:** Ao vender um prato, o sistema deduz automaticamente os ingredientes do estoque com base na ficha técnica.
- **Vincular Sub-receitas ao Estoque:** Transforme uma sub-receita (ex: "Molho de Tomate") em um item de estoque controlável, permitindo a gestão da produção intermediária.
- **Otimização com IA (Gemini):** Descreva um prato e deixe a IA gerar uma sugestão de ficha técnica. Para receitas já prontas, a IA pode fornecer **dicas de otimização de mise en place** para agilizar o preparo.

### 🔪 **Mise en Place**
- **Planejamento de Produção:** Crie quadros de tarefas diários para a preparação de sub-receitas e tarefas personalizadas (ex: "Limpar câmara fria").
- **Atribuição e Acompanhamento:** Atribua tarefas para funcionários e estações específicas e acompanhe o progresso em tempo real (A Fazer, Em Preparo, Concluído).
- **Integração com Estoque:** Ao concluir uma tarefa de produção, o sistema gera um **número de lote** para rastreabilidade, calcula o **custo total da produção** e dá baixa nos insumos, adicionando o item final (a sub-receita produzida) ao estoque.
- **Acesso Rápido:** Visualize a ficha técnica completa diretamente do card da tarefa, sem precisar sair da tela.

### 📅 **Reservas**
- **Configuração Flexível:** Defina seus horários de funcionamento para cada dia da semana, duração padrão da reserva, capacidade de pessoas por mesa e antecedência máxima.
- **Gestão Interna:** Cadastre e gerencie reservas diretamente no sistema, com visão diária ou uma visão geral dos próximos 15 dias.
- **Página Pública de Reservas:** Ative uma página pública onde seus clientes podem fazer reservas online 24/7, respeitando suas regras e capacidade.

### 👥 **Recursos Humanos (RH)**
- **Cadastro Completo de Funcionários:** Gerencie informações pessoais, de contato, contratuais, de pagamento e bancárias de toda a equipe.
- **Escalas de Trabalho:** Crie e publique escalas de trabalho semanais. Apenas escalas publicadas são visíveis para não-gerentes.
- **Controle de Ponto:** Monitore e realize ajustes manuais nos registros de entrada, saída e pausas dos funcionários. O registro em si é feito pelo funcionário logado.
- **Gestão de Ausências:** Aprove ou rejeite solicitações de férias e folgas. Os funcionários têm uma tela para solicitar e acompanhar suas próprias ausências.
- **Folha de Pagamento:** Calcule uma prévia da folha de pagamento com base nas horas trabalhadas, considerando **horas extras com base em limites diários e semanais**, e gere **contracheques (holerites)** detalhados e prontos para impressão.

### 💖 **CRM e Fidelidade**
- **Cadastro de Clientes:** Base de dados completa de clientes com histórico de consumo, pontos de fidelidade e observações.
- **Visão 360° do Cliente:** Visualize o histórico completo de consumo e de pontos de fidelidade em uma tela detalhada.
- **Programa de Fidelidade:** Configure um sistema de pontos por valor gasto e crie recompensas flexíveis: **desconto fixo (R$), desconto percentual (%) ou um item grátis** do seu cardápio.
- **Resgate no PDV:** Permita que os clientes resgatem suas recompensas diretamente ao fazer um novo pedido na mesa ou no caixa.

### 🚀 **Performance e Relatórios**
- **Relatórios Financeiros Completos:** Gere relatórios detalhados com Faturamento, Custo (CMV), Lucro Bruto e Resultado Líquido.
- **Análise Comparativa:** Compare o desempenho de vendas entre diferentes períodos para identificar tendências.
- **Análise de Horários de Pico:** Visualize graficamente os horários e dias da semana com maior volume de vendas para otimizar sua operação.
- **Análise de Desempenho por Prato:** Descubra quais são seus pratos mais lucrativos com relatórios que incluem receita, custo, lucro total e margem de lucro por item.
- **Construtor de Relatórios:** Crie relatórios personalizados selecionando colunas, filtros e agrupamentos para extrair os dados exatos que você precisa.
- **Desempenho da Equipe:** Monitore as vendas, gorjetas e ticket médio de cada funcionário, além da produtividade da cozinha por tarefas concluídas e tempo de preparo.

### ⚙️ **Configurações e Cardápio Online**
- **Gestão Centralizada:** Cadastre funcionários, estações de produção, fornecedores, categorias de ingredientes, categorias de pratos (com imagem) e os dados da sua empresa (com logo).
- **Cargos e Permissões:** Crie cargos personalizados (ex: Garçom, Caixa) e defina quais telas cada cargo pode acessar, garantindo segurança e controle.
- **Cardápio Online:** O sistema gera automaticamente um **QR Code** e um link para um cardápio online público e elegante, que inclui uma página de capa, o menu e uma página de informações com horários de funcionamento e contato.

### 🎓 **Tutoriais**
- **Central de Ajuda Integrada:** Guias passo a passo com imagens que ensinam a usar todas as funcionalidades do sistema, desde a configuração inicial até as operações mais avançadas.

---

## 🗺️ Roadmap de Futuras Funcionalidades

Para continuar evoluindo o ChefOS, planejamos implementar novas funcionalidades focadas em aumentar a lucratividade, eficiência e a experiência do cliente.

### 🎯 Alta Prioridade (Foco em Core Business e Lucratividade)

*   **Módulo de Delivery e Integrações:**
    *   **Integração com Marketplaces:** Recebimento automático de pedidos do iFood, Rappi, etc., diretamente no PDV e KDS.
    *   **Gestão de Entregadores:** Acompanhamento do status dos entregadores (próprios ou da plataforma).
    *   **Cardápio Específico para Delivery:** Gestão de preços e disponibilidade de itens para entrega.

*   **Módulo de Relatórios Avançados:**
    *   **Dashboard de CMV vs. Vendas:** Acompanhamento da saúde financeira em tempo real.

*   **Melhorias no PDV:**
    *   **Divisão de Conta por Item:** Permitir que clientes em uma mesma mesa paguem apenas o que consumiram.
    *   **Integração com Pagamento na Mesa:** Suporte para maquininhas de cartão que se comunicam com o sistema para fechar a conta na mesa.
    *   **Gestão de Combos e Modificadores:** Interface aprimorada para criação de ofertas "monte seu combo" e modificadores complexos.

### ⭐ Média Prioridade (Melhorias de Eficiência e Usabilidade)

*   **Módulo de Estoque Avançado:**
    *   **Controle de Desperdício:** Ferramenta para registrar perdas de insumos de forma detalhada (vencimento, quebra, etc.) para análise de custos.

*   **Gestão de Vouchers e Cupons:**
    *   Criação e controle de cupons de desconto para uso no PDV.

*   **Melhorias no Módulo de RH:**
    *   **Gestão de Documentos:** Armazenamento digital de contratos e documentos dos funcionários.
    *   **Avaliações de Desempenho:** Registro e acompanhamento de feedbacks e avaliações periódicas.
    *   **Comunicação Interna:** Mural de avisos e comunicados para a equipe.

*   **Melhorias no KDS:**
    *   **Suporte a "Bump Bar":** Permitir a finalização de comandas com teclados físicos.
    *   **Consulta de Ficha Técnica:** Acesso rápido à receita ou modo de preparo diretamente na tela da comanda.

### 💡 Baixa Prioridade (Expansão e "Nice-to-haves")

*   **Módulo de Multi-loja/Franquias:**
    *   **Gestão Centralizada:** Controle de cardápio, funcionários e relatórios para múltiplas unidades.
    *   **Relatórios Consolidados:** Visão geral do desempenho de toda a rede.

*   **Módulo de Eventos:**
    *   **Gestão de Reservas para Grupos:** Ferramenta para agendamento e organização de eventos fechados.
    *   **Orçamentos e Cardápios Personalizados:** Criação de pacotes e menus específicos para eventos.

*   **Módulo de Marketing:**
    *   **Campanhas de E-mail/SMS:** Envio de promoções para a base de clientes cadastrados no CRM.

---

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído com uma stack moderna e performática:

- **Frontend:** **Angular v20+**
  - **Standalone Components:** Arquitetura 100% baseada em componentes independentes, sem NgModules.
  - **Signals:** Gerenciamento de estado reativo, performático e intuitivo.
  - **Zoneless Change Detection:** Performance máxima ao eliminar a necessidade do Zone.js.
- **Backend & Database:** **Supabase**
  - **PostgreSQL:** Banco de dados relacional robusto.
  - **Authentication:** Gerenciamento de usuários seguro.
  - **Realtime Subscriptions:** Sincronização de dados em tempo real entre todos os clientes conectados.
- **Inteligência Artificial:** **Google Gemini API**
  - Utilizada para as funcionalidades de geração de fichas técnicas e previsão de estoque.
- **UI / Styling:** **Tailwind CSS**
  - Framework CSS utility-first para uma prototipagem rápida e um design consistente.
- **Linguagem:** **TypeScript**
  - Tipagem estática para um código mais seguro e manutenável.

---

## ⚙️ Instalação e Configuração

Para executar este projeto, você precisa de credenciais para o Supabase e para a API do Google Gemini.

1.  **Crie um Projeto no Supabase:**
    - Vá para [supabase.com](https://supabase.com/) e crie um novo projeto.
    - No seu projeto, vá para `Project Settings` > `API`.
    - Copie a **URL** e a **chave anônima (`anon key`)**.

2.  **Obtenha uma Chave da API Gemini:**
    - Vá para o [Google AI Studio](https://aistudio.google.com/).
    - Clique em "Get API key" e copie sua chave.

3.  **Configure as Variáveis de Ambiente:**
    - Abra o arquivo `src/config/environment.ts`.
    - Substitua os valores placeholders pelas suas credenciais:

    ```typescript
    export const environment = {
      supabaseUrl: 'SUA_URL_DO_SUPABASE',
      supabaseAnonKey: 'SUA_CHAVE_ANONIMA_DO_SUPABASE',
      geminiApiKey: 'SUA_API_KEY_DO_GEMINI',
    };
    ```

4.  **Estrutura do Banco de Dados:**
    - O sistema espera uma estrutura de banco de dados específica. Utilize o schema SQL fornecido no projeto (se aplicável) para configurar suas tabelas no Supabase.

5.  **Execute o Projeto:**
    - Após configurar as credenciais, o projeto está pronto para ser executado. Sirva o arquivo `index.html` em um servidor web.

---

## 📁 Estrutura do Projeto

```
/src
|-- /app.component.*         # Componente Raiz
|-- /app.routes.ts           # Definição das rotas
|-- /components/             # Módulos e componentes da aplicação
|   |-- /auth/               # Login, seleção de funcionário
|   |-- /cashier/            # Tela do Caixa
|   |-- /dashboard/          # Tela do Dashboard
|   |-- /employees/          # Gestão de Funcionários
|   |-- /inventory/          # Tela de Estoque
|   |-- /kds/                # Tela do KDS
|   |-- /leave-management/   # Gestão de ausências (Gerente)
|   |-- /menu/               # Cardápio online (interno)
|   |-- /mise-en-place/      # Planejamento de produção
|   |-- /my-leave/           # Solicitação de ausência (Funcionário)
|   |-- /payroll/            # Folha de Pagamento
|   |-- /performance/        # Análise de desempenho
|   |-- /pos/                # Ponto de Venda
|   |-- /public-booking/     # Página pública de reservas
|   |-- /purchasing/         # Gestão de compras
|   |-- /reports/            # Geração de relatórios
|   |-- /reservations/       # Gestão interna de reservas
|   |-- /schedules/          # Gestão de escalas
|   |-- /settings/           # Configurações gerais
|   |-- /technical-sheets/   # Fichas técnicas
|   |-- /time-clock/         # Controle de ponto
|   |-- /tutorials/          # Central de ajuda
|   |-- /shared/             # Componentes compartilhados (modais, etc.)
|-- /config/                 # Arquivos de configuração (environment)
|-- /guards/                 # Guards de autenticação e permissão
|-- /models/                 # Interfaces e tipos (TypeScript)
|-- /services/               # Lógica de negócio e comunicação com APIs
|   |-- auth.service.ts      # Autenticação principal
|   |-- supabase-state.service.ts # Gerenciamento de estado e Realtime
|   |-- ai-recipe.service.ts # Integração com Gemini API
|   |-- ... e outros
```

---

## 📄 Licença

Este projeto é distribuído sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.