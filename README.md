# ChefOS - Plataforma de Gestão Completa para Restaurantes

**ChefOS** é uma plataforma omnichannel de gestão para restaurantes completa, moderna e integrada. Desenvolvido com as tecnologias mais recentes, oferece uma solução de ponta a ponta para otimizar operações, desde o atendimento ao cliente no Ponto de Venda (PDV) e autoatendimento até o controle de estoque, gestão de RH, reservas, conciliação financeira e análise de desempenho, tudo sincronizado em tempo real.

O sistema foi desenhado em uma arquitetura flexível baseada em Nuvem, suportando operações simultâneas em múltiplos dispositivos, permitindo transições fluidas e alta escalabilidade.

---

## 🚀 Módulos e Funcionalidades Principais

O ChefOS adota uma arquitetura modular abrangendo todas as esferas críticas da administração gastronômica. 

### 1. 🍽️ PDV (Ponto de Venda) e Salão
- **Gestão Visual de Mesas & Grid:** Planeje setores e organize o salão com um editor Drag-and-Drop dinâmico. Status em tempo real colorizado (`Livre`, `Ocupada`, `Fechamento`).
- **Comandas Eletrônicas Individuais:** Separação por conta e cliente; atrele clientes individualmente para gerenciar suas comandas e facilitar o rateamento na hora do pagamento.
- **Cardápio Digital Público & Pedido na Mesa:** Geração de QR Codes por mesa. Clientes podem acessar o cardápio no celular, fazer pedidos diretamente e visualizar a conta em tempo real.
- **Split de Conta e Pagamento:** Divisão da conta por pessoa ou itens, com suporte a múltiplos métodos de pagamento simultâneos na mesma mesa.
- **Gestão de Reservas:** Mapa de controle de reservas de mesas e widget público.

### 2. 🍳 Cozinha & KDS (Kitchen Display System)
- **KDS Unificado Omnichannel:** Pedidos do Salão, Delivery, QR Code e iFood chegam em uma tela cronológica.
- **Roteamento por Praças:** Separe a produção por praças (ex: Grelha, Fritadeira, Bar).
- **Mise-en-place:** Gestão da praça com previsão diária de ingredientes a serem preparados.
- **Modo de Expedição (Expo):** Tela exclusiva para o passador conferir bandejas com rastreio de atrasos por cores.

### 3. 🛵 Delivery, Logística & IA (WhatsApp)
- **Atendimento Automatizado via IA (WhatsApp):** Agente Gemini integrado ao WhatsApp API que atende clientes, anota pedidos, entende variações e endereços, enviando pedidos direto para o PDV e KDS.
- **Integração iFood Bidirecional:** Sincronização automática de produtos, preços, disponibilidade de loja e importação unificada de pedidos.
- **Entregas & Motoboys:** Kanban Drag-and-Drop, cálculo de rotas no mapa (Leaflet) e acerto de taxas de entrega.

### 4. 📦 Estoque, Fichas Técnicas & Compras
- **Engenharia de Cardápio:** Fichas técnicas rigorosas para abatimento automático de matéria-prima (gr/ml) a cada venda (CMV Teórico).
- **Controle de Estoque e Compras:** Controle de perdas, geração de pedidos de compra e fluxo de requisições internas (Cozinha vs Almoxarifado Central).
- **Previsão Generativa:** Gemini AI analisa histórico de vendas e sazonalidade para gerar Listas de Compras precisas.

### 5. 💳 Financeiro & Relatórios Analytics
- **Conciliação Cielo LIO & e-Commerce:** Integração nativa para captura de transações (Crédito, Débito, PIX).
- **Dashboard Analítico (DRE, CMV & Curva ABC):** Gráficos D3.js detalhando Faturamento, Custos e as verdadeiras margens de lucro de cada prato.

### 6. 👥 Gestão de Pessoas (RH)
- **Ponto Eletrônico Mobile:** Registro com geolocalização e anti-fraude via dispositivo móvel.
- **Escalas e Holerites:** Distribuição de turnos visual, solicitações de folga e cálculo de folha de pagamento baseando-se nas horas reais e vales.

### 7. 🏢 Multi-Loja e Painel Global
- **Master Admin:** Gerenciamento de franquias, relatórios consolidados, clonagem de cardápios (Matriz) e troca de loja em tempo real.

---

## 🏗️ Arquitetura Multi-Portal

O projeto foi reestruturado para ser servido por dois portais principais no mesmo repositório, garantindo focos operacionais claros sem duplicar a base de código:

1. **`portal.chefos.online` (Portal de Gestão, RH & Analytics):**
   - Para gestores, donos e RH.
   - Focado em dashboards, engenharia de cardápio, criação de escalas, análise financeira e controle de estoque.
2. **`app.chefos.online` (App Operacional):**
   - Para a operação do dia-a-dia na linha de frente (Caixas, Garçons, Cozinheiros).
   - Focado no PDV, Controle de Mesas, KDS, Delivery, Ponto Eletrônico Rápido e Expedição.

*Nota: Em ambiente de desenvolvimento local, a aplicação unifica todos os recursos, adicionando um "Seletor de Portal" para facilitar testes end-to-end.*

---

## 🛠️ Stack Tecnológico

A aplicação foi construída sobre fundações resilientes visando performance e facilidade de deploy serverless:

- **Frontend:** Angular 20+ (Standalone & Zoneless) + Tailwind CSS (v4)
- **Engine de Compilação:** Vite + Angular CLI
- **BaaS (Backend as a Service):** Supabase (PostgreSQL 15+, Auth, RLS, Realtime WebSockets)
- **Inteligência Artificial:** Google GenAI API (Gemini)
- **Visualização de Dados e Mapas:** D3.js, Chart.js, Leaflet
- **Pagamentos & Integrações:** Cielo LIO, MercadoPago, Twilio/WhatsApp Webhooks, iFood API
- **Arquitetura API Serverless:** Node.js Edge APIs localizadas no diretório `/api/` e servidas na arquitetura Vercel/Cloud Run.

---

## 💻 Instalação e Desenvolvimento Local

### 1. Pré-requisitos
- Node.js versão 20+ ou 22+.
- Chaves do Supabase (URL, API Key).

### 2. Configuração do Ambiente
Crie o arquivo `.env` na raiz do projeto contendo as chaves necessárias (consulte `.env.example` se disponível):
```bash
SUPABASE_URL=sua_url_aqui
SUPABASE_ANON_KEY=sua_chave_anon_aqui
GEMINI_API_KEY=sua_chave_gemini_aqui
```

### 3. Executando o Projeto
```bash
# 1. Instalar as dependências
npm install

# 2. Rodar o servidor de desenvolvimento
npm run dev

# 3. Rodar a compilação de produção
npm run build
```
Acesse a aplicação via `http://localhost:3000` (porta gerida pelo servidor Vite).

---

## 🔒 Segurança

- **Row Level Security (RLS):** Toda query no Supabase é bloqueada no nível do banco para garantir que usuários acessem apenas dados associados aos seus `tenant_id` autorizados (garantia Multi-Loja/Franquia).
- **Proteção SSR e Edge:** Segredos (API Keys do iFood, Cielo, Gemini) trafegam apenas via API do lado servidor (funções localizadas em `/api/`). Nunca exponha essas chaves no código cliente Angular.

---

## 📄 Licença

ChefOS é um projeto fechado/sendo desenvolvido em plataforma SAAS. Consulte os mantenedores primários para maiores informações sobre licenciamento, cópias e deploys em servidores privados.
