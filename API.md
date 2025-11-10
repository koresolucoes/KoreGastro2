# Documentação da API e Webhooks do ChefOS

Esta documentação detalha como integrar sistemas externos com o ChefOS através de nossa API REST e como receber notificações em tempo real usando webhooks.

A URL base para todas as chamadas de API é: `https://gastro.koresolucoes.com.br`

---

## Autenticação

Todas as requisições para a API do ChefOS devem ser autenticadas.

A autenticação é feita através de uma chave de API do tipo **Bearer Token**. Você pode gerar e encontrar sua chave em `Configurações > Módulos e Integrações > API de Pedidos Externos`.

A chave deve ser incluída no cabeçalho `Authorization` de cada requisição.

**Exemplo de Cabeçalho:**
```
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA_AQUI
```

Além disso, a maioria dos endpoints requer que o `restaurantId` (o ID do seu usuário no sistema ChefOS) seja enviado no corpo da requisição ou como um parâmetro de query.

---

## 🔌 API de Pedidos Externos

Endpoints para consultar o cardápio e criar ou modificar pedidos, sejam eles para consumo no local, retirada ou delivery.

### `GET /api/external-order`
Use este endpoint para buscar o cardápio disponível de um restaurante.

**Query Parameters:**
- `restaurantId` (string, **obrigatório**): O ID do seu usuário no sistema ChefOS.

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
> **Importante:** Apenas itens com um "Código Externo" definido na Ficha Técnica serão retornados.

---

### `POST /api/external-order`
Use este endpoint para criar um novo pedido, seja para consumo no local (Dine-in), retirada (QuickSale) ou **delivery**.

**Exemplo de Corpo da Requisição (Delivery):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "tableNumber": 0,
  "orderTypeLabel": "Pedido via App Próprio",
  "customer": {
    "name": "Ana Cliente",
    "phone": "21912345678",
    "address": "Rua das Flores, 123, Bairro dos Jardins, Rio de Janeiro - RJ, 22290-240"
  },
  "items": [
    {
      "externalCode": "PZ-MARGH",
      "quantity": 1
    },
    {
      "externalCode": "REFRI-LATA",
      "quantity": 2
    }
  ]
}
```

**Campos do Corpo da Requisição:**
- `restaurantId` (string, **obrigatório**): O ID do seu usuário no sistema ChefOS.
- `tableNumber` (number, **obrigatório**):
  - Para pedidos "Dine-in", use o número da mesa.
  - Para vendas de balcão/retirada, use `0`.
  - **Para pedidos de delivery, use `0` e forneça o campo `address` no objeto `customer`.**
- `orderTypeLabel` (string, opcional): Um rótulo para identificar a origem do pedido (ex: "Totem 1", "App de Entrega").
- `externalId` (string, opcional): Um ID único do sistema de origem para referência.
- `customer` (object, opcional): Dados do cliente.
  - `name` (string, **obrigatório** se `customer` for enviado).
  - `phone` (string, opcional).
  - `email` (string, opcional).
  - `address` (string, opcional): **Obrigatório para criar um pedido de delivery.** O endereço completo do cliente. Se fornecido junto com `tableNumber: 0`, o pedido será criado com o tipo `External-Delivery` e aparecerá no painel de entregas.
- `items` (array, **obrigatório**):
  - `externalCode` (string, **obrigatório**): O código do item, conforme retornado pela API do cardápio (GET).
  - `quantity` (number, **obrigatório**).
  - `notes` (string, opcional): Observações para a cozinha.
  - `price` (number, opcional): Permite sobreescrever o preço padrão do item para este pedido específico.

**Exemplo de Resposta (Sucesso 201 Created):**
```json
{
  "success": true,
  "message": "Order created successfully and sent to KDS.",
  "orderId": "uuid-do-pedido-criado-no-chefos"
}
```

**Respostas de Erro:**
- `400 Bad Request`: Erro de validação no corpo da requisição (ex: campos faltando).
- `401 Unauthorized` / `403 Forbidden`: Chave de API inválida ou `restaurantId` incorreto.
- `404 Not Found`: Um ou mais `externalCode` de itens não foram encontrados no cardápio.
- `500 Internal Server Error`: Ocorreu um erro no servidor ao processar o pedido.

---

### `PATCH /api/external-order`
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

**Resposta (Sucesso 200 OK):**
```json
{
  "success": true,
  "message": "Items added to order successfully.",
  "orderId": "uuid-do-pedido-aberto-no-chefos"
}
```

---

## 🔌 API de Delivery Externo
Esta API permite que sistemas externos monitorem o status dos pedidos de delivery (não-iFood) e consultem a lista de entregadores ativos.

### `GET /api/delivery`
Use este endpoint para buscar a lista de entregadores ativos ou os pedidos de delivery em andamento.

**Query Parameters:**
- `restaurantId` (string, **obrigatório**).
- `resource` (string, **obrigatório**): Valores possíveis: `drivers`, `orders`.

**Exemplo de Requisição (`resource=drivers`):**
```
GET https://gastro.koresolucoes.com.br/api/delivery?restaurantId=SEU_USER_ID&resource=drivers
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-do-entregador-1",
    "name": "João Moto",
    "phone": "11988887777",
    "vehicle_type": "Moto",
    "is_active": true
  }
]
```

**Exemplo de Requisição (`resource=orders`):**
```
GET https://gastro.koresolucoes.com.br/api/delivery?restaurantId=SEU_USER_ID&resource=orders
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-do-pedido-1",
    "delivery_status": "READY_FOR_DISPATCH",
    "delivery_driver_id": null,
    "customers": { "name": "Ana Cliente", "phone": "21912345678" },
    "order_items": [ { "name": "Pizza Grande", "quantity": 1 } ]
  }
]
```

---

### `PATCH /api/delivery`
Use este endpoint para que um aplicativo de entregador externo atualize o status de um pedido de delivery ou atribua um entregador.

**Ação: `update_status`**
Atualiza o status de um pedido.
**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "action": "update_status",
  "orderId": "uuid-do-pedido-de-delivery",
  "newStatus": "OUT_FOR_DELIVERY"
}
```
**Valores para `newStatus`:** `'OUT_FOR_DELIVERY'`, `'ARRIVED_AT_DESTINATION'`, `'DELIVERED'`.

---

**Ação: `assign_driver`**
Atribui um entregador a um pedido e o move para "Em Rota".
**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "action": "assign_driver",
  "orderId": "uuid-do-pedido-pronto",
  "driverId": "uuid-do-entregador"
}
```

**Resposta (Sucesso 200 OK para ambas as ações):**
```json
{
  "success": true,
  "message": "Ação executada com sucesso."
}
```

---

### `POST /api/delivery-location`
Use este endpoint para que um aplicativo de entregador externo envie sua localização (latitude/longitude) em tempo real.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "driverId": "uuid-do-entregador",
  "latitude": -23.5505,
  "longitude": -46.6333
}
```
**Resposta (Sucesso 204 No Content):** Nenhuma resposta.

---

## 🔌 API de Clientes
Gerenciamento de clientes para integração com CRMs, sistemas de fidelidade, etc.

### `GET /api/clientes`
Busca clientes. Se nenhum parâmetro for fornecido, retorna todos.

**Query Parameters:**
- `restaurantId` (string, **obrigatório**).
- `search` (string, opcional): Busca por nome, telefone, email ou CPF.
- `id` (string, opcional): Busca um cliente específico pelo UUID.

**Exemplo de Resposta (200 OK):**
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

---

### `POST /api/clientes?action=login`
Autentica um cliente para obter seus dados.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "identifier": "cliente@email.com",
  "password": "senha_do_cliente"
}
```
- `identifier` pode ser e-mail, telefone ou CPF.

**Resposta (Sucesso 200 OK):** O objeto completo do cliente (sem a senha).
**Resposta (Erro 401 Unauthorized):** Credenciais inválidas.

---

### `POST /api/clientes`
Cadastra um novo cliente.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "name": "Maria Nova",
  "phone": "21912345678",
  "password": "uma_senha_segura"
}
```
**Resposta (Sucesso 201 Created):** O objeto do cliente recém-criado.

---

### `PATCH /api/clientes?id={id}`
Atualiza um cliente ou gerencia pontos de fidelidade.

**Corpo (JSON - dados gerais):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "name": "Maria Atualizada",
  "password": "nova_senha_segura"
}
```

**Corpo (JSON - pontos de fidelidade):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "loyalty_points_change": 50,
  "description": "Bônus por indicação"
}
```
**Resposta (Sucesso 200 OK):** O objeto completo e atualizado do cliente.

---

## 🔌 API de Reservas
Integração com sistemas externos para consulta e criação de reservas.

### `GET /api/reservas?action=disponibilidade`
Consulta os horários disponíveis.

**Query Parameters:**
- `restaurantId` (string, **obrigatório**).
- `data` (string, **obrigatório**): `YYYY-MM-DD`.
- `numero_pessoas` (number, **obrigatório**).

**Resposta (200 OK):**
```json
{
  "availability": [ "19:00", "19:30", "20:00", "21:00" ]
}
```

---

