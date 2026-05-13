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

### 🏢 **Multi-Loja e Painel de Administração**
- **Gestão Centralizada:** Gerencie múltiplas unidades ou franquias com um único login de Master Admin.
- **Painel de Administração Global:** Acesse métricas de faturamento agregado, MRR, Total de Lojas e gerencie faturamento SAAS geral.
- **Clonagem e Transferência de Unidade:** Configure novas filiais rapidamente clonando categorias, receitas, ingredientes e fichas técnicas de uma unidade modelo ("Matriz").
- **Troca Contextual Rápida:** Alterne seu ambiente de gestão entre lojas instantaneamente sem realizar logout.
- **Segregação Rigorosa de Dados:** Cada loja atua com seu próprio cardápio, estoque físico local e escala individual de funcionários.

### 💳 **Gestão Financeira e Integrações de Pagamento (Novo!)**
- **Integração Omnichannel Cielo:** Pagamentos totalmente integrados ao PDV via API da Cielo nas modalidades **Transações Online (Cartões)**, **Pix Copia e Cola / QR Code** e **TEF via Maquininhas Cielo LIO**.
- **Gestão Automática de Taxas (MDR):** Cálculo e o desconto direto das taxas e comissões da adquirente (Cielo) a cada nova venda finalizada, abatendo no lançamento final para precisão contábil.
- **Conciliação e Fluxo de Caixa (Novo):** Visualização consolidada das Receitas (brutas), Despesas (taxas de cartão, sangrias) e Gorjetas, além do histórico das transações diárias geradas no Caixa.
- **Histórico e Reimpressão de Vendas:** Acesso analítico a todos os cupons não-fiscais e recibos das últimas operações.

### 📊 **Dashboard Analítico**
- **Visão Geral Dinâmica:** KPI reports na entrada do sistema, rastreando conversões no tempo real.
- **Métricas Chave de Desempenho:** Venda total bruta x líquida, **Lucro Bruto**, **Ticket Médio**, fluxo das mesas ocupadas, itens com risco de quebra de estoque, e volume da cozinha.
- **Cockpit DRE & CMV:** Análise gráfica do Faturamento Operacional versus o Custo Real das Mercadorias Vendidas (CMV) ao longo dos últimos dias, com cálculos de depreciação diária.
- **Rentabilidade por Produto:** Ranking instantâneo com os itens mais vendidos e suas reais **margens de lucro** para ajustes do preço de venda estratégico.

### 🍽️ **PDV (Ponto de Venda) e Salão**
- **Gestão Visual de Mesas & Grid:** Planeje setores e organize o salão com um editor Drag-and-Drop dinâmico. Status em tempo real colorizado (`Livre`, `Ocupada`, `Fechamento`).
- **Comandas Eletrônicas Individuais:** Separação por conta e cliente; atrele clientes individualmente para gerenciar suas comandas e facilitar o rateamento na hora do pagamento.
- **UX para Alta Velocidade:** PDV rápido focado no toque (touch-friendly), cardápio instantâneo e com alerta de `Falta de Insumos` baseado na requisição do estoque atrás da receita.
- **Recibo Inteligente via WhatsApp:** Fluxo rápido de envio automático do cupom discriminado com a divisão das contas direto para o celular da mesa.

### 🛵 **Integração Completa com iFood & Delivery Próprio**
#### iFood Integrado Bidirecionalmente
- **Sincronização Reversa e Catálogo Dinâmico:** Carga de produtos automática. Modifique os preços no Ponto de Venda e atualize no iFood ou vice-versa.
- **KDS Omnichannel de Delivery:** Pedidos iFood (e de fontes externas) chegam unificados à Cozinha/Expedição. Aceite/rejeite disputas, visualize rotas e valide os códigos (entregadores).
- **Controle de Loja Remotamente:** Pause, abra e gerencie horários de serviço das plataformas pela própria dashboard financeira.

#### Gestor de Motoqueiros e Fluxo Proprietário
- **Painel Kanban Tático:** Crie cartões drag-and-drop de cada Delivery (`Produção` -> `Em Rota` -> `Entregue`).
- **Controle de Frota de Retaguarda:** Crie rotas de mapa para entregadores internos com acompanhamento e cobrança detalhada por zona de KM.

### 📦 **Estoque Inteligente e Fichas Técnicas**
- **Custeio Rigoroso e CMV na Veia:** Construa composições que deduzem matéria-prima (gr/ml) a cada prato vendido.
- **Porcionamento e Desossa:** Registre a entrada da caixaria bruta de mercado (Ex: Peça Inteira) e o transforme (Yielding) em porções utilitárias abatendo perdas ou re-aproveitando aparas.
- **Gestão Híbrida de Ruptura (Requisições):** Subtração diária ou transferências seguras entre 'Almoxarifado Geral', 'Câmeras Frias' e o 'Estoque de Venda - Praça'.
- **Gerador de Etiquetas PVPS da ANVISA:** Geração PDF de Etiquetas de Lote / Manipulação e Validade para produtos abertos, adequando 100% o restaurante com a vigilância.
- **Sugestão de Reposição Generativa com AI:** Relatórios do Gemini LLM interpretando a tendência de consumo e gerando listas automáticas de Mercado.

### 🍳 **Automação KDS (Kitchen Display System)**
- Pedidos fluem em roteadores digitais (`Bar`, `Parrila`, `Cozinha Fria`) reduzindo o desperdício analógico com comandas de papel.
- Módulos avançados com "Modo de Expedição (Expo)" separando entrega rápida do despacho real com rastreador de atrasos.

### 👥 **Módulo Completo de Recursos Humanos (RH)**
- **Holerite e Cálculo Trabalhista:** Sistema gerador de folhas, acúmulos por Cargo (ACL), horas noturnas e de domingos/feriados.
- **Ponto Anti-Fraude com GPS:** Feito para PWA Mobile. Validação geográfica e de Raio Wi-fi na assinatura do Relógio de Ponto diário (Entradas e Saídas).
- **Escala Smart:** Distribuição de Turnos Visuais (Manhã, Almoço, Madrugada) e Gestão de Ausências Médicas/Féries de colabores centralizada no Gerente.

### 🧾 **Emissão Fiscal Simplificada**
- Integração `Focus NFe`, enviando a parametrização do SAT e a geração dos comprovantes CFe/NFCe direto ao Governo ao final de todo PDV ou mesa. Suporte a certificado digital A1.

### 🔌 **Arquitetura Aberta REST, Webhooks e APIs**
O ecossistema é preparado para crescer de acordo com qualquer ERP do mercado. Consuma sua própria máquina:
- [Documentação Core de Recursos Webhooks](API.md)
- [Documentação da Nova Engine API V2 (GraphQL e REST Caching)](apiv2.md)
- [Explorar Swagger UI (Interactive API Docs)](/docs/index.html)
- **Engine V2 Caching:** Interoperabilidade profunda. CRUD aberto a PDVs de Terceiros e salões via `/orders`, atualização instantânea das prateleiras por robôs, entre outros gatilhos em Webhook Realtime (`transaction.created`, `order.paid`).
- Total independência - use o Webhook para disparar Pagers de restaurante físico.

---

## 🛠️ Stack Tecnológico e Engenharia

ChefOS foi pensado sobre a prateleira superior de frameworks de alto desempenho a prova de Serverless e Cold Starts:

- **Frontend Application PWA:** Construído nativamente com **Angular 20+**.
  - Padronização em Componentes Single File **Standalone** & **Zoneless** approach.
  - Signal-Driven Reativity para máxima performance e uso baixo de RAM em Caixas e Maquininhas Android.
- **Core de Gestão Banco de Dados & RLS Auth:** Powered by **Supabase**.
  - Roteamento nativo e Queries pelo PostgreSQL.
  - Row Level Security (RLS) avançado. Multi-tenant real; ninguem acessa matriz errada.
  - Supabase Realtime Channels cuidando das inserções do KDS via Socket.
- **Infraestrutura LLM (Generativa):** **Google Gemini API** (Modelos multi-modo atuando sobre fichas técnicas, imagens, e tendências de reposição logística de pratos).
- **Estética & Layouts:** Tailwind CSS 4+ UI com micro-interações sem JavaScript pesado.
- **Design de API Server e Gatilhos:** API Node.js V2 na ponta.
- **Payments:** SDK Integração API Cielo E-Commerce 3.0 / LIO.

---

## 📄 Termos de Uso e Licença

Este software é um modelo distribuído e disponibilizado sob os termos da licença aplicada ao projeto. Recomendamos que todo clone do Supabase aplique suas próprias restrições e políticas de ambiente ao subir a aplicação de forma particular. Consulte as instâncias correspondentes no módulo `LICENSE`.
