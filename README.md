# ChefOS - Sistema de Gestão para Restaurantes

**ChefOS** é uma plataforma de gestão para restaurantes completa, moderna e integrada. Desenvolvido com as tecnologias mais recentes, ele oferece uma solução completa para otimizar operações, desde o atendimento ao cliente no Ponto de Venda (PDV) até o controle de estoque, gestão de RH, reservas e análise de desempenho, tudo sincronizado em tempo real.

O sistema foi projetado para ser intuitivo, eficiente e poderoso, incorporando inteligência artificial para auxiliar em tarefas complexas como a criação de fichas técnicas e a previsão de compras.

---

## 🚀 Acesso e Instalação

ChefOS é uma plataforma de gestão completa, com versões disponíveis para **Web**, **Windows** e **Android**, garantindo que você possa gerenciar seu negócio de qualquer lugar.

Para começar a usar, testar o sistema ou baixar os aplicativos, acesse nosso site oficial:

**[https://chefos.koresolucoes.com.br](https://chefos.koresolucoes.com.br)**

### Como Começar:

- **Cadastro Gratuito:** O registro na plataforma é totalmente gratuito e permite que você explore as funcionalidades do sistema.
- **Planos Disponíveis:** Para utilizar todos os recursos de forma contínua e gerenciar seu restaurante, é necessário assinar um dos nossos planos flexíveis. Confira os detalhes no site.
- **Seja um Beta Tester:** Quer ter acesso antecipado às novas funcionalidades e nos ajudar a moldar o futuro do ChefOS? Inscreva-se em nosso programa de beta testers através do site!
- **Download dos Aplicativos:** Encontre os links para download das versões para desktop (Windows) e mobile (Android) diretamente na nossa página oficial.

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

### 🛵 **Integração com iFood**
#### KDS para iFood
- **Webhook Bidirecional:** Receba pedidos do iFood diretamente no sistema e mantenha os status sincronizados em tempo real. O sistema captura eventos de novos pedidos, confirmações, despachos, prontos para retirada, conclusões e cancelamentos.
- **Gestão de Status Completa:** Confirme, inicie o preparo, despache para entrega ou marque como pronto para retirada, tudo dentro do ChefOS. As atualizações são enviadas automaticamente para o iFood.
- **Tratamento de Cancelamentos:** Gerencie cancelamentos de pedidos (iniciados pelo cliente ou pelo restaurante) de forma integrada.
- **KDS Dedicado:** Uma tela de KDS otimizada para a operação de delivery, mostrando informações cruciais como ID do pedido iFood, tipo (entrega/retirada) e endereço do cliente.
- **Visualizador de Logs:** Uma ferramenta para depuração que exibe todos os eventos recebidos do webhook do iFood, ajudando a diagnosticar problemas de comunicação.

#### Cardápio iFood
- **Sincronização Inteligente:** Sincronize itens do seu cardápio ChefOS com o iFood. O sistema identifica itens já sincronizados, modificados ou que ainda não foram enviados.
- **Requisito de Código Externo:** Apenas itens com um "Código Externo" (SKU) definido na Ficha Técnica podem ser sincronizados, garantindo uma integração robusta.
- **Visão "Ao Vivo" do Cardápio:** Uma aba exclusiva que busca e exibe seu cardápio *exatamente* como ele está no iFood, mostrando categorias, itens, imagens e preços.
- **Ações Rápidas:** Altere o **preço** e a **disponibilidade** de um item diretamente na visão "ao vivo", e a alteração é enviada imediatamente para o iFood.
- **Criação de Categorias:** Crie novas categorias no seu cardápio do iFood diretamente pelo ChefOS.

### 💰 **Caixa (Cashier)**
- **Fila de Pagamento:** Visualize todas as mesas que estão aguardando para pagar em uma tela dedicada.
- **Venda Rápida:** Um PDV simplificado para vendas no balcão. Os pedidos podem ser pagos na hora ou enviados para a cozinha para pagamento posterior.
- **Fechamento de Conta Completo:** Processe pagamentos de mesas e vendas rápidas. Suporta **múltiplos métodos de pagamento** para dividir a conta.
- **Gestão de Caixa:** Registre despesas, confira o saldo e realize o fechamento de caixa detalhado, que compara o valor esperado com o contado e gera um resumo para impressão.
- **Reimpressão:** Acesse o histórico de vendas do dia para reimprimir recibos ou conferir detalhes de um pedido.

### 📦 **Estoque e Compras**
- **Controle de Insumos:** Gerencie todos os seus ingredientes, custos, unidades, fornecedores e categorias.
- **Alertas Automatizados:** O dashboard sinaliza itens com estoque baixo, próximos ao vencimento ou parados há muito tempo.
- **Controle de Lotes:** Registre números de lote e datas de validade para insumos recebidos, garantindo total rastreabilidade.
- **Contagem de Estoque (Auditoria):** Uma tela dedicada para realizar a contagem física do inventário. O sistema mostra a diferença entre o estoque contado e o do sistema e permite ajustar tudo com um único clique.
- **Previsão com IA (Gemini):** Utilize o histórico de vendas para prever a necessidade de compra de insumos para a próxima semana.
- **Ordens de Compra:** Crie, gerencie e receba ordens de compra. A IA pode gerar uma ordem de compra sugerida automaticamente. Ao receber um pedido, o sistema atualiza o estoque e também o **custo médio** do insumo.

### 📋 **Fichas Técnicas**
- **Custeio Preciso de Pratos (CMV):** Saiba exatamente quanto custa cada item do seu menu. Associe ingredientes e sub-receitas para ter um cálculo de CMV em tempo real e garantir sua margem de lucro.
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

*   **Melhorias na Integração de Delivery:**
    *   **Integração com outros Marketplaces:** Suporte para Rappi e outras plataformas de delivery.
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

### 🔌 Integração via API Externa

O ChefOS oferece uma API externa para que sistemas de terceiros, como totens de autoatendimento ou aplicativos de delivery próprios, possam enviar pedidos diretamente para o sistema. Os pedidos entram na fila do KDS e do Caixa como qualquer outro pedido interno.

#### Autenticação

A autenticação é feita através de uma chave de API Bearer. Você pode gerar e encontrar sua chave em `Configurações > Funcionalidades > API de Pedidos Externos`.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/external-order`

Use este endpoint para buscar o cardápio disponível de um restaurante.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.

**Exemplo de Requisição:**

```
GET https://gastro.koresolucoes.com.br/api/external-order?restaurantId=SEU_USER_ID_AQUI
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**

```json
{
  "menu": [
    {
      "name": "Hambúrguer Clássico",
      "description": "Pão, carne, queijo e salada.",
      "price": 30.00,
      "external_code": "HB-CLASSICO"
    },
    {
      "name": "Refrigerante",
      "description": null,
      "price": 8.00,
      "external_code": "REFRI-LATA"
    }
  ]
}
```
**Importante:** Apenas itens com um **"Código Externo"** definido na Ficha Técnica serão retornados.

---

#### `POST /api/external-order`

Use este endpoint para criar um novo pedido.

**Exemplo de Corpo da Requisição (JSON):**

```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "tableNumber": 15,
  "orderTypeLabel": "Totem de Autoatendimento 1",
  "externalId": "pedido-totem-xyz-123",
  "customer": {
    "name": "João Ninguém",
    "phone": "11987654321"
  },
  "items": [
    {
      "externalCode": "HB-CLASSICO",
      "quantity": 2,
      "notes": "Um sem picles, por favor."
    },
    {
      "externalCode": "REFRI-LATA",
      "quantity": 2,
      "price": 7.50
    }
  ]
}
```

**Campos do Corpo da Requisição:**

*   `restaurantId` (obrigatório): String. O ID do seu usuário no sistema ChefOS.
*   `tableNumber` (obrigatório): Número. O número da mesa para pedidos "Dine-in". Use `0` para vendas de balcão/retirada ("QuickSale").
*   `orderTypeLabel` (opcional): String. Um rótulo para identificar a origem do pedido (ex: "Totem 1", "App de Entrega").
*   `externalId` (opcional): String. Um ID único do sistema de origem para referência.
*   `customer` (opcional): Objeto. Dados do cliente. Se o nome já existir, o pedido será associado ao cliente existente; caso contrário, um novo cliente será criado.
    *   `name` (obrigatório se `customer` for enviado): String.
    *   `phone` (opcional): String.
    *   `email` (opcional): String.
*   `items` (obrigatório): Array de objetos.
    *   `externalCode` (obrigatório): String. O código do item, conforme retornado pela API do cardápio (`GET`).
    *   `quantity` (obrigatório): Número.
    *   `notes` (opcional): String. Observações para a cozinha.
    *   `price` (opcional): Número. Permite sobreescrever o preço padrão do item para este pedido específico.

**Exemplo de Resposta (Sucesso 201 Created):**

```json
{
  "success": true,
  "message": "Order created successfully and sent to KDS.",
  "orderId": "uuid-do-pedido-criado-no-chefos"
}
```

**Respostas de Erro:**

*   **400 Bad Request:** Erro de validação no corpo da requisição (ex: campos faltando).
*   **401 Unauthorized / 403 Forbidden:** Chave de API inválida ou `restaurantId` incorreto.
*   **404 Not Found:** Um ou mais `externalCode` de itens não foram encontrados no cardápio.
*   **500 Internal Server Error:** Ocorreu um erro no servidor ao processar o pedido.

---

#### `PATCH /api/external-order`

Use este endpoint para adicionar itens a um pedido existente que esteja aberto.

**Corpo da Requisição (JSON):**

```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "orderId": "uuid-do-pedido-aberto-no-chefos",
  "items": [
    {
      "externalCode": "HB-CLASSICO",
      "quantity": 1,
      "notes": "Extra bacon."
    },
    {
      "externalCode": "REFRI-LATA",
      "quantity": 1
    }
  ]
}
```

**Campos:**

*   `restaurantId` (obrigatório): String.
*   `orderId` (obrigatório): String. O `orderId` retornado pelo ChefOS ao criar o pedido.
*   `items` (obrigatório): Array de objetos, com a mesma estrutura do `POST`.

**Resposta (Sucesso 200 OK):**

```json
{
  "success": true,
  "message": "Items added to order successfully.",
  "orderId": "uuid-do-pedido-aberto-no-chefos"
}
```

---

### 🔌 API de Clientes

O ChefOS expõe uma API para gerenciamento de clientes, permitindo a integração com sistemas de fidelidade, CRMs ou aplicativos personalizados.

A autenticação segue o mesmo padrão da API de pedidos, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/clientes`

Use este endpoint para buscar clientes. Se nenhum parâmetro de busca for fornecido, todos os clientes do restaurante serão retornados.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.
*   `search` (opcional): String de busca. Procura por nome, telefone, email ou CPF.
*   `id` (opcional): O UUID de um cliente específico para buscar seus detalhes.

**Exemplo de Requisição (busca):**
```
GET https://gastro.koresolucoes.com.br/api/clientes?restaurantId=SEU_USER_ID&search=João
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (busca, 200 OK):**
```json
[
  {
    "id": "uuid-do-cliente-123",
    "name": "João Ninguém",
    "phone": "11987654321",
    "email": "joao@email.com",
    "cpf": "111.222.333-44",
    "notes": "Prefere mesa perto da janela.",
    "loyalty_points": 150,
    "user_id": "SEU_USER_ID_AQUI",
    "created_at": "..."
  }
]
```

**Exemplo de Requisição (por ID):**
```
GET https://gastro.koresolucoes.com.br/api/clientes?restaurantId=SEU_USER_ID&id=uuid-do-cliente-123
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```
**Exemplo de Resposta (por ID, 200 OK):** Retorna um único objeto de cliente, como o do array acima.

---

#### `POST /api/clientes`

Use este endpoint para cadastrar um novo cliente.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "name": "Maria Nova",
  "phone": "21912345678",
  "email": "maria@email.com",
  "cpf": "444.555.666-77",
  "notes": "Cliente novo, primeira visita."
}
```

**Campos:**

*   `restaurantId` (obrigatório): String.
*   `name` (obrigatório): String.
*   `phone`, `email`, `cpf`, `notes` (opcionais): String.

**Resposta (Sucesso 201 Created):** Retorna o objeto do cliente recém-criado.

---

#### `PATCH /api/clientes`

Use este endpoint para adicionar ou remover pontos de fidelidade de um cliente. Esta operação registra a movimentação no histórico do cliente.

**Query Parameters:**

*   `id` (obrigatório): O UUID do cliente a ser atualizado.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "loyalty_points_change": 50,
  "description": "Bônus por indicação"
}
```
*Um valor negativo em `loyalty_points_change` remove pontos.*