### `POST /api/reservas`
Cria uma nova reserva.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "customer_name": "Ana Silva",
  "party_size": 4,
  "reservation_time": "2024-10-26T19:30:00.000Z",
  "notes": "Preferência por mesa na janela."
}
```
**Resposta (201 Created):** O objeto da reserva criada com status "PENDING".

---

## 🔌 API de Cardápio e Estoque
Consulta de cardápio com disponibilidade em tempo real e gerenciamento de estoque.

### `GET /api/cardapio-estoque`
Busca o cardápio detalhado ou a lista de insumos.

**Ação Padrão (Cardápio):** Retorna o cardápio com um campo booleano `disponivel_estoque`.
```
GET /api/cardapio-estoque?restaurantId=SEU_USER_ID_AQUI
```
**Resposta (200 OK):**
```json
[
  {
    "name": "Hambúrguer Clássico",
    "price": 30.00,
    "disponivel_estoque": true
  }
]
```

**Ação `insumos`:** Retorna a lista de ingredientes do estoque.
```
GET /api/cardapio-estoque?restaurantId=SEU_USER_ID&action=insumos
```
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-do-ingrediente",
    "name": "Carne de Hambúrguer",
    "stock": 500,
    "min_stock": 1000,
    "unit": "g"
  }
]
```

---

### `PUT /api/cardapio-estoque?external_code={code}`
Altera a disponibilidade manual de um item no cardápio.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "is_available": false
}
```
**Resposta (200 OK):** Retorna o objeto da receita atualizada.

---

## 🔌 API de Relatórios e Performance
Consumo de dados de performance do restaurante.

### `GET /api/relatorios`
Obtém dados de performance.

**Query Parameters:**
- `restaurantId` (string, **obrigatório**).
- `action` (string, **obrigatório**): `vendas` ou `performance_itens`.
- `data_inicio` (string, **obrigatório**): `YYYY-MM-DD`.
- `data_fim` (string, **obrigatório**): `YYYY-MM-DD`.

**Resposta (`action=vendas`, 200 OK):**
```json
{
  "faturamento_bruto": 15230.50,
  "custo_total_cmv": 4890.15,
  "lucro_bruto": 10340.35
}
```
**Resposta (`action=performance_itens`, 200 OK):**
```json
[
  {
    "nome_item": "Hambúrguer Clássico",
    "quantidade_vendida": 250,
    "receita_total": 7500,
    "lucro_total": 5375
  }
]
```

---

## 🔌 API de Fidelidade (Recompensas)
Gerencia os prêmios do programa de fidelidade.

### `GET /api/recompensas`
Lista todas as recompensas de fidelidade ativas.

**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-recompensa-1",
    "name": "Refrigerante Grátis",
    "points_cost": 50,
    "type": "free_item",
    "value": "REFRI-LATA" 
  }
]
```
> Para `type: "free_item"`, o `value` é o `external_code` do produto.

---

### `POST /api/recompensas`
Cria uma nova recompensa.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "name": "Sobremesa Grátis",
  "points_cost": 120,
  "reward_type": "free_item",
  "reward_value": "SKU-DA-SOBREMESA"
}
```
**Resposta (201 Created):** Retorna o objeto da recompensa criada.

---

### `PATCH /api/recompensas?id={id}`
Atualiza uma recompensa.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "SEU_USER_ID_AQUI",
  "points_cost": 150,
  "is_active": false
}
```
**Resposta (200 OK):** Retorna o objeto da recompensa atualizada.

---

## 🔌 API de Recursos Humanos (RH)
Endpoints para integrar sistemas externos de gestão de pessoal.

### Recurso: Funcionários (`/api/rh/funcionarios`)

#### `GET /api/rh/funcionarios`
**Ação:** Lista todos os funcionários ativos.
**Requisição:**
```
GET /api/rh/funcionarios?restaurantId=SEU_USER_ID
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```
**Resposta (Exemplo 200 OK):**
```json
[
  {
    "id": "uuid-do-funcionario",
    "name": "Ana Gerente",
    "pin": "1111",
    "role_id": "uuid-do-cargo-gerente",
    "user_id": "SEU_USER_ID",
    "created_at": "...",
    "roles": { "name": "Gerente" }
  }
]
```

#### `POST /api/rh/funcionarios`
**Ação:** Cria um novo funcionário.
**Corpo da Requisição (Exemplo):**
```json
{
  "name": "Novo Garçom",
  "pin": "5678",
  "role_id": "uuid-do-cargo-garcom",
  "salary_type": "mensal",
  "salary_rate": 2200.00
}
```
**Resposta (201 Created):** Retorna o objeto do funcionário recém-criado.

#### `GET /api/rh/funcionarios?id={id}`
**Ação:** Obtém os detalhes de um funcionário específico.
**Resposta (200 OK):** Retorna o objeto completo do funcionário.

#### `PATCH /api/rh/funcionarios?id={id}`
**Ação:** Atualiza a informação de um funcionário.
**Corpo da Requisição (Exemplo):**
```json
{
  "phone": "11998877665",
  "salary_rate": 2350.00
}
```
**Resposta (200 OK):** Retorna o objeto do funcionário atualizado.

#### `DELETE /api/rh/funcionarios?id={id}`
**Ação:** Desativa um funcionário.
**Resposta (204 No Content):** Nenhuma resposta.

---

### Recurso: Cargos e Permissões (`/api/rh/cargos`)

#### `GET /api/rh/cargos`
**Ação:** Lista todos os cargos.
**Resposta (200 OK):**
```json
[
  { "id": "uuid-do-cargo-gerente", "name": "Gerente", "user_id": "..." }
]
```

#### `GET /api/rh/cargos?id={id}&subresource=permissoes`
**Ação:** Lista as permissões de um cargo específico.
**Resposta (200 OK):** `[ "/pos", "/my-leave" ]`

#### `PUT /api/rh/cargos?id={id}&subresource=permissoes`
**Ação:** Define a lista completa de permissões para um cargo.
**Corpo da Requisição:** `{ "permissions": ["/pos", "/cashier"] }`
**Resposta (200 OK):** `{ "success": true, "message": "Permissions updated." }`

---

### Recurso: Permissões Disponíveis (`/api/rh/permissoes-disponiveis`)
**Ação:** Lista todas as chaves de permissão possíveis.
**Resposta (200 OK):** `[ "/dashboard", "/pos", "/kds", ... ]`

---

### Recurso: Controle de Ponto (`/api/rh/ponto`)

#### `GET /api/rh/ponto`
**Ação:** Obtém os registros de ponto para um período.
**Parâmetros de Query:** `data_inicio`, `data_fim` (**obrigatórios**); `employeeId` (opcional).
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-do-registro",
    "employee_id": "uuid-do-funcionario",
    "clock_in_time": "2024-09-25T18:00:00Z",
    "clock_out_time": "2024-09-26T02:00:00Z"
  }
]
```

#### `POST /api/rh/ponto/bater-ponto`
**Ação:** Registra um evento de ponto (entrada/saída/pausa).
**Corpo da Requisição:** `{ "employeeId": "uuid-do-funcionario", "pin": "1234" }`
**Respostas (200 OK):**
- `{ "status": "TURNO_INICIADO", "employeeName": "Ana Gerente" }`
- `{ "status": "PAUSA_INICIADA", "employeeName": "Ana Gerente" }`
- `{ "status": "PAUSA_FINALIZADA", "employeeName": "Ana Gerente" }`
- `{ "status": "TURNO_FINALIZADO", "employeeName": "Ana Gerente" }`

#### `POST /api/rh/ponto` (Ajuste Manual)
**Ação:** Adiciona um registro de ponto manualmente.
**Corpo da Requisição:** `{ "employee_id": "...", "clock_in_time": "...", "clock_out_time": "..." }`
**Resposta (201 Created):** Retorna o novo registro.

#### `PATCH /api/rh/ponto?id={id}` (Ajuste Manual)
**Ação:** Corrige um registro de ponto existente.
**Corpo da Requisição:** `{ "notes": "Ajuste manual." }`
**Resposta (200 OK):** Retorna o registro atualizado.

---

### Recurso: Verificação de PIN (`/api/rh/verificar-pin`)
**Ação:** Valida o PIN de um funcionário.
**Corpo da Requisição:** `{ "employeeId": "uuid-do-funcionario", "pin": "1234" }`
**Resposta (200 OK):** `{ "success": true, "message": "PIN verified.", "employee": { ... } }`
**Resposta (403 Forbidden):** `{ "success": false, "message": "Invalid employeeId or PIN." }`

---

### Recurso: Ausências (`/api/rh/ausencias`)

#### `POST /api/rh/ausencias`
**Ação:** Cria uma solicitação de ausência.
**Corpo da Requisição:**
```json
{
  "employeeId": "uuid-do-funcionario",
  "request_type": "Falta Justificada",
  "start_date": "2024-10-28",
  "end_date": "2024-10-28",
  "reason": "Consulta médica."
}
```
**Resposta (201 Created):** Retorna a solicitação criada.

#### `GET /api/rh/ausencias`
**Ação:** Lista as solicitações de ausência.
**Parâmetros de Query:** `employeeId`, `start_date`, `end_date` (opcionais).
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-solicitacao",
    "employee_id": "uuid-do-funcionario",
    "status": "Pendente",
    ...
  }
]
```

#### `PATCH /api/rh/ausencias?id={id_da_solicitacao}`
**Ação:** Aprova ou rejeita uma solicitação.
**Corpo da Requisição:** `{ "status": "Aprovada", "manager_notes": "Boas férias!" }`
**Resposta (200 OK):** Retorna a solicitação atualizada.

---

### Recurso: Escalas (`/api/rh/escalas`)

#### `GET /api/rh/escalas`
**Ação:** Obtém as escalas e turnos para um período.
**Parâmetros de Query:** `data_inicio`, `data_fim` (**obrigatórios**).
**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-escala",
    "week_start_date": "2024-09-23",
    "is_published": true,
    "shifts": [ ... ]
  }
]
```

#### `POST /api/rh/escalas?id={id}&subresource=publicar`
**Ação:** Publica ou despublica uma escala.
**Corpo da Requisição:** `{ "publish": true }`
**Resposta (200 OK):** `{ "success": true, "message": "Schedule published." }`

---

### Recurso: Folha de Pagamento (`/api/rh/folha-pagamento`)
**Ação:** Gera um resumo da folha de pagamento.
**Parâmetros de Query:** `action=resumo`, `mes` (1-12), `ano` (**obrigatórios**).
**Resposta (200 OK):**
```json
{
  "periodo": "Setembro/2024",
  "totales": {
    "total_a_pagar": 12500.50
  },
  "empleados": [
    {
      "employeeId": "uuid-do-funcionario",
      "name": "Ana Gerente",
      "total_a_pagar": 3500.75
    }
  ]
}
```

---

## 🔌 Webhooks
O ChefOS pode enviar notificações automáticas para sistemas externos sempre que eventos chave ocorrerem.

### Configuração
1.  Vá para `Configurações > Módulos e Integrações > Webhooks`.
2.  Clique em "Novo Webhook", insira a URL do seu sistema e selecione os eventos.
3.  Salve e armazene o **segredo de assinatura** gerado.

### Verificação da Assinatura
Valide o cabeçalho `X-Chefos-Signature` em seu servidor. A assinatura é um hash HMAC-SHA256 do corpo bruto (raw body) da requisição, usando seu segredo como chave.

**Exemplo em Node.js:**
```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const computedSignature = `sha256=${hmac.digest('hex')}`;
  // Use crypto.timingSafeEqual para uma comparação segura
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(computedSignature));
}
```

### Eventos e Payloads

#### `order.created`
Disparado quando um novo pedido é criado.
**Payload:**
```json
{
  "orderId": "uuid-do-pedido",
  "tableNumber": 0,
  "orderType": "QuickSale",
  "status": "OPEN",
  "timestamp": "2024-09-25T18:00:00Z",
  "customer": null,
  "items": [
    { "name": "Hambúrguer", "quantity": 1, "price": 30.00, "notes": "Sem picles." }
  ]
}
```

---

#### `order.updated`
Disparado quando itens são adicionados a um pedido ou seu status muda.
**Payload (Itens Adicionados):**
```json
{
  "id": "uuid-do-pedido",
  "status": "OPEN",
  "itemsAdded": [
    { "name": "Refrigerante", "quantity": 1, "price": 8.00 }
  ],
  "allItems": [ /* ... lista completa de itens ... */ ]
}
```

---

#### `stock.updated`
Disparado quando a quantidade de um ingrediente é alterada.
**Payload:**
```json
{
  "ingredientId": "uuid-do-ingrediente",
  "ingredientName": "Carne de Hambúrguer",
  "quantityChange": -150,
  "newStock": 1850,
  "unit": "g",
  "reason": "Venda Pedido #uuid-do-pedido"
}
```

---

#### `customer.created`
Disparado quando um novo cliente é cadastrado.
**Payload:** O objeto completo do cliente recém-criado.

---

#### `delivery.created`
Disparado quando um novo pedido de delivery (não-iFood) é criado.
**Payload:** O objeto completo do pedido recém-criado.

---

#### `delivery.status_updated`
Disparado quando o status de um pedido de delivery (não-iFood) é atualizado via API.
**Payload:**
```json
{
  "orderId": "uuid-do-pedido",
  "status": "OUT_FOR_DELIVERY",
  "driverId": "uuid-do-entregador",
  "timestamp": "2024-09-26T14:00:00Z",
  "fullOrder": { /* O objeto completo e atualizado do pedido */ }
}
```