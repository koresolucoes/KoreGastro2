# 📋 Guia Completo de Testes Manuais - Sistema de Gestão de Restaurantes

Este guia foi elaborado para garantir que todos os módulos do sistema sejam validados ponta a ponta, cobrindo deste a gestão de acesso até as operações mais críticas do dia a dia (PDV, Estoque, iFood e RH). 

Utilize as caixas de seleção (`[ ]`) para marcar seu progresso ao homologar o sistema.

---

## 1. 🔐 Autenticação, Onboarding e Acesso
**Objetivo:** Garantir que donos, gestores e funcionários consigam acessar o sistema com as permissões corretas.

- [ ] **1.1. Cadastro de Nova Conta (Register)**
  - *Ação:* Criar uma conta nova.
  - *Esperado:* O usuário é registrado com sucesso e redirecionado para o onboarding ou dashboard inicial.
- [ ] **1.2. Login de Administrador / Dono**
  - *Ação:* Logar com e-mail e senha corretos.
  - *Esperado:* Acesso concedido ao painel principal (Dashboard).
- [ ] **1.3. Recuperação de Senha (Reset Password)**
  - *Ação:* Clicar em "Esqueci minha senha" e seguir o fluxo.
  - *Esperado:* E-mail ou link gerado corretamente, permitindo alterar a senha.
- [ ] **1.4. Tela de Seleção de Funcionário / PIN de Acesso**
  - *Ação:* Tentar acessar módulos operacionais (PDV, Caixa) configurados com validação de PIN de usuário.
  - *Esperado:* O sistema deve exigir e validar corretamente a senha/PIN numérico do funcionário e conceder os acessos conforme os privilégios dele.

---

## 2. ⚙️ Configurações Iniciais da Loja
**Objetivo:** Validar as parametrizações vitais para que o restante do sistema funcione corretamente.

- [ ] **2.1. Configurações da Empresa**
  - *Ação:* Editar nome, CNPJ, telefone, logotipo e endereço em `Settings > Company Settings`.
  - *Esperado:* Dados salvos e refletidos nos relatórios/recibos impressos.
- [ ] **2.2. Gestão Multi-loja (Multi-unit)**
  - *Ação:* Cadastrar uma nova filial se o plano permitir, tentar alternar de loja logado.
  - *Esperado:* Usuário visualiza dados e estoque separados por unidade, dependendo do contexto.
- [ ] **2.3. Terminais de Pagamento (Payment Terminals)**
  - *Ação:* Configurar integração com maquininhas de cartão (Cielo, Rede, Stone) ou Pix.
  - *Esperado:* Status de integração deve apontar "Conectado" (se houver chaves válidas).
- [ ] **2.4. Integração de WhatsApp**
  - *Ação:* Configurar credenciais do WhatsApp e fazer envio de mensagem de teste.
  - *Esperado:* Mensagem recebida no número testado na aba `Settings > Whatsapp`.

---

## 3. 👥 Gestão de Pessoas (Recursos Humanos)
**Objetivo:** Testar os processos de departamento pessoal (controle de horas, cadastro e permissões).

- [ ] **3.1. Cadastro de Funcionários**
  - *Ação:* Criar, editar e suspender um funcionário.
  - *Esperado:* Funcionário listado na grade de colaboradores com o cargo e nível de acesso definidos. O funcionário suspenso não deve mais conseguir logar.
- [ ] **3.2. Controle de Ponto (Time Clock)**
  - *Ação:* Um funcionário entra na tela de relógio de ponto e digita seu PIN para marcar ENTRADA. Mais tarde, marca SAÍDA.
  - *Esperado:* Registro de ponto efetuado com sucesso e visível para o gestor de RH.
- [ ] **3.3. Gestão de Escalas (Schedules)**
  - *Ação:* Criar uma semana de trabalho alocando garçons, cozinheiros, etc.
  - *Esperado:* Calendário preenchido corretamente, e alerta caso haja conflitos/sobreposição de horários do mesmo funcionário.
- [ ] **3.4. Ausências e Férias (Leave Management)**
  - *Ação:* Funcionário solicita folga pelo portal dele, gestor aprova.
  - *Esperado:* O status deve ser atualizado para 'Aguardando' -> 'Aprovado', e as escalas devem refletir a ausência.
- [ ] **3.5. Holerite / Folha de Pagamento (Payroll)**
  - *Ação:* Gerar uma prévia de fechamento de folha.
  - *Esperado:* O cálculo de horas normais e extras de acordo com o relógio de ponto deve bater.

---

## 4. 📦 Estoque, Cardápio e Compras
**Objetivo:** Garantir que vendas baixem o estoque corretamente e o cardápio funcione.

- [ ] **4.1. Cadastro de Ingredientes (Inventory)**
  - *Ação:* Adicionar um ingrediente base (ex: Farinha, Tomate), unidade de medida e custo.
  - *Esperado:* Item salvo na lista de estoque. Adicionar estoque via ajuste/auditoria funciona.
- [ ] **4.2. Criação do Cardápio (Menu Builder)**
  - *Ação:* Criar categorias. Criar um Prato Principal. Inserir Preço, Foto e Descrição.
  - *Esperado:* Prato deve ficar visível na tela do PDV e no auto-atendimento (Public Menu).
- [ ] **4.3. Ficha Técnica (Technical Sheets & Portioning)**
  - *Ação:* Vincular "200g de Tomate" e "Massa" no Prato Principal recém-criado.
  - *Esperado:* O prato calcula o custo real (CMV) com base na ficha e na soma dos insumos.
- [ ] **4.4. Mise en Place e Fracionamento**
  - *Ação:* Configurar que a cozinha deve preparar 5kg de molho matinalmente.
  - *Esperado:* Clicar em "Completar" a tarefa deve dar baixa no estoque dos insumos brutos e dar entrada no Produto Semi-Acabado (Molho Pronto).
- [ ] **4.5. Solicitações de Compra e Recebimento (Requisitions / Purchasing)**
  - *Ação:* Gerar ordem de compra para fornecedor. Posteriormente, dar "Receber Compra".
  - *Esperado:* A quantidade comprada soma no estoque automaticamente e altera o custo médio do insumo se houver aumento de preço.

---

## 5. 🛒 Salão e Ponto de Venda (PDV/POS)
**Objetivo:** Testar o coração operativo, as vendas locais.

- [ ] **5.1. Mapa de Mesas (Table Layout)**
  - *Ação:* Entrar no PDV, visualizar mapa. Clicar em uma mesa livre.
  - *Esperado:* Mesa altera o status (livre para ocupada/atendimento aberto).
- [ ] **5.2. Lançamento de Pedidos**
  - *Ação:* Selecionar uma mesa ou Comanda, inserir 3 pratos e 2 bebidas. Confirmar.
  - *Esperado:* Os pedidos são adicionados à conta e enviados para a tela de preparo (KDS).
- [ ] **5.3. Funções Avançadas de Mesa**
  - *Ação:* Transferir os produtos da "Mesa 01" para a "Mesa 05" (`Move Order`).
  - *Esperado:* A Mesa 01 fica livre e a Mesa 05 assume os pedidos.
- [ ] **5.4. Pagamento e Divisão da Conta (Split Order & Payment)**
  - *Ação:* Na tela de pagamento, simular encerramento da conta, dividir em 2 pessoas.
  - *Esperado:* O sistema calcula meia transação e aceita (Ex: Metade Pix, Metade Débito).
- [ ] **5.5. Cancelamentos e Justificativas**
  - *Ação:* Cancelar um item já lançado.
  - *Esperado:* Abre a janela "Desperdício ou Apenas Erro Lançamento?", pede autorização do gerente caso o garçom não tenha permissão, e o item volta (ou não) ao estoque atrelado.

---

## 6. 🛵 Delivery e iFood
**Objetivo:** Validar vendas externas e fluxo logístico.

- [ ] **6.1. Recepção de Pedidos iFood (Ifood KDS)**
  - *Ação:* Entrar na tela de integrações ou simular uma injeção de webhook de pedido IFood.
  - *Esperado:* Uma notificação sonora toca, e o pedido "pipoca" na aba "Novos".
- [ ] **6.2. Gestão de Entregadores (Delivery Tracking)**
  - *Ação:* Em um pedido Delivery Próprio, atribuir a entrega para o 'Motoboy Joãozinho'.
  - *Esperado:* Tempo de expedição entra em modo 'Saiu para entrega'.
- [ ] **6.3. Fechamento de Delivery**
  - *Ação:* Marcar o pedido como 'Entregue'.
  - *Esperado:* Baixa o estoque consolidada, venda vira faturamento no caixa.

---

## 7. 🔪 Cozinha (KDS / Tela de Produção)
**Objetivo:** Assegurar que os cozinheiros não percam nenhum prato.

- [ ] **7.1. Visualização de Comandas KDS**
  - *Ação:* Logar na interface do KDS.
  - *Esperado:* Ter os pedidos do passo 5.2 visualizados separadamente ou agrupados.
- [ ] **7.2. Avanço de Estágios de Preparo**
  - *Ação:* Tocar/Clicar no pedido para move-lo de "Recebido" -> "Preparando" -> "Pronto".
  - *Esperado:* Ao ficar pronto, o sistema alerta o garçom no PDV ou os painéis de retirada de pedido.

---

## 8. 💵 Operação de Caixa (Cashier)
**Objetivo:** Validar higidez financeira da frente de loja diária.

- [ ] **8.1. Abertura do Caixa**
  - *Ação:* Abrir o turno do caixa informando o troco inicial (Ex: $ 100,00).
  - *Esperado:* Caixa status "Aberto", permitindo que o PDV opere.
- [ ] **8.2. Movimentações Físicas (Sangria / Suprimento)**
  - *Ação:* Retirar $ 500 para depósito/pagar fornecedor e lançar a justificativa.
  - *Esperado:* O dinheiro em espécie da gaveta reduz os $ 500.
- [ ] **8.3. Fechamento Cego e Conciliação**
  - *Ação:* Ao encerrar o dia, o sistema pede pro caixa digitar o que tem na gaveta/maquininhas antes de ver o que o sistema espera.
  - *Esperado:* Em caso de sobra ou falta, o aviso de quebra de caixa fica em highlight no relatório de encerramento do turno para o gestor.

---

## 9. 📈 Relatórios e Analytics (Reports)
**Objetivo:** Garantir informações estratégicas confiáveis.

- [ ] **9.1. Dashboard Principal**
  - *Ação:* Acessar página inicial do gestor.
  - *Esperado:* Mostrar faturamento do dia em tempo real, tickets médios e comparativo com semana passada.
- [ ] **9.2. Engenharia de Cardápio / CMV (Menu Engineering)**
  - *Ação:* Rodar o relatório do último mês.
  - *Esperado:* Identificar itens "Estrela" (Alta Venda e Alto Lucro) vs itens que dão prejuízo, verificando os cálculos da Ficha Técnica.
- [ ] **9.3. Curva de Ocupação e Vendas por Horas (Peak Hours)**
  - *Ação:* Examinar gráficos de "Calor".
  - *Esperado:* Mostrar com clareza a concentração de demanda no Almoço vs Jantar.

---

## 10. 📱 Interface Externa (Cliente Final Público)
**Objetivo:** Garantir a estabilidade da experiência Auto-atendimento B2C.

- [ ] **10.1. Cardápio Digital (QR Code/Cart)**
  - *Ação:* Simular cliente lendo o QR, selecionar 2 itens, adicionar observação 'Sem cebola', e montar carrinho.
  - *Esperado:* Processo responsivo no celular, envia a comanda fluida para a mesa certa.
- [ ] **10.2. Reserva de Mesas Pública (Public Booking)**
  - *Ação:* Solicitar reserva para amanhã, 4 pessoas.
  - *Esperado:* A solicitação entra na fila do gerente na aba `Reservations` dentro do painel administrativo.
- [ ] **10.3. Auto-checkout e Pagamento (Menu Checkout)**
  - *Ação:* Simular pagamento direto na prancha de auto-pagamento (com PIX/Cartão online).
  - *Esperado:* Mesa fechada automaticamente ao ping de webhook de "Pagamento Aprovado."

---

*Gerado pela sua IA Auxiliar de Desenvolvimento e Qualidade.*
*Recomendação: Mantenha este roteiro para homologações toda vez que ocorrer grandes refatorações ou updates na base de código.*
