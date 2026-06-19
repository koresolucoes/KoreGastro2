# Relatório de Concorrência e Tendências de Mercado - Foodtech & POS (2026)

## 1. Visão Geral do Mercado (Perspectiva 2026)
O mercado de sistemas de gestão para food service (POS/ERP) em 2026 evoluiu de softwares reativos para **sistemas proativos e autônomos**. A automação baseada em Inteligência Artificial e a experiência "Zero-Touch" tornaram-se o novo padrão. Os donos de restaurantes não querem mais apenas planilhas e PDVs para registrar dados; eles querem que o sistema tome decisões sozinho (como sugerir compras, alterar preços e enviar promoções).

## 2. Principais Concorrentes (Brasil & Global)
*   **Nacionais (Brasil) - Saipos, Consumer, Goomer, TOTVS Chef, Kyte, Aiqfome (ERP):**
    *   *Forças:* Forte presença local, integrações maduras com logística (iFood, Rappi) e fiscalização sólida (SEFAZ).
    *   *Fraquezas:* Arquiteturas legadas pesadas em transição, lentidão para adotar IA generativa de forma nativa e ecossistemas muitas vezes engessados e separados (ex: KDS que não conversa bem com o RH).
*   **Globais - Toast, Square for Restaurants, Lightspeed:**
    *   *Forças:* Ecossistema de hardware proprietário embutido, análise avançada de dados corporativos e empréstimos/capital integrados.

## 3. Onde Nosso Sistema Está Forte (Status Atual)
Analisando nossa base de código atual, já possuímos uma base extremamente competitiva e, em muitos pontos, superior aos softwares legados do mercado:
*   **Integração Omnicanal Nativa:** APIs robustas para iFood (Webhook, Catálogos) já embutidas, sem precisar de agregadores terceiros.
*   **Ecossistema de Pagamentos Modular:** Integrações com Cielo Lio, Mercado Pago, Rede e Stone no mesmo ambiente.
*   **Backoffice 360º Profundo:** Temos módulos complexos como RH gerencial (Ausências, Bater Ponto, Escalas) e Gestão de Folha de Pagamento, o que normalmente força o restaurante a assinar um software separado no mercado atual.
*   **Operacional e Mise-en-place:** Fichas técnicas, auditoria de inventário impecável e foco no KDS da cozinha.

---

## 4. O Que Precisamos Adicionar (Gaps Tecnológicos para Dominar em 2026)
Para não apenas competir, mas **criar um abismo de inovação** sobre os players atuais, precisamos focar nestas 5 verticais de IA e automação inteligente:

### A. Assistente de Pedidos por IA (WhatsApp & Voz Autônomo)
*   **O que é:** Um agente autônomo baseado em IA (ex: integrado com Gemini) que conversa de forma natural com o cliente no WhatsApp, tira dúvidas do cardápio, sugere harmonizações (up-sell inteligente) e injeta o pedido validado direto no nosso KDS/POS sem intervenção humana.
*   **Por que:** 80% do delivery próprio no Brasil ainda passa por WhatsApp. Os concorrentes usam bots "burros" baseados em botões numéricos (`Digite 1 para Pizza`). Uma IA conversacional fluida destrói a concorrência e zera os custos de atendentes de balcão.

### B. Precificação Dinâmica Multi-Canal (Smart Pricing Engine)
*   **O que é:** Ajuste automático e inteligente de preços nos menus digitais e no iFood. O sistema aumenta centavos ou reais automaticamente se detectar pico de demanda, chuva (maior volume de delivery) ou falta de motoristas.
*   **Por que:** Inspirado na lógica do Uber, maximiza a margem de lucro nos horários de pico. Praticamente nenhum sistema brasileiro tem isso integrado à gestão de mesas e delivery cross-platform.

### C. Compras e Estoque Preditivo de Zero Esforço
*   **O que é:** O módulo de `Purchasing/Inventory` não deve apenas avisar que a cebola acabou. Ele deve cruzar as vendas passadas, a previsão do tempo para a semana e os eventos da cidade para *prever* a demanda e **gerar a ordem de compra automaticamente**, aguardando apenas um clique de aprovação do chef.
*   **Por que:** Reduz drasticamente custos e desperdícios ("Loss Report") – o maior gargalo para a sobrevivência de um restaurante.

### D. CRM de Retenção Hiper-Personalizado e Silencioso (Auto-Marketing)
*   **O que é:** O sistema varre os logs das catracas, pedidos na mesa e iFood. Se identificar que um "Cliente VIP" não aparece ou não pede há 20 dias, emite automaticamente um SMS ou mensagem contendo um link exclusivo com pacote de desconto pré-aprovado via Mercado Pago.
*   **Por que:** Softwares antigos focam em atrair clientes. Em 2026, quem tem o menor churn (perda de clientes) vence. A fidelidade invisível agrega alto ROI para os parceiros.

### E. Cardápio Digital "TikTok-izado" (Social Commerce & Vídeo/AR)
*   **O que é:** Nossos menus QR (`Menu-Checkout`) atualizados para exibir vídeos curtos e dinâmicos em loop na foto do prato em vez de imagens 2D estáticas.
*   **Por que:** Consumidores de novas gerações tomam decisões de compra sendo estimulados por vídeos. Plataformas com menus em vídeo ou Realidade Aumentada aumentam o ticket médio em cerca de 25%.

---

## 5. Próximos Passos (Plano de Ação)
Para começarmos essa transição imediata e nos destacarmos, a recomendação é modernizar a stack começando pelos módulos com maior apelo de marketing para vendas do nosso software:

1.  **Sprint 1:** Implementar do **Dashboard de Estoque Preditivo por IA**, transformando nosso `Inventory` numa ferramenta preditiva.
2.  **Sprint 2:** Criar o módulo **Marketing CRM Automático**, vinculando o banco de clientes atual (`/api/v2/customers`) a disparos automatizados de recompensa/cupom.
3.  **Sprint 3:** Desenvolver um proxy de entrada de **Chatbot com Gemini** escutando o webhook (WhatsApp), conectando ao `api/public-order.ts`.
