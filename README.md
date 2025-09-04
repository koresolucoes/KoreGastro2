# ChefOS - Sistema de Gestão de Restaurantes

**ChefOS** é um sistema de gestão para restaurantes completo, moderno e integrado. Desenvolvido com as tecnologias mais recentes, ele oferece uma solução completa para otimizar operações, desde o atendimento ao cliente no Ponto de Venda (PDV) até o controle de estoque e análise de desempenho, tudo sincronizado em tempo real.

O sistema foi projetado para ser intuitivo, eficiente e poderoso, incorporando inteligência artificial para auxiliar em tarefas complexas como a criação de fichas técnicas e a previsão de compras.

---

## ✨ Funcionalidades Principais

O ChefOS é modular e cobre todas as áreas críticas da gestão de um restaurante:

### 📊 **Dashboard**
- **Visão Geral em Tempo Real:** Acompanhe os principais indicadores de desempenho (KPIs) assim que você entra no sistema.
- **Métricas Chave:** Vendas totais do dia, número de mesas ocupadas, itens com estoque baixo e pedidos pendentes na cozinha.
- **Análises Rápidas:** Gráficos com os itens mais vendidos e as transações mais recentes.

### 🍽️ **PDV (Ponto de Venda)**
- **Gerenciamento Visual de Mesas:** Crie múltiplos salões e organize as mesas com uma interface de arrastar e soltar (drag-and-drop).
- **Lançamento de Pedidos:** Uma interface rápida e intuitiva para garçons lançarem pedidos diretamente na mesa.
- **Status em Tempo Real:** As cores das mesas mudam instantaneamente (`Livre`, `Ocupada`, `Pagando`), mantendo toda a equipe sincronizada.
- **Ações Rápidas:** Imprima pré-contas e mova pedidos entre mesas com o menu de contexto.

### 🍳 **KDS (Kitchen Display System)**
- **Comandas Digitais:** Substitua as comandas de papel por um sistema digital eficiente que envia pedidos diretamente para as estações corretas (Cozinha, Bar, etc.).
- **Timers Inteligentes:** Cada item e pedido possui um timer de preparo, com cores que indicam o andamento e alertam sobre atrasos.
- **Modo "Expo":** Uma tela centralizada para o chef ou expedidor visualizar todos os itens prontos e garantir que os pedidos saiam completos e no tempo certo.
- **Lógica de Retenção (Hold):** O sistema calcula o tempo de preparo de cada item e segura os pratos mais rápidos para que tudo fique pronto ao mesmo tempo.

### 💰 **Caixa (Cashier)**
- **Venda Rápida:** Um PDV simplificado para vendas no balcão (takeout).
- **Fechamento de Conta:** Processe pagamentos das mesas enviadas pelo PDV com múltiplos métodos de pagamento.
- **Gestão de Caixa:** Registre despesas, confira o saldo e realize o fechamento de caixa detalhado com resumo para impressão.
- **Reimpressão:** Acesse o histórico de vendas do dia para reimprimir recibos ou conferir detalhes.

### 📈 **Estoque e Compras**
- **Controle de Insumos:** Gerencie todos os seus ingredientes, custos, unidades e fornecedores.
- **Ajustes de Estoque:** Dê entrada e saída de produtos com justificativas para um controle preciso.
- **Alertas Automatizados:** O sistema sinaliza itens com estoque baixo, próximos ao vencimento ou parados há muito tempo.
- **Previsão com IA (Gemini):** Utilize o histórico de vendas para prever a necessidade de compra de insumos para a próxima semana.
- **Ordens de Compra:** Crie, gerencie e receba ordens de compra. A funcionalidade de IA pode gerar uma ordem de compra sugerida automaticamente.

### 📋 **Fichas Técnicas**
- **Custeio de Pratos (CMV):** Associe ingredientes e sub-receitas aos seus pratos para calcular o custo exato de cada um.
- **Baixa Automática de Estoque:** Ao vender um prato, o sistema deduz automaticamente os ingredientes do estoque com base na ficha técnica.
- **Criação com IA (Gemini):** Descreva um prato e deixe a inteligência artificial gerar uma ficha técnica completa, sugerindo ingredientes e quantidades.

### 🚀 **Performance e Relatórios**
- **Desempenho da Equipe:** Monitore as vendas, gorjetas e ticket médio de cada funcionário.
- **Relatórios Customizáveis:** Gere relatórios de vendas e de itens mais vendidos por período para tomar decisões estratégicas.

### ⚙️ **Configurações e Cardápio Online**
- **Gestão Centralizada:** Cadastre funcionários (com PINs de acesso), estações de produção, categorias, fornecedores e mais.
- **QR Code para Cardápio:** O sistema gera automaticamente um QR Code para um cardápio online público, que os clientes podem acessar de seus celulares.

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
|   |-- /inventory/          # Tela de Estoque
|   |-- /kds/                # Tela do KDS
|   |-- ... e outros
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