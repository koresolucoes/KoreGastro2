# Documentação de Especificação: App Android para Cielo LIO (Chefos)

Este documento detalha a arquitetura, telas, funcionalidades e endpoints necessários para a criação do aplicativo Android nativo que rodará nas maquininhas Smart Cielo LIO, integrado ao ecossistema Chefos.

## 1. Visão Geral da Arquitetura

O aplicativo Cielo LIO atuará como um PDV Móvel (Mobile POS) focado no atendimento de salão (garçons) e delivery/balcão rápido. Ele consumirá a API v2 do Chefos (`/api/v2/*`) para sincronizar dados em tempo real e utilizará o **Cielo LIO Order Manager SDK** nativo do Android para acionar pagamentos e impressões localmente no hardware da maquininha.

**Tecnologias Recomendadas para o App Android:**
*   **Linguagem:** Kotlin
*   **UI Toolkit:** Jetpack Compose
*   **Networking:** Retrofit2 + OkHttp
*   **Injeção de Dependência:** Hilt / Dagger
*   **Arquitetura:** MVVM (Model-View-ViewModel) ou MVI
*   **Integração Cielo:** LIO Order Manager SDK

---

## 2. Fluxo de Navegação e Telas do App

### Tela 1: Login / Autenticação de Funcionário (PIN/Senha)
O garçom ou operador precisa se identificar na maquininha para que os pedidos e pagamentos fiquem atrelados a ele.

*   **Funcionalidades:**
    *   Teclado numérico na tela para digitar o PIN.
    *   Seleção de empresa/tenant (se a maquininha puder circular, geralmente fixo via configuração).
    *   Feedback visual de erro ou sucesso.
*   **Endpoints Utilizados:**
    *   `POST /api/rh/verificar-pin` ou `POST /api/v2/employees/login` - Valida o PIN e retorna um token JWT de sessão.
    *   *(O token JWT deverá ser injetado no header `Authorization: Bearer {token}` de todas as chamadas seguintes).*

### Tela 2: Dashboard / Seleção de Mesas e Comandas
Após o login, o garçom vê o salão ou uma lista de comandas em aberto.

*   **Funcionalidades:**
    *   Visualização do status das mesas (Livre, Ocupada, Fechando, Aguardando Limpeza).
    *   Busca por número de mesa ou comanda.
    *   Botão flutuante (FAB) para "Novo Pedido Rápido" (Balcão).
*   **Endpoints Utilizados:**
    *   `GET /api/v2/halls` - Retorna a estrutura dos salões.
    *   `GET /api/v2/tables` - Retorna a lista de mesas, seus status e ID do pedido ativo (se ocupada).
    *   `GET /api/v2/orders?status=open` - Para listar comandas abertas que não estão atreladas a mesas.

### Tela 3: Detalhes do Pedido (Carrinho / Comanda)
Ao tocar em uma mesa ocupada ou comanda, o garçom vê o que já foi consumido.

*   **Funcionalidades:**
    *   Lista de itens já pedidos e enviados para a cozinha.
    *   Botão "+ Adicionar Itens".
    *   Botão "Fechar Conta / Cobrar".
    *   Visualização do subtotal, taxas de serviço (10%) e total.
*   **Endpoints Utilizados:**
    *   `GET /api/v2/orders/{orderId}` - Retorna os detalhes completos do pedido.
    *   `PATCH /api/v2/orders/{orderId}` - Atualiza informações do pedido (ex: número de pessoas para dividir a conta).

### Tela 4: Cardápio (Adição de Itens)
Onde o garçom tira o pedido do cliente na mesa.

*   **Funcionalidades:**
    *   Navegação por categorias (Bebidas, Entradas, Pratos Principais).
    *   Busca rápida de produtos.
    *   Ao clicar no produto, abre modal para observações ("Sem cebola", "Ponto da carne") e adicionais.
    *   Botão "Confirmar e Enviar para Cozinha" (aciona KDS/Impressora de produção via backend).
*   **Endpoints Utilizados:**
    *   `GET /api/v2/catalog` ou `GET /api/v2/menu-items` - Carrega o cardápio e categorias.
    *   `POST /api/v2/orders/{orderId}/items` - Adiciona novos itens à comanda. O backend Chefos cuida de disparar para a cozinha.

### Tela 5: Fechamento de Conta e Pagamento (Integração Cielo LIO)
A tela mais crítica, onde a magia da Cielo LIO acontece.

*   **Funcionalidades:**
    *   Resumo da conta (Valor dos produtos + Serviço).
    *   Opção de dividir a conta (por valor igual ou por itens).
    *   Seleção de forma de pagamento: Crédito, Débito, Pix (QR Code), Dinheiro, Vale Refeição.
    *   **Acionamento do Hardware:** O app Android aciona o SDK da Cielo para processar o cartão na própria máquina.
*   **Fluxo de Pagamento e Endpoints:**
    1.  **Bloqueio/Pre-Bill:** Opcionalmente chama `POST /api/v2/orders/{orderId}/pre-bill` para marcar que a conta está sendo paga.
    2.  **SDK Cielo:** O app Android usa o `OrderManager` do SDK da LIO para criar um pedido na LIO, adicionar o valor e acionar a tela de leitura de cartão/senha da própria Cielo.
    3.  **Registro no Chefos:** Após a Cielo retornar "APROVADO", o app Android pega o ID da transação da Cielo e avisa o Chefos:
        *   `POST /api/v2/payments` (Corpo: `{ orderId: "123", amount: 50.00, method: "CREDIT_CARD", provider: "CIELO_LIO", transactionId: "A1B2...", status: "PAID" }`)
    4.  **Fechamento do Pedido:** `POST /api/v2/orders/{orderId}/close` - Muda o status do pedido para pago/fechado e libera a mesa.

### Tela 6: Impressão de Recibo
Utiliza a impressora térmica embutida na Cielo LIO.

*   **Funcionalidades:**
    *   Impressão da via do cliente.
    *   Impressão do fechamento de caixa (Z-Report) no fim do dia.
*   **Integração:**
    *   Em vez de endpoints, aqui o App Android usa o **Cielo LIO Printer SDK** para enviar o texto formatado (ou um layout Bitmap) do recibo fiscal/não fiscal para a impressora física do dispositivo.
    *   *(O app Android pode puxar os dados do endpoint `GET /api/v2/orders/{orderId}` para montar o layout em Kotlin).*

---

## 3. Modelo de Integração (App Android <-> Chefos Backend)

Diferente do fluxo web (onde o servidor solicita o pagamento na maquininha remotamente via API REST Cielo), **no App Android nativo LIO o fluxo é INVERTIDO (Client-Side SDK):**

1.  **App LIO:** Garçom clica em "Cobrar R$ 100 no Débito".
2.  **App LIO -> SDK Cielo Android:** App chama método nativo (ex: `paymentManager.checkout(...)`). A maquininha assume o controle da tela, pede o cartão e a senha.
3.  **SDK Cielo Android -> App LIO:** A Cielo retorna o resultado para o seu App via Callbacks Kotlin/Java (ex: `onSuccess`, `onError`).
4.  **App LIO -> Backend Chefos:** Se deu sucesso, seu App Android faz uma requisição HTTP REST POST para `/api/v2/payments` do Chefos para baixar a conta no sistema.

### Como lidar com conectividade offline/instável:
*   A LIO depende de Wi-Fi ou 3G.
*   Se o pagamento for aprovado pela Cielo, mas a internet cair antes do App Android avisar o Chefos:
    *   O App Android deve **salvar em banco local (Room/SQLite)** que a transação X foi aprovada para o Pedido Y.
    *   Um Worker (WorkManager) em background deve tentar enviar isso para `/api/v2/payments` assim que a internet voltar, para garantir que o caixa do Chefos bata com o extrato da Cielo.

## 4. Próximos Passos para o Desenvolvimento Android

Para sua equipe de desenvolvimento Android (Kotlin) começar, eles precisarão de:

1.  **Credenciais Cielo LIO (Dev):** Client ID e Access Token do portal de desenvolvedores da Cielo para inicializar o SDK.
2.  **Base URL do Chefos:** URL da API (ex: `https://seu-dominio.com/api`).
3.  **Tokens JWT de Teste:** Para autenticar as requisições Retrofit.
4.  **Emulador LIO (Genymotion) ou Equipamento Físico:** A Cielo fornece imagens para rodar o emulador LIO no Genymotion ou Android Studio, ou idealmente, usar uma LIO de testes (sandbox).

Este documento abrange o "Caminho 1" de forma estruturada. Ele serve como o Produto Backlog perfeito para iniciar o desenvolvimento do aplicativo Android.