**Campos:**

*   `restaurantId` (obrigatório): String.
*   `loyalty_points_change` (obrigatório): Número. A quantidade de pontos a adicionar (positivo) ou remover (negativo).
*   `description` (obrigatório): String. O motivo da movimentação (ex: "Acúmulo por compra", "Resgate de prêmio").

**Resposta (Sucesso 200 OK):** Retorna o objeto completo e atualizado do cliente.

---

### 🔌 API de Reservas

A API de Reservas permite a integração com sistemas externos para consulta de disponibilidade e criação de novas reservas, como o "Reservar com o Google" ou o site do restaurante.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/reservas`

Use este endpoint para consultar os horários disponíveis.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.
*   `action` (obrigatório): Deve ser `disponibilidade`.
*   `data` (obrigatório): A data desejada no formato `YYYY-MM-DD`.
*   `numero_pessoas` (obrigatório): A quantidade de pessoas para a reserva.

**Exemplo de Requisição:**
```
GET https://gastro.koresolucoes.com.br/api/reservas?restaurantId=SEU_USER_ID&action=disponibilidade&data=2024-10-26&numero_pessoas=4
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**
```json
{
  "availability": [
    "19:00",
    "19:30",
    "20:00",
    "21:00"
  ]
}
```
*A lista estará vazia se não houver horários disponíveis ou se o restaurante estiver fechado no dia.*

---

#### `POST /api/reservas`

Use este endpoint para criar uma nova reserva.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "customer_name": "Ana Silva",
  "customer_phone": "11987654321",
  "customer_email": "ana.silva@email.com",
  "party_size": 4,
  "reservation_time": "2024-10-26T19:30:00.000Z",
  "notes": "Preferência por mesa na janela."
}
```

**Campos:**

*   `restaurantId` (obrigatório): String.
*   `customer_name` (obrigatório): String. Nome do cliente.
*   `party_size` (obrigatório): Número. Quantidade de pessoas.
*   `reservation_time` (obrigatório): String ISO 8601 (UTC). Data e hora exatas da reserva.
*   `customer_phone` (opcional): String.
*   `customer_email` (opcional): String.
*   `notes` (opcional): String.

**Resposta (Sucesso 201 Created):** Retorna o objeto completo da reserva recém-criada, com status "PENDING".

```json
{
    "id": "uuid-da-reserva-criada",
    "user_id": "SEU_USER_ID_AQUI",
    "customer_name": "Ana Silva",
    "customer_email": "ana.silva@email.com",
    "customer_phone": "11987654321",
    "party_size": 4,
    "reservation_time": "2024-10-26T19:30:00+00:00",
    "notes": "Preferência por mesa na janela.",
    "status": "PENDING",
    "created_at": "..."
}
```
*As reservas criadas via API ficam com status "Pendente" para que a equipe do restaurante possa confirmá-las no painel do ChefOS.*

---

### 🔌 API de Cardápio e Estoque

API aprimorada para consulta de cardápio com disponibilidade em tempo real e gerenciamento de estoque.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/cardapio-estoque`

Use este endpoint para buscar o cardápio detalhado ou a lista de insumos.

**Ação Padrão (Cardápio Detalhado):**

Retorna o cardápio com um campo booleano `disponivel_estoque` que indica se há insumos suficientes para produzir o item.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.

**Exemplo de Requisição:**
```
GET https://gastro.koresolucoes.com.br/api/cardapio-estoque?restaurantId=SEU_USER_ID_AQUI
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**
```json
[
    {
        "id": "uuid-da-receita",
        "name": "Hambúrguer Clássico",
        "description": "Pão, carne, queijo e salada.",
        "price": 30.00,
        "external_code": "HB-CLASSICO",
        "image_url": "...",
        "category_name": "Lanches",
        "disponivel_estoque": true
    },
    {
        "id": "uuid-da-receita-2",
        "name": "Pizza Especial",
        "description": "Molho, queijo, e ingredientes especiais.",
        "price": 65.00,
        "external_code": "PZ-ESPECIAL",
        "image_url": null,
        "category_name": "Pizzas",
        "disponivel_estoque": false
    }
]
```

**Ação `insumos` (Lista de Insumos):**

Retorna a lista de ingredientes do estoque.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário.
*   `action` (obrigatório): `insumos`.
*   `status` (opcional): `estoque_baixo` para filtrar apenas itens com estoque abaixo do mínimo.

**Exemplo de Requisição:**
```
GET https://gastro.koresolucoes.com.br/api/cardapio-estoque?restaurantId=SEU_USER_ID&action=insumos&status=estoque_baixo
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**
```json
[
  {
    "id": "uuid-do-ingrediente",
    "name": "Carne de Hambúrguer",
    "stock": 500,
    "min_stock": 1000,
    "unit": "g",
    "cost": 0.05
  }
]
```
---

#### `PUT /api/cardapio-estoque`

Use este endpoint para alterar a disponibilidade manual de um item no cardápio (disponível/indisponível).

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário.
*   `external_code` (obrigatório): O código externo do item a ser atualizado.

**Corpo da Requisição (JSON):**
```json
{
  "is_available": false
}
```

**Campos:**
* `is_available` (obrigatório): Booleano. `true` para tornar o item disponível, `false` para indisponível.

**Resposta (Sucesso 200 OK):** Retorna o objeto completo e atualizado da receita.

---

### 🔌 API de Relatórios e Performance

A API de Relatórios permite que sistemas externos, como softwares de contabilidade ou ferramentas de BI (Business Intelligence), consumam dados de performance do restaurante.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/relatorios`

Use este endpoint para obter dados de performance. Você deve especificar a ação desejada (`vendas` ou `performance_itens`) e o período.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.
*   `action` (obrigatório): O tipo de relatório. Valores possíveis: `vendas`, `performance_itens`.
*   `data_inicio` (obrigatório): A data de início do período no formato `YYYY-MM-DD`.
*   `data_fim` (obrigatório): A data de fim do período no formato `YYYY-MM-DD`.

**Exemplo de Requisição (Resumo de Vendas):**
```
GET https://gastro.koresolucoes.com.br/api/relatorios?restaurantId=SEU_USER_ID&action=vendas&data_inicio=2024-08-01&data_fim=2024-08-31
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (action=vendas, 200 OK):**
```json
{
  "faturamento_bruto": 15230.50,
  "custo_total_cmv": 4890.15,
  "lucro_bruto": 10340.35,
  "total_pedidos": 450,
  "ticket_medio": 33.84
}
```

**Exemplo de Requisição (Performance de Itens):**
```
GET https://gastro.koresolucoes.com.br/api/relatorios?restaurantId=SEU_USER_ID&action=performance_itens&data_inicio=2024-08-01&data_fim=2024-08-31
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (action=performance_itens, 200 OK):**
```json
[
  {
    "nome_item": "Hambúrguer Clássico",
    "quantidade_vendida": 250,
    "receita_total": 7500,
    "custo_total": 2125,
    "lucro_total": 5375,
    "margem_lucro_percentual": 71.66
  },
  {
    "nome_item": "Pizza Margherita",
    "quantidade_vendida": 80,
    "receita_total": 4000,
    "custo_total": 1200,
    "lucro_total": 2800,
    "margem_lucro_percentual": 70
  }
]
```

---

### 🔌 API de Conta

A API de Conta permite que sistemas externos interajam com o status de pagamento de uma mesa.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`

---

#### `GET /api/account`

Use este endpoint para obter um resumo completo do pedido aberto de uma mesa. Isso é ideal para que um cliente possa visualizar sua conta em um totem ou aplicativo antes de solicitar o fechamento.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.
*   `tableNumber` (obrigatório): O número da mesa para a qual o resumo da conta está sendo solicitado.

