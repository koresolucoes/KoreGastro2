# ChefOS - Sistema de Gestão para Restaurantes

**ChefOS** é uma plataforma de gestão para restaurantes completa, moderna e integrada. Desenvolvido com as tecnologias mais recentes, ele oferece uma solução ponta a ponta para otimizar operações, desde o atendimento ao cliente no Ponto de Venda (PDV) até o controle de estoque, gestão de RH, reservas, conciliação financeira e análise de desempenho, tudo sincronizado em tempo real.

O sistema foi projetado para ser intuitivo, eficiente e poderoso, incorporando inteligência artificial e integrações multi-plataformas para auxiliar em tarefas complexas, garantindo fluidez e escalabilidade.

---

## 🚀 Acesso e Instalação

ChefOS é uma plataforma omnichannel de gestão completa, com interfaces e endpoints desenhados para rodar na **Web**, **Windows** e **Android**, garantindo que você possa gerenciar seu negócio de qualquer lugar.

Para começar a usar, testar o sistema ou baixar os aplicativos, acesse nosso ambiente de prévias.

### Como Começar:

- **Cadastro Gratuito:** O registro inicial na plataforma é gratuito e permite que você explore as funcionalidades de infraestrutura básica do sistema.
- **Planos Disponíveis:** Para gerenciar seu restaurante utilizando todos os recursos de forma contínua, você pode assinar planos dimensionados à sua operação.
- **Ecossistema:** Encontre relatórios gerenciais e controle total do ciclo de vida dos seus produtos.

---

## ✨ Funcionalidades Principais e Módulos

O ChefOS adota uma arquitetura modular que cobre todas as esferas críticas da administração gastronômica. 

### 1. 🏢 Multi-Loja e Painel de Administração
- **Gestão Centralizada:** Gerencie múltiplas unidades ou franquias com um único login de Master Admin.
- **Painel de Administração Global:** Acesse métricas de faturamento agregado, MRR, Total de Lojas e gerencie faturamento SAAS geral.
- **Clonagem e Transferência de Unidade:** Configure novas filiais rapidamente clonando categorias, receitas, ingredientes e fichas técnicas de uma unidade modelo ("Matriz").
- **Troca Contextual Rápida:** Alterne seu ambiente de gestão entre lojas instantaneamente sem realizar logout.
- **Segregação Rigorosa de Dados:** Cada loja atua com seu próprio cardápio, estoque físico local e escala individual de funcionários.

### 2. 🍽️ PDV (Ponto de Venda) e Salão
- **Gestão Visual de Mesas & Grid:** Planeje setores e organize o salão com um editor Drag-and-Drop dinâmico. Status em tempo real colorizado (`Livre`, `Ocupada`, `Fechamento`).
- **Comandas Eletrônicas Individuais:** Separação por conta e cliente; atrele clientes individualmente para gerenciar suas comandas e facilitar o rateamento na hora do pagamento.
- **PDV Balcão (Fast-food):** Modo de terminal de lançamentos rápidos para operações de balcão e Takeout.
- **Cardápio Digital Público & Pedido na Mesa:** Geração de QR Codes por mesa. Clientes podem acessar o cardápio no próprio celular, fazer pedidos direto para o KDS e visualizar a conta em tempo real.
- **Split de Conta e Pagamento Variável:** Divisão da conta por pessoa ou por itens, com suporte a múltiplos métodos de pagamento simultâneos na mesma mesa.
- **Gestão de Reservas (Widget & Dashboard):** Mapa de controle de reservas de mesas e link público (Widget) para clientes realizarem agendamentos pelo Instagram ou site.

### 3. 🛵 Delivery, Logística & Inteligência Artificial (WhatsApp)
- **Atendimento Automatizado via IA (WhatsApp):** Agente de Inteligência Artificial nativo integrado ao WhatsApp (API Oficial). A IA atende os clientes, tira dúvidas sobre o cardápio, anota pedidos, entende variações e endereços, enviando o pedido diretamente para o PDV e KDS automaticamente.
- **Notificações de Status no WhatsApp:** Disparos automáticos no WhatsApp do cliente informando atualizações (Pedido Confirmado, Em Preparo, Pronto/Em Rota).
- **Integração iFood Bidirecional:** Carga de produtos automática. Modifique os preços no ChefOS e atualize no iFood. Pedidos do iFood chegam direto ao KDS unificado. Controle status da loja (Aberta/Fechada) remotamente.
- **Kanban de Roteirização e Entregas (Delivery Próprio):** Painel Drag-and-Drop tático (`Awaiting` -> `Em Preparo` -> `Pronto para Envio` -> `Em Rota`).
- **Gestão de Frota e Motoboys:** Atribuição de pedidos a entregadores internos, cálculo de rotas no mapa, cálculo dinâmico de taxa por KM e prestação de contas no final do turno.

### 4. 🍳 Cozinha & KDS (Kitchen Display System)
- **KDS Unificado Omnichannel:** Pedidos de Salão, Delivery Próprio, Cardápio Digital QR e iFood chegam em uma única tela organizada cronologicamente.
- **Roteamento por Estações de Produção:** Separe a produção por praças (Ex: Grelha, Fritadeira, Bar, Sobremesas). Os itens de um mesmo pedido vão para as telas corretas, de forma assíncrona.
- **Mise-en-place e Painel de Preparos:** Gestão da praça com previsão diária dos ingredientes que precisam ser porcionados, descongelados ou picados para o dia de serviço.
- **Modo de Expedição (Expo):** Tela exclusiva para o passador/expedidor conferir a montagem final das bandejas e liberar os pratos com tracking de atrasos por cores.

### 5. 📦 Estoque, Fichas Técnicas & Compras
- **Engenharia de Cardápio (Fichas Técnicas):** Construa composições que deduzem matéria-prima (gr/ml) a cada prato vendido de forma rigorosa. Custeio automático (CMV Teórico).
- **Controle de Estoque Híbrido:** Gestão por almoxarifados ou prateleiras. Controle de Perdas e Desperdícios com justificativas.
- **Porcionamento e Desossa:** Registre a entrada da caixaria bruta de mercado (Ex: Peça Inteira) e o transforme (Yielding) em porções utilitárias abatendo perdas ou reaproveitando aparas.
- **Módulo de Compras e Cotação:** Cadastro de fornecedores, geração de Pedidos de Compra com previsão orçamentária e reconciliação cega no Recebimento de Mercadorias.
- **Requisições Internas:** Fluxo de transferências rastreáveis e solicitações de reposição entre a Cozinha e o Almoxarifado Central.
- **Sugestão de Reposição Generativa com AI (Gemini):** O sistema analisa o histórico de vendas, sazonalidade e inventário atual usando o LLM do Google, gerando uma sugestão de Lista de Compras assertiva para a semana.
- **Gerador de Etiquetas PVPS (ANVISA):** Geração PDF de Etiquetas de Lote, Manipulação e Validade para produtos processados, adequando o restaurante 100% com a vigilância sanitária.

### 6. 💳 Financeiro & Relatórios Analytics
- **Integração Omnichannel Cielo:** Pagamentos totalmente integrados ao PDV via API da Cielo nas modalidades **Transações Online (Cartões)**, **Pix Copia e Cola / QR Code** e **TEF via Maquininhas Cielo LIO**.
- **Gestão Automática de Taxas (MDR):** Cálculo e o desconto direto das taxas e comissões da adquirente (Cielo) a cada nova venda finalizada, abatendo no lançamento final para precisão contábil.
- **Conciliação e Fechamento de Caixa:** Visualização consolidada das Receitas (brutas), Despesas (taxas de cartão, sangrias) e Gorjetas, além de histórico detalhado por operador.
- **Dashboard Analítico (DRE & CMV):** Análise gráfica do Faturamento Operacional versus o Custo Real das Mercadorias Vendidas (CMV). Gráficos de vendas diárias e Ticket Médio.
- **Relatório Curva ABC e Rentabilidade:** Ranking instantâneo com os itens mais vendidos e suas reais **margens de lucro** (Contribuição Marginal) para ajustes de preços estratégicos.

### 7. 👥 Gestão de Pessoas (RH) & Produtividade
- **Relógio de Ponto Eletrônico:** Ponto anti-fraude feito para PWA Mobile. Validação com registro de geolocalização e fotos via dispositivo do restaurante.
- **Escala de Trabalho (Schedules):** Distribuição visual e arrastável de turnos. O funcionário acessa seu aplicativo móvel (My Profile) para visualizar seus horários do mês.
- **Gestão de Ausências e Licenças (Leave Management):** Fluxo de aprovação de atestados, férias e dispensas. Os colaboradores solicitam folgas pelo app próprio.
- **Holerite e Adiantamentos (Payroll):** Cálculo inteligente da folha de pagamento baseando-se nas horas do Ponto Eletrônico, gorjetas proporcionais e vales concedidos no mês.
- **Analytics de Performance da Equipe:** Avaliação de produtividade por funcionário baseada no cumprimento de SLAs do KDS e taxa de erros nas preparações.

### 8. 🛡️ Qualidade, Segurança Alimentar & CRM
- **CRM Integrado:** Cadastro de Clientes e visualização de seu histórico completo de compras, métricas de Lifetime Value (LTV) e ticket médio.
- **Checklists Operacionais Dinâmicos:** Criação e execução de rotinas diárias exigidas pela gerência. Checklists de Abertura do Salão, Fechamento de Caixa, Limpeza da Cozinha, etc.
- **Logs de Temperaturas Haccp:** Formulários móveis para registro contínuo da temperatura das câmaras frias, freezers e vitrines, gerando auditoria digital de segurança alimentar (prevenção de contaminação e multas).

### 9. 🧾 Emissão Fiscal Simplificada
- Integração `Focus NFe`, enviando a parametrização do SAT e a geração dos comprovantes CFe/NFCe direto ao Governo ao final de todo PDV ou mesa. Suporte a certificado digital A1.

---

## 🔌 Arquitetura Aberta REST, Webhooks e APIs
O ecossistema é preparado para crescer de acordo com qualquer ERP do mercado. Consuma sua própria máquina:
- [Documentação Core de Recursos Webhooks](API.md)
- [Documentação da Nova Engine API V2 (GraphQL e REST Caching)](apiv2.md)
- [Explorar Swagger UI (Interactive API Docs)](/docs/index.html)
- **Engine V2 Caching:** Interoperabilidade profunda. CRUD aberto a PDVs de Terceiros e salões via `/orders`, atualização instantânea das prateleiras por robôs, entre outros gatilhos em Webhook Realtime (`transaction.created`, `order.paid`).

---

## 🛠️ Stack Tecnológico e Engenharia

ChefOS foi pensado sobre a prateleira superior de frameworks de alto desempenho a prova de Serverless e Cold Starts:

- **Frontend Application PWA:** Construído nativamente com **Angular 20+**.
  - Padronização em Componentes Single File **Standalone** & **Zoneless** approach.
  - Signal-Driven Reativity para máxima performance e uso baixo de RAM em Caixas e Maquininhas Android.
- **Core de Gestão Banco de Dados & RLS Auth:** Powered by **Supabase**.
  - Roteamento nativo e Queries pelo PostgreSQL.
  - Row Level Security (RLS) avançado. Multi-tenant real; ninguem acessa matriz errada.
  - Supabase Realtime Channels cuidando das inserções do KDS e status de mesas via WebSockets.
- **Infraestrutura LLM (Generativa):** **Google Gemini API** (Modelos multi-modo atuando sobre WhatsApp Chatbots, análise de cardápios, OCR de notas fiscais e tendências de reposição logística de pratos).
- **Estética & Layouts:** Tailwind CSS 4+ UI com micro-interações sem JavaScript pesado e componentes baseados em interfaces de uso extremo.
- **Design de API Server e Gatilhos:** API Node.js/Express na ponta, hospedada de forma distribuída (Cloud Run / Vercel Edge).
- **Payments:** SDK Integração API Cielo E-Commerce 3.0 / LIO.

---

## 📄 Termos de Uso e Licença

Este software é um modelo distribuído e disponibilizado sob os termos da licença aplicada ao projeto. Recomendamos que todo clone do Supabase aplique suas próprias restrições e políticas de ambiente ao subir a aplicação de forma particular. Consulte as instâncias correspondentes no módulo `LICENSE`.
