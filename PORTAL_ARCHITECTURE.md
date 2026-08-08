# Arquitetura Multi-Portal ChefOS (Monorepo)

O ChefOS foi estruturado para funcionar em dois portais distintos utilizando o mesmo repositório e base de código unificada:

1. **`portal.chefos.online`** → **Portal de Gestão, RH & Analytics**
2. **`app.chefos.online`** → **App Operacional (PDV, Mesas, KDS & Cozinha)**

---

## 📌 1. Distribuição de Módulos por Portal

### 🏢 **Portal de Gestão & RH (`portal.chefos.online`)**
Focado em proprietários, gerentes, contadores e gestão de pessoas:
- **Painel:** Visão Geral, Dashboards Financeiros, DRE, DREs, Tutoriais.
- **Cardápios & Fichas:** Editor de Cardápio, Produtos, Cardápio iFood, Fichas Técnicas de Preparo.
- **Estoque & Compras:** Estoque Geral, Auditoria, Requisições de Insumos, Porcionamento, Pedidos de Compra, Fornecedores.
- **Equipe & RH:** Cadastro de Funcionários, Ponto Eletrônico, Escalas de Trabalho, Ausências/Férias, Folha de Pagamento, Metas & Desempenho.
- **Gestão & Relatórios:** Relatórios Analíticos, Clientes & CRM, Gestão da Loja iFood.
- **Sistema:** Configurações Globais, Planos & Assinaturas, Suporte e Administração do Sistema.

### 🍕 **App Operacional (`app.chefos.online`)**
Focado em garçons, caixas, operadores de entrega, chefs e auxiliares de cozinha:
- **Atendimento & Vendas:** PDV (Ponto de Venda), Comandas & Mesas, Reservas, Delivery & Entregas, Atendimento WhatsApp, Fechamento de Caixa.
- **Cozinha & Produção:** KDS Principal (Telas de Pedidos de Produção), KDS iFood, Mise en Place, Checklists Operacionais, Controle de Temperaturas.
- **Pontos Rápidos:** Registro de Ponto Eletrônico Rápido (Bater Ponto por PIN/Facial) e Minhas Solicitações do Funcionário.

---

## ⚙️ 2. Configuração no Vercel

Ambos os domínios devem ser apontados para o mesmo projeto no Vercel:

1. Acesse o painel do Vercel no projeto do **ChefOS**.
2. Vá em **Settings** > **Domains**.
3. Adicione os dois domínios customizados:
   - `portal.chefos.online`
   - `app.chefos.online`
4. O Vercel atribuirá os certificados SSL/TLS automaticamente e aplicará as regras do `vercel.json` para ambas as URLs.

---

## 🔑 3. Configuração no Supabase (Autenticação Unificada)

Como ambos os portais compartilham a mesma sessão de usuário e banco de dados do Supabase:

1. Acesse o console do **Supabase**.
2. Vá em **Authentication** > **URL Configuration**.
3. Defina a **Site URL**: `https://portal.chefos.online`
4. Em **Redirect URLs**, adicione:
   - `https://portal.chefos.online/**`
   - `https://app.chefos.online/**`
   - `http://localhost:3000/**`

---

## 🧪 4. Teste em Modo de Desenvolvimento e Preview

No ambiente local ou de preview do AI Studio / Cloud Run:
- O **PortalContextService** detecta se está rodando em um dos domínios oficiais ou em ambiente de desenvolvimento.
- No ambiente de desenvolvimento, é ativado o **Alternador de Portais (Simulador Dev)** no topo da barra lateral (Sidebar).
- Você pode alternar instantaneamente entre **Portal Gestão**, **App Operacional** e **Modo Unificado (Dev)** para testar o comportamento da interface e dos filtros de menu em tempo real.