**Exemplo de Requisição:**
```
GET https://gastro.koresolucoes.com.br/api/account?restaurantId=SEU_USER_ID_AQUI&tableNumber=15
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**
```json
{
  "orderId": "uuid-do-pedido-aberto",
  "tableNumber": 15,
  "customer": {
    "name": "João Ninguém",
    "phone": "11987654321"
  },
  "items": [
    {
      "name": "Hambúrguer Clássico",
      "quantity": 2,
      "price": 30.00,
      "total": 60.00,
      "notes": "Um sem picles, por favor."
    },
    {
      "name": "Refrigerante",
      "quantity": 2,
      "price": 8.00,
      "total": 16.00,
      "notes": null
    }
  ],
  "summary": {
    "subtotal": 76.00,
    "serviceFee": 7.60,
    "total": 83.60
  }
}
```
*Se nenhum cliente estiver associado à mesa, o campo `customer` será `null`.*

**Respostas de Erro:**

*   **404 Not Found:** Nenhuma ordem aberta encontrada para a mesa especificada.

---

#### `POST /api/account`

Use este endpoint para solicitar que uma mesa seja movida para o status de pagamento. Isso fará com que a mesa apareça na fila do Caixa.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "tableNumber": 15
}
```

**Campos:**

*   `restaurantId` (obrigatório): String. O ID do seu usuário no sistema ChefOS.
*   `tableNumber` (obrigatório): Número. O número da mesa para a qual a conta está sendo solicitada.

**Exemplo de Resposta (Sucesso 200 OK):**
```json
{
  "success": true,
  "message": "Table #15 status updated to 'PAGANDO'."
}
```

**Respostas de Erro:**

*   **400 Bad Request:** A mesa não está no status "OCUPADA" ou faltam campos na requisição.
*   **401 Unauthorized / 403 Forbidden:** Chave de API inválida ou `restaurantId` incorreto.
*   **404 Not Found:** A `tableNumber` especificada não foi encontrada.
*   **500 Internal Server Error:** Ocorreu um erro no servidor.

---

### 🔌 API de Fidelidade (Recompensas)

A API de Recompensas permite que um sistema externo gerencie os prêmios do programa de fidelidade.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`
---
#### `GET /api/recompensas`

Use este endpoint para listar todas as recompensas de fidelidade ativas para um restaurante.

**Query Parameters:**

*   `restaurantId` (obrigatório): O ID do seu usuário no sistema ChefOS.

**Exemplo de Requisição:**
```
GET https://gastro.koresolucoes.com.br/api/recompensas?restaurantId=SEU_USER_ID_AQUI
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

**Exemplo de Resposta (Sucesso 200 OK):**
```json
[
  {
    "id": "uuid-da-recompensa-1",
    "name": "Refrigerante Grátis",
    "description": "Troque seus pontos por um refrigerante lata.",
    "points_cost": 50,
    "type": "free_item",
    "value": "REFRI-LATA"
  },
  {
    "id": "uuid-da-recompensa-2",
    "name": "R$10 de Desconto",
    "description": "Use seus pontos para ganhar R$10 de desconto na sua compra.",
    "points_cost": 100,
    "type": "discount_fixed",
    "value": "10.00"
  }
]
```
**Campos da Resposta:**

*   `id`: O UUID da recompensa.
*   `name`: O nome do prêmio.
*   `points_cost`: Quantidade de pontos necessários.
*   `type`: O tipo de recompensa (`free_item`, `discount_fixed`, `discount_percentage`).
*   `value`: O valor da recompensa. Para `free_item`, é o `external_code` do produto. Para descontos, é o valor numérico.

---
#### `POST /api/recompensas`

Use este endpoint para criar uma nova recompensa de fidelidade.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "name": "Sobremesa Grátis",
  "description": "Qualquer sobremesa da casa por 120 pontos.",
  "points_cost": 120,
  "reward_type": "free_item",
  "reward_value": "SKU-DA-SOBREMESA",
  "is_active": true
}
```

**Campos:**
*   `restaurantId` (obrigatório): String.
*   `name` (obrigatório): String. Nome do prêmio.
*   `description` (opcional): String.
*   `points_cost` (obrigatório): Número. Custo em pontos.
*   `reward_type` (obrigatório): String. Tipo (`free_item`, `discount_fixed`, `discount_percentage`).
*   `reward_value` (obrigatório): String. Para `free_item`, deve ser o **`external_code`** de um item do cardápio. Para os outros, o valor do desconto.
*   `is_active` (opcional): Booleano. Padrão é `true`.

**Resposta (Sucesso 201 Created):** Retorna o objeto completo da recompensa recém-criada.

---
#### `PATCH /api/recompensas`

Use este endpoint para atualizar uma recompensa existente.

**Query Parameters:**
*   `id` (obrigatório): O UUID da recompensa a ser atualizada.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "points_cost": 150,
  "is_active": false
}
```

**Campos:**
*   `restaurantId` (obrigatório): String.
*   Todos os campos do `POST` são **opcionais** e podem ser enviados para atualização.

**Resposta (Sucesso 200 OK):** Retorna o objeto completo e atualizado da recompensa.

---

### 🔌 API de Pagamentos

A API de Pagamentos permite que um sistema externo (como um totem de autoatendimento) registre pagamentos e finalize um pedido.

A autenticação segue o mesmo padrão, usando uma chave Bearer.

**Header:** `Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA`
---
#### `POST /api/payments`

Use este endpoint para registrar um ou mais pagamentos para um pedido aberto e finalizá-lo.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "orderId": "uuid-do-pedido-aberto-no-chefos",
  "payments": [
    { "method": "Cartão de Crédito", "amount": 50.00 },
    { "method": "PIX", "amount": 33.60 }
  ]
}
```

**Campos:**

*   `restaurantId` (obrigatório): String.
*   `orderId` (obrigatório): String. O `orderId` do pedido aberto no ChefOS.
*   `payments` (obrigatório): Array de objetos de pagamento.
    *   `method` (obrigatório): String. A forma de pagamento (ex: "Cartão de Crédito", "Dinheiro", "PIX").
    *   `amount` (obrigatório): Número. O valor pago neste método.

*A soma dos valores em `payments` deve ser maior ou igual ao total do pedido.*

**Resposta (Sucesso 200 OK):**
```json
{
  "success": true,
  "message": "Payment processed and order completed successfully."
}
```

**Respostas de Erro:**

*   **400 Bad Request:** Requisição inválida ou a soma dos pagamentos é insuficiente.
*   **404 Not Found:** O `orderId` não foi encontrado ou não está mais aberto.
*   **500 Internal Server Error:** Ocorreu um erro interno ao processar o pagamento.

---

### 🔌 API de Recursos Humanos (RH)

A API de RH oferece um conjunto completo de endpoints para integrar sistemas externos de gestão de pessoal, controle de ponto e contabilidade.

**Base da API:** `/api/rh`

A autenticação segue o mesmo padrão das outras APIs, usando uma chave Bearer e o `restaurantId`.

---

#### **Recurso: Funcionários (`/api/rh/funcionarios`)**

Gerencia a informação básica dos funcionários.

*   **`GET /`**
    *   **Ação:** Lista todos os funcionários ativos.
    *   **Resposta (200 OK):** Array de objetos de funcionário.

*   **`POST /`**
    *   **Ação:** Cria um novo funcionário.
    *   **Corpo (JSON):** Objeto com os dados do funcionário (nome, cargo, PIN, etc.).
    *   **Resposta (201 Created):** O objeto do funcionário recém-criado.

*   **`GET /{id}`**
    *   **Ação:** Obtém os detalhes de um funcionário específico, incluindo um resumo de desempenho.
    *   **Resposta (200 OK):** Objeto completo do funcionário.

*   **`PATCH /{id}`**
    *   **Ação:** Atualiza a informação de um funcionário.
    *   **Corpo (JSON):** Objeto com os campos a serem atualizados.
    *   **Resposta (200 OK):** O objeto do funcionário atualizado.

*   **`DELETE /{id}`**
    *   **Ação:** Desativa (ou remove) um funcionário do sistema.
    *   **Resposta (204 No Content):** Nenhuma resposta.

---

#### **Recurso: Cargos e Permissões (`/api/rh/cargos`)**

Gerencia os cargos e o que cada um pode acessar.

*   **`GET /`**
    *   **Ação:** Lista todos os cargos (roles).
    *   **Resposta (200 OK):** Array de objetos `Role`.

*   **`GET /{id}/permissoes`**
    *   **Ação:** Lista as permissões de um cargo específico.
    *   **Resposta (200 OK):** Array de strings com as chaves de permissão (ex: `["/pos", "/kds"]`).

*   **`PUT /{id}/permissoes`**
    *   **Ação:** Define (sobrescreve) a lista completa de permissões para um cargo.
    *   **Corpo (JSON):** `{ "permissions": ["/pos", "/cashier"] }`
    *   **Resposta (200 OK):** Sucesso.

*   **`GET /permissoes-disponiveis`**
    *   **Ação:** Endpoint de ajuda que lista todas as chaves de permissão possíveis no sistema.
    *   **Resposta (200 OK):** `["/dashboard", "/pos", "/kds", ...]`

---

#### **Recurso: Controle de Ponto (`/api/rh/ponto`)**

Ideal para integração com sistemas de relógio de ponto biométricos ou totens.

*   **`GET /`**
    *   **Ação:** Obtém os registros de ponto (`TimeClockEntry`) para um período.
    *   **Query Params:** `data_inicio=YYYY-MM-DD`, `data_fim=YYYY-MM-DD`, `employeeId=...`
    *   **Resposta (200 OK):** Array de `TimeClockEntry`.

*   **`POST /bater-ponto`**
    *   **Ação:** Simula um funcionário batendo o ponto (entrada/saída/pausa) usando seu PIN.
    *   **Corpo (JSON):** `{ "pin": "1234" }`
    *   **Lógica:** O sistema identifica o funcionário pelo PIN e seu estado atual (se está em turno, em pausa, etc.) e registra a ação apropriada (início de turno, início de pausa, fim de pausa ou fim de turno).
    *   **Resposta (200 OK):** `{ "status": "TURNO_INICIADO", "employeeName": "Ana Gerente" }`

*   **`POST /` (Ajuste Manual)**
    *   **Ação:** Adiciona um registro de ponto manualmente (para correções).
    *   **Corpo (JSON):** `{ "employee_id": "...", "clock_in_time": "...", "clock_out_time": "..." }`
    *   **Resposta (201 Created):** O novo registro criado.

*   **`PATCH /{id}` (Ajuste Manual)**
    *   **Ação:** Corrige um registro de ponto existente.
    *   **Resposta (200 OK):** O registro atualizado.

---

#### **Recurso: Escalas (`/api/rh/escalas`)**

Permite a consulta e publicação de escalas de trabalho.

*   **`GET /`**
    *   **Ação:** Obtém as escalas (`Schedule`) e seus turnos (`Shift`) para um período.
    *   **Query Params:** `data_inicio=YYYY-MM-DD`, `data_fim=YYYY-MM-DD`
    *   **Resposta (200 OK):** Array de `Schedule` com seus `Shifts` aninhados.

*   **`POST /{id}/publicar`**
    *   **Ação:** Publica uma escala (torna `is_published = true`), tornando-a visível para os funcionários.
    *   **Resposta (200 OK):** Sucesso.

---

#### **Recurso: Folha de Pagamento (`/api/rh/folha-pagamento`)**

Endpoint de apenas leitura para integração com softwares de contabilidade.

*   **`GET /resumo`**
    *   **Ação:** Gera um resumo da prévia da folha de pagamento para um período.
    *   **Query Params:** `mes=MM`, `ano=YYYY`
    *   **Lógica:** Replica os cálculos do componente de Folha de Pagamento, considerando horas trabalhadas, horas extras (acima de 9h/dia e 44h/semana), salário base e multiplicador de hora extra.
    *   **Resposta (200 OK):** Um JSON detalhado com totais e dados por funcionário.

    ```json
    {
      "periodo": "Setembro/2024",
      "totais": {
        "total_a_pagar": 12500.50,
        "total_horas_extras": 80.5,
        "total_horas_trabalhadas": 750.0
      },
      "funcionarios": [
        {
          "employeeId": "uuid-do-funcionario",
          "name": "Ana Gerente",
          "cargo": "Gerente",
          "horas_agendadas": 160,
          "horas_trabalhadas": 170.5,
          "horas_extras": 10.5,
          "salario_base": 3000.00,
          "valor_horas_extras": 500.75,
          "total_a_pagar": 3500.75
        }
      ]
    }
    ```

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

## 📁 Estrutura do Projeto

` ``
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
` ``

---

## 📄 Licença

Este projeto é distribuído sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.