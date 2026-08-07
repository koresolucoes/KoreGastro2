# Documentação Detalhada de Módulos - ChefOS
*Sistema Operacional Completo para Gastronomia e Restaurantes*

---

## Visão Geral da Arquitetura
O **ChefOS** adota uma arquitetura *enterprise* baseada no princípio de **Fonte Única da Verdade (Single Source of Truth)**. A plataforma integra em tempo real a cadeia de suprimentos, produção da cozinha, cardápios, vendas presenciais e online, gestão de RH e emissão fiscal.

---

## 1. Módulo: Atendimento, Vendas & Omnichannel (Front-of-House)

### 1.1. PDV, Salão e Comandas (`/pos`)
- **Mapa Visual de Mesas:** Disposição gráfica do salão com status em tempo real (Livre, Ocupada, Em Pagamento, Reservada).
- **Comandas Individuais & Balcão:** Abertura rápida de pedidos presenciais e para viagem.
- **Divisão Flexível de Contas:** Separação do valor total por número de pessoas, por itens consumidos ou pagamentos parciais em múltiplas formas.
- **Transferência e Agrupamento:** Transferência fácil de itens ou clientes entre mesas e junção de comandas.
- **Emissão de Pré-Conta e QR Code de Mesa:** Cliente pode visualizar a conta ou fazer pedidos direto do smartphone escaneando o QR Code da mesa.
- **Taxas de Serviço Customizáveis:** Aplicação e isenção configurável de taxa de serviço (ex: 10%, 12%).

### 1.2. Atendimento WhatsApp CRM (`/whatsapp-chats`)
- **Integração Oficial Webhook WhatsApp:** Envio de mensagens transacionais diretas para o WhatsApp do cliente.
- **Notificações Automáticas de Status:** Alertas automáticos ao cliente ("Pedido Confirmado", "Saindo para Entrega", "Disponível para Retirada").
- **Agente Virtual / Chatbot:** Atendimento inicial inteligente para dúvidas sobre horário de funcionamento, localização e envio do link do cardápio.

### 1.3. Gestão de Delivery Próprio (`/delivery`)
- **Painel de Despacho:** Acompanhamento centralizado de pedidos para entrega e retirada.
- **Atribuição de Entregadores:** Alocação de motoboys e controle do status da corrida.
- **Tabelas de Frete por Bairro ou Raio:** Configuração de taxas de entrega dinâmicas.
- **Rastreamento e Comprovantes:** Impressão de etiquetas de entrega com dados do cliente e endereço completo.

### 1.4. Caixa & Fechamento Financeiro (`/cashier`)
- **Abertura e Fechamento por Turno:** Controle rigoroso de suprimento (reforço) e sangrias de caixa.
- **Conciliação Multimeios de Pagamento:** Separação por Dinheiro, Pix, Cartão de Crédito/Débito, Vouchers (VR/VA) e iFood.
- **Relatório de Conferência Diária:** Identificação de divergências de caixa e valores esperados vs. apurados.

### 1.5. Reservas de Mesas (`/reservations` & `/book/:userId`)
- **Calendário Operacional de Reservas:** Agendamento por data, horário, quantidade de pessoas e área do restaurante.
- **Portal Público de Reservas:** Pagina dedicada para o cliente realizar a pré-reserva online.
- **Gestão de Status de Mesa:** Acompanhamento de chegadas, confirmações prévias e no-shows.

---

## 2. Módulo: Cozinha, Produção & Qualidade Sanitária (Back-of-House)

### 2.1. KDS Principal - Monitor da Cozinha (`/kds`)
- **Produção 100% Sem Papel:** Telas digitais para gerenciamento de pedidos em tempo real na cozinha.
- **Roteamento por Praças:** Envio automático de itens para estações específicas (Grelha, Saladas, Bar, Sobremesas).
- **Gestão de SLA por Cores:** Cronômetro com alertas visuais (Verde, Amarelo, Vermelho) e sonoros para tempos de preparo excedidos.

### 2.2. KDS iFood Integrado (`/ifood-kds`)
- **Integração Nativa iFood API:** Confirmação automática ou manual de pedidos vindos do iFood.
- **Gestão do Ciclo de Vida do Pedido:** Aceite, Notificação de Prontidão, Solicitação de Entregador e Despacho.
- **Controle de Código de Entrega (Handshake):** Validação obrigatória dos dígitos informados pelo entregador.
- **Central de Disputas e Cancelamentos:** Resposta a solicitações de cancelamento ou divergências direto pelo ChefOS.

### 2.3. Mise en Place & Pré-Preparo (`/mise-en-place`)
- **Cálculo da Demanda do Dia:** Estimativa baseada no histórico e vendas previstas para projetar a quantidade necessária de molhos, cortes e pré-preparos.
- **Fichas de Produção:** Instruções passo a passo de pré-preparo com rendimento e tempos de execução.

### 2.4. Checklists Operacionais (`/checklists`)
- **Listas de Verificação por Turno:** Rotinas obrigatórias de Abertura, Troca de Turno e Fechamento.
- **Auditoria Interna de Processos:** Controle de tarefas como limpeza de equipamentos, organização e descarte.

### 2.5. Controle Sanitário de Temperaturas (`/temperatures`)
- **Monitoramento de Equipamentos:** Registro diário de temperaturas de geladeiras, freezers, balcões frios e pass-throughs.
- **Relatório para Vigilância Sanitária (ANVISA):** Histórico completo auditável de conformidade térmica.

---

## 3. Módulo: Cardápios, Precificação & Engenharia de Menu

### 3.1. Gestão Central de Catálogo & Produtos (`/menu`)
- **Cadastro Unificado:** Produtos, grupos, categorias e complementos/adicionais.
- **Opções e Modificadores:** Configuração de regras (ex: mínimo 1, máximo 3 adicionais; obrigatório ponto da carne).
- **Múltiplas Tabelas de Preços:** Separação entre preço no Salão, Takeaway, iFood e Happy Hour.

### 3.2. Cardápio Digital & Editor Visual (`/menu-builder`)
- **Construtor Visual Estilizado:** Personalização do layout do cardápio digital (Cores, Banners, Logotipo, Agrupamentos).
- **Geração de QR Codes:** Exportação de QR Codes estilizados para impressão em mesas ou balcões.

### 3.3. Sincronizador iFood Menu (`/ifood-menu`)
- **Publicação com 1-Clique:** Sincronização do catálogo interno para a loja do iFood.
- **Pausa Emergencial de Itens:** Bloqueio instantâneo de produtos esgotados na plataforma do iFood.

### 3.4. Fichas Técnicas & IA Gastronômica (`/technical-sheets`)
- **Custeio Automático (CMV Teórico):** Cálculo do custo por porção em tempo real com base no custo médio dos insumos do estoque.
- **Rendimento e Fator de Correção:** Cálculo de perdas no limpo/sujo (ex: limpeza de peças de carne).
- **Inteligência Artificial Gemini Integrada:** Assistente IA para refinamento de receitas, harmonizações e cálculo de precificação para atingir a margem ideal.

---

## 4. Módulo: Estoque, Compras & Suprimentos

### 4.1. Controle Geral de Estoque (`/inventory`)
- **Movimentação em Tempo Real:** Baixa automática de estoque acionada por vendas no PDV/Delivery.
- **Alertas de Ponto de Pedido:** Avisos visuais sobre insumos atingindo o saldo mínimo de segurança.
- **Gestão Multi-depósito:** Separação entre Almoxarifado Central, Estoque Bar e Estoque Cozinha.

### 4.2. Auditoria e Inventário Cego (`/inventory/audit`)
- **Contagem Física Sem Viés:** Modalidade de inventário cego onde o funcionário digita a contagem sem ver o saldo do sistema.
- **Apuração de Perdas e Desvios:** Relatórios de sobras, perdas operacionais, furtos e quebras de estoque.

### 4.3. Requisições Internas (`/requisitions`)
- **Transferência Entre Estações:** Solicitações de insumos da cozinha ou bar para o almoxarifado central com fluxo de aprovação.

### 4.4. Porcionamento e Fracionamento (`/inventory/portioning`)
- **Transformação de Insumos Brutos:** Fracionamento de peças brutas (ex: peça de picanha de 3kg em porções de 200g) gerando novos SKUs porcionados com aproveitamento das aparas.

### 4.5. Compras e Cotações (`/purchasing`)
- **Sugestão Inteligente de Compras:** Geração automática de pedidos de compra baseada em médias de consumo e estoque mínimo.
- **Controle de Ordens de Compra:** Envio para fornecedores, acompanhamento de prazos de entrega e entrada de insumos.

### 4.6. Gestão de Fornecedores (`/suppliers`)
- **Cadastro Completo de Parceiros:** Histórico de fornecedores, condições de pagamento, prazos médios de entrega e contatos diretos.

---

## 5. Módulo: Equipe & Gestão de RH (ChefOS RH)

### 5.1. Funcionários e Permissões (`/employees`)
- **Gestão de Perfil:** Dados pessoais, cargo, salário, horário de trabalho e documentos.
- **Segurança por PIN:** Senhas numéricas individuais de 4 dígitos para autorização de operações no PDV e Ponto Eletrônico.

### 5.2. Ponto Eletrônico Digital (`/time-clock`)
- **Batida de Ponto por PIN / Biometria Visual:** Registro rápido de entrada, saída e intervalos.
- **Emissão de Comprovante de Marcação:** Emissão de recibo digital impresso ou enviado ao colaborador conforme normas trabalhistas.

### 5.3. Escalas e Turnos (`/schedules`)
- **Montador Visual de Escalas:** Planejamento semanal e mensal de folgas e turnos por setor.

### 5.4. Gestão de Ausências e Férias (`/leave-management`)
- **Fluxo de Aprovação:** Solicitação e aprovação de férias, abonos e atestados médicos.

### 5.5. Folha de Pagamento (`/payroll`)
- **Cálculo Automatizado:** Proventos, horas extras, adicional noturno, DSR e descontos para geração de holerites.

### 5.6. Avaliação de Desempenho (`/performance`)
- **Indicadores Individuais:** Vendas por atendente, ticket médio por garçom, pontualidade e metas alcançadas.

### 5.7. Portal do Colaborador - Meu RH (`/my-leave`)
- **Autoatendimento:** Consulta ao espelho de ponto, upload de atestados e saldo de folgas pelo próprio colaborador.

---

## 6. Módulo: Gestão Estratégica, CRM & Relatórios

### 6.1. Relatórios Inteligentes & BI (`/reports`)
- **Matriz de Engenharia de Cardápio (BCG):** Classificação automática de produtos em *Estrelas*, *Burros de Carga*, *Enigmas* e *Cães*.
- **Análise de Horários de Pico:** Mapeamento de volume de vendas por dia e hora.
- **Relatório de Cancelamentos e Desperdícios:** Auditoria de motivos de cancelamentos e descarte de produtos.

### 6.2. Clientes e CRM (`/customers`)
- **Perfil 360° do Cliente:** Histórico de consumo, prato favorito, gasto total acumulado e última visita.
- **Programa de Fidelidade / Cashback:** Regras de pontos e cashback configuráveis para recompensa de clientes frequentes.

### 6.3. Gestão de Loja iFood (`/ifood-store-manager`)
- **Controle Operacional iFood:** Status da loja em tempo real (Aberta/Fechada), pausa emergencial de loja e configuração de horários.

---

## 7. Infraestrutura & Plataforma SaaS Multi-Unidade

### 7.1. Alternância Multi-Unidades / Franquias
- **Troca de Contexto Instantânea (`UnitContextService`):** Alternância com um único clique entre matriz, filiais ou franquias mantendo permissões isoladas.

### 7.2. Módulo Fiscal Automatizado (NFC-e / NF-e)
- **Emissão Direta via FocusNFE Proxy:** Emissão de notas fiscais de consumidor de forma transparente no momento do fechamento da venda.

### 7.3. Terminais de Pagamento Integrados (TEF)
- **Integração com Maquininhas:** Suporte nativo a terminais Android inteligentes (Cielo LIO, Rede e Stone) para envio automático do valor a cobrar e baixa no caixa.

### 7.4. Gestão de Assinaturas e Multi-tenant (`/admin`)
- **Painel Administrativo do Sistema:** Provisionamento de novos restaurantes, planos de assinatura, relatórios de suporte e métricas globais de uso.

---
*ChefOS - O Sistema Operacional definitivo para maximizar a rentabilidade e eficiência da sua operação gastronômica.*
