# Plano de Implementação: ChefOS Offline (Local-First) & Apps Nativos

Este documento detalha a estratégia para transformar o ChefOS de uma aplicação puramente web-online para uma solução híbrida robusta com suporte offline, capaz de operar em Windows e Android, mantendo a sincronização de dados entre dispositivos em rede local (LAN) e com a nuvem (Supabase).

## 1. Arquitetura e Stack Tecnológica

Para suportar o modo offline e a comunicação local, a arquitetura mudará de **Client-Cloud** para **Local-First + Sync**.

### Tecnologias Escolhidas
*   **Core (Frontend):** Angular v20+ (Já existente).
*   **Empacotamento Desktop (Windows):** **Electron**. Permite acesso ao sistema de arquivos, impressoras térmicas via USB/Serial e execução de um servidor local leve.
*   **Empacotamento Mobile (Android):** **Capacitor**. Permite acesso nativo a SQLite, rede e hardware do dispositivo.
*   **Banco de Dados Local:** **RxDB** (Reactive Database).
    *   *Por que?* Integra perfeitamente com Angular, suporta replicação, funciona sobre IndexedDB (Web) e SQLite (Nativo), e possui sistema de *Streams* observáveis.
*   **Comunicação Local (Sem Internet):** **WebSocket Server (Socket.io)** rodando dentro do aplicativo Electron (Windows) que atuará como "Servidor Local".

---

## 2. Etapas de Implementação

### Fase 1: Preparação do Ambiente Nativo (Wrappers)

O objetivo é tirar a aplicação do navegador e colocá-la em "cascas" nativas.

1.  **Configuração do Electron (Windows - "Servidor/Caixa")**
    *   Instalar Electron no projeto Angular.
    *   Configurar `main.js` para criar a janela e expor APIs de hardware (impressão).
    *   *Papel:* Este dispositivo será o "Mestre Local" quando a internet cair.

2.  **Configuração do Capacitor (Android - "Comanda/Garçom/KDS")**
    *   Adicionar Capacitor ao projeto (`npm install @capacitor/core @capacitor/cli`).
    *   Adicionar plataforma Android (`npx cap add android`).
    *   Configurar plugin `capacitor-sqlite` para armazenamento persistente de alta performance.

---

### Fase 2: Camada de Dados Local (Local-First)

Refatorar a forma como o app busca dados. Em vez de chamar o Supabase diretamente, chamaremos um serviço intermediário.

1.  **Instalação e Configuração do RxDB**
    *   Criar esquemas locais (`schemas/order.schema.ts`, `schemas/product.schema.ts`) que espelhem as tabelas do Supabase.
    *   Instanciar o banco de dados RxDB na inicialização do app (`src/services/database.service.ts`).

2.  **Replicação Supabase <-> RxDB**
    *   Utilizar o plugin `rxdb-supabase` ou criar um replicador customizado.
    *   **Pull (Download):** O app baixa alterações do Supabase periodicamente ou via Realtime.
    *   **Push (Upload):** O app envia alterações locais para o Supabase quando online.

3.  **Refatoração dos Serviços Existentes**
    *   Modificar `PosDataService`, `InventoryDataService`, etc.
    *   *Antes:* `await supabase.from('orders').select(...)`
    *   *Depois:* `this.db.orders.find().$` (Observa o banco local).
    *   **Leitura:** Sempre lê do banco local (instantâneo).
    *   **Escrita:** Escreve no banco local. O replicador sincroniza em background.

---

### Fase 3: Modo "Servidor Local" (Offline LAN)

Como os dispositivos conversam entre si (ex: Garçom lança pedido -> Cozinha recebe) se a internet cair e o Supabase Realtime não funcionar?

1.  **WebSocket Server no Electron**
    *   No processo principal do Electron (Windows), levantar um servidor `socket.io` na porta 3000.
    *   Este servidor atuará como um "Hub de Eventos" local.

2.  **Descoberta de Serviço (mDNS / Zeroconf)**
    *   O Servidor (Windows) anuncia sua presença na rede local.
    *   Os Clientes (Android) escaneiam a rede para encontrar o IP do servidor e se conectar.

3.  **Sincronização P2P (Peer-to-Peer)**
    *   Quando offline, o RxDB dos Androids deve replicar contra o RxDB do Windows (via CouchDB replication protocol ou Socket).
    *   *Fluxo Offline:* Android grava no seu RxDB -> Sincroniza com Windows via LAN -> Windows atualiza KDS.
    *   *Fluxo Retorno Online:* Windows (Servidor) sincroniza tudo acumulado com o Supabase.

---

### Fase 4: Gestão de Estado e UI Offline

1.  **Indicadores de Conectividade**
    *   Criar um `NetworkService` que monitora:
        *   Conexão com Internet (Ping no Google/Supabase).
        *   Conexão com Servidor Local (Ping no IP do Windows).
    *   Exibir badges na UI: 🟢 Online | 🟡 Modo Local (LAN) | 🔴 Offline Total.

2.  **Bloqueio de Funcionalidades Cloud-Only**
    *   Desabilitar botões/menus que exigem APIs externas estritas quando offline:
        *   Integração iFood (Webhooks não chegam).
        *   Emissão NFC-e (Requer SEFAZ, a menos que emita em contingência offline).
        *   Pagamento via Pix (API do banco).

3.  **Fila de Sincronização (Sync Queue)**
    *   Visualização na tela de Configurações mostrando "X alterações pendentes de envio".

---

## 3. Detalhamento Técnico das Tabelas (Schema Local)

Para o modo offline funcionar, as seguintes tabelas devem ser replicadas localmente no dispositivo:

*   **Essenciais (Cache Completo):**
    *   `users` / `employees` (Para login offline via PIN).
    *   `products` / `recipes` / `ingredients` (Cardápio e Fichas).
    *   `tables` / `halls` (Layout).
    *   `settings` (Configurações da loja).
*   **Transacionais (Sincronização Incremental):**
    *   `orders` (Apenas abertas e do dia atual).
    *   `order_items`.
    *   `transactions` (Do dia atual).

---

## 4. Roteiro de Execução (Roadmap)

### Semana 1: Fundação
1.  Criar branch `feat/offline-architecture`.
2.  Configurar Electron e Capacitor no projeto atual.
3.  Instalar RxDB e configurar a instância do banco local.

### Semana 2: Replicação de Dados Mestres
1.  Criar Schemas RxDB para `employees`, `recipes`, `tables`.
2.  Implementar `ReplicationService` para puxar dados do Supabase ao iniciar.
3.  Refatorar `AuthService` para permitir login com PIN verificando o banco local (se offline).

### Semana 3: Operação de Venda Offline
1.  Refatorar `PosDataService` para gravar pedidos (`orders`, `order_items`) no RxDB.
2.  Implementar a fila de sincronização (Push) para enviar pedidos ao Supabase quando a conexão voltar.
3.  Testar fluxo: Desligar Wi-Fi -> Criar Pedido -> Ligar Wi-Fi -> Verificar no Supabase.

### Semana 4: Rede Local (O Grande Desafio)
1.  Implementar servidor Socket.io no Electron.
2.  Implementar cliente Socket.io no Angular.
3.  Criar lógica de "Fallback": Tenta Supabase Realtime -> Falha -> Tenta Socket Local.

### Semana 5: Refinamento e Build
1.  Implementar gestão de conflitos (ex: dois garçons editam a mesma mesa offline).
2.  Build e assinatura dos executáveis (Windows .exe e Android .apk).
3.  Testes de carga em rede local.

---

## 5. Considerações de Segurança

*   **Banco Local:** No Windows e Android, os dados locais devem ser criptografados (RxDB suporta encriptação de armazenamento) para evitar que alguém copie o arquivo do banco e leia dados sensíveis.
*   **Token Local:** A comunicação LAN deve usar um token simples gerado pelo Servidor Windows (ex: um JWT local) para evitar que dispositivos não autorizados se conectem ao POS.
