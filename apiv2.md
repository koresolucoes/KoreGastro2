# Documentação da API V2 do ChefOS

Esta documentação detalha a API V2, projetada para ser mais robusta, consistente e fácil de usar, seguindo os padrões RESTful modernos.

A URL base para todas as chamadas da API V2 é: `https://gastro.koresolucoes.com.br`

---

## Princípios Gerais

### Versionamento
- Todas as rotas da API V2 estão sob o prefixo `/api/v2/`.
- A API V1 (`/api/`) continuará funcionando para garantir a compatibilidade com integrações existentes.

### Autenticação
- Todas as requisições para a API V2 devem ser autenticadas.
- A autenticação é feita via **Bearer Token** no cabeçalho `Authorization`.
- O `restaurantId` (ID do usuário) deve ser enviado no corpo (`body`) de requisições `POST` e `PATCH`, ou como parâmetro de query (`query parameter`) em requisições `GET` e `DELETE`.

**Exemplo de Cabeçalho:**
```
Authorization: Bearer SUA_CHAVE_DE_API_EXTERNA
```

### Padrões RESTful
- **URLs Orientadas a Recursos:** As URLs representam substantivos (recursos) no plural (ex: `/halls`, `/tables`).
- **Métodos HTTP:** Utilizamos os verbos HTTP padrão para interagir com os recursos:
  - `GET`: Buscar um ou mais recursos.
  - `POST`: Criar um novo recurso.
  - `PATCH`: Atualizar um recurso existente parcialmente.
  - `DELETE`: Remover um recurso.
- **Respostas JSON:** Todas as respostas, tanto de sucesso quanto de erro, são em formato JSON.
  - **Sucesso:** `200 OK`, `201 Created`. Retornam um objeto com os dados solicitados.
  - **Erro:** `4xx` (erro do cliente), `5xx` (erro do servidor). Retornam um objeto `{"error": {"message": "..."}}`.

---

## Recursos

###  Salões (`/api/v2/halls`)
Recurso para gerenciar os salões (ambientes) do restaurante.

---

#### `GET /api/v2/halls`
Lista todos os salões do restaurante.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Exemplo de Resposta (200 OK):**
```json
[
  {
    "id": "uuid-do-salao-1",
    "name": "Salão Principal",
    "user_id": "seu-restaurant-id",
    "created_at": "..."
  },
  {
    "id": "uuid-do-salao-2",
    "name": "Varanda",
    "user_id": "seu-restaurant-id",
    "created_at": "..."
  }
]
```

---

#### `GET /api/v2/halls/{hallId}`
Obtém os detalhes de um salão específico.

**Parâmetros de Path:**
- `hallId` (string, **obrigatório**): O UUID do salão.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Exemplo de Requisição:** `GET /api/v2/halls/uuid-do-salao-1?restaurantId=...`

**Exemplo de Resposta (200 OK):**
```json
{
  "id": "uuid-do-salao-1",
  "name": "Salão Principal",
  "user_id": "seu-restaurant-id",
  "created_at": "..."
}
```

---

#### `GET /api/v2/halls/{hallId}/tables`
Lista todas as mesas associadas a um salão específico.

**Parâmetros de Path:**
- `hallId` (string, **obrigatório**): O UUID do salão.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Exemplo de Requisição:** `GET /api/v2/halls/uuid-do-salao-1/tables?restaurantId=...`

**Exemplo de Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-mesa-1",
    "number": 1,
    "hall_id": "uuid-do-salao-1",
    "status": "LIVRE",
    ...
  }
]
```

---

#### `POST /api/v2/halls`
Cria um novo salão.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "name": "Área Externa"
}
```
**Exemplo de Resposta (201 Created):**
```json
{
  "id": "uuid-do-novo-salao",
  "name": "Área Externa",
  "user_id": "seu-restaurant-id",
  "created_at": "..."
}
```

---

#### `PATCH /api/v2/halls/{hallId}`
Atualiza o nome de um salão.

**Parâmetros de Path:**
- `hallId` (string, **obrigatório**): O UUID do salão.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "name": "Salão Principal (Renovado)"
}
```
**Exemplo de Resposta (200 OK):**
```json
{
  "id": "uuid-do-salao-1",
  "name": "Salão Principal (Renovado)",
  ...
}
```

---

#### `DELETE /api/v2/halls/{hallId}`
Exclui um salão e todas as mesas contidas nele.

**Parâmetros de Path:**
- `hallId` (string, **obrigatório**): O UUID do salão.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (Sucesso 204 No Content):** Nenhuma resposta.

---

### Mesas (`/api/v2/tables`)
Recurso para gerenciar as mesas do restaurante.

---

#### `GET /api/v2/tables`
Lista todas as mesas. Pode ser filtrada por salão ou status.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `hallId` (string, opcional): Filtra mesas de um salão específico.
- `status` (string, opcional): Filtra mesas por status (`LIVRE`, `OCUPADA`, `PAGANDO`).

**Exemplo de Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-mesa-1",
    "number": 1,
    "hall_id": "uuid-do-salao-1",
    "status": "LIVRE",
    "x": 50,
    "y": 50,
    "width": 80,
    "height": 80,
    "customer_count": 0,
    "employee_id": null,
    "created_at": "...",
    "user_id": "..."
  }
]
```

---

#### `GET /api/v2/tables/{tableId}`
Obtém os detalhes de uma mesa específica.

**Parâmetros de Path:**
- `tableId` (string, **obrigatório**): O UUID da mesa.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (200 OK):** Objeto da mesa.

---

#### `POST /api/v2/tables`
Cria uma nova mesa em um salão.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "number": 15,
  "hall_id": "uuid-do-salao-1",
  "x": 100,
  "y": 200,
  "width": 90,
  "height": 90
}
```
**Resposta (201 Created):** Retorna o objeto da mesa criada.

---

#### `PATCH /api/v2/tables/{tableId}`
Atualiza os dados de uma mesa, como status, posição ou número.

**Parâmetros de Path:**
- `tableId` (string, **obrigatório**): O UUID da mesa.

**Corpo da Requisição (JSON, exemplo de mudança de status):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "status": "OCUPADA"
}
```
**Corpo da Requisição (JSON, exemplo de mudança de layout):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "x": 110,
  "y": 210,
  "number": 16
}
```
**Resposta (200 OK):** Retorna o objeto da mesa atualizada.

---

#### `DELETE /api/v2/tables/{tableId}`
Exclui uma mesa.

**Parâmetros de Path:**
- `tableId` (string, **obrigatório**): O UUID da mesa.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (204 No Content):** Nenhuma resposta.

---

### Cardápio (`/api/v2/menu-items`)
Recurso para consultar e gerenciar itens do cardápio.

---

#### `GET /api/v2/menu-items`
Lista os itens do cardápio.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `isAvailable` (boolean, opcional): `true` para listar apenas itens disponíveis.
- `categoryId` (string, opcional): Filtra por categoria de prato.

**Resposta (200 OK):**
```json
[
  {
    "id": "uuid-da-receita-1",
    "name": "Hambúrguer Clássico",
    "description": "Pão, carne, queijo e salada.",
    "price": 30.00,
    "category_id": "uuid-da-categoria-1",
    "category_name": "Lanches",
    "is_available": true,
    "has_stock": true,
    ...
  }
]
```

---

#### `GET /api/v2/menu-items/{itemId}`
Obtém um item específico do cardápio.

**Parâmetros de Path:**
- `itemId` (string, **obrigatório**): O UUID da receita (item).

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (200 OK):** Objeto do item do cardápio.

---

#### `PATCH /api/v2/menu-items/{itemId}`
Atualiza o preço ou a disponibilidade de um item.

**Parâmetros de Path:**
- `itemId` (string, **obrigatório**): O UUID da receita (item).

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "price": 32.50,
  "is_available": false
}
```
**Resposta (200 OK):** Retorna o objeto do item atualizado.

---

### Pedidos (`/api/v2/orders`)
Recurso para criar e gerenciar pedidos.

---

#### `GET /api/v2/orders`
Lista os pedidos.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `status` (string, opcional): `OPEN`, `COMPLETED`, `CANCELLED`.
- `tableNumber` (number, opcional).
- `customerId` (string, opcional).

**Resposta (200 OK):** Array de objetos de pedido.

---

#### `POST /api/v2/orders`
Cria um novo pedido.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "tableNumber": 5,
  "customerId": "uuid-do-cliente-opcional",
  "items": [
    { "externalCode": "HB-CLASSICO", "quantity": 2, "notes": "Um sem picles" },
    { "externalCode": "REFRI-LATA", "quantity": 2 }
  ]
}
```
**Resposta (201 Created):** Retorna o objeto do pedido criado.

---

#### `GET /api/v2/orders/{orderId}`
Obtém os detalhes de um pedido.

**Parâmetros de Path:**
- `orderId` (string, **obrigatório**): O UUID do pedido.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (200 OK):** Objeto do pedido com `order_items` e `customers`.

---

#### `DELETE /api/v2/orders/{orderId}`
Cancela um pedido que está aberto (`OPEN`).

**Parâmetros de Path:**
- `orderId` (string, **obrigatório**): O UUID do pedido.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).

**Resposta (200 OK):** Objeto do pedido com status `CANCELLED`.

---

#### `POST /api/v2/orders/{orderId}/items`
Adiciona um ou mais itens a um pedido existente e aberto.

**Parâmetros de Path:**
- `orderId` (string, **obrigatório**): O UUID do pedido.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "items": [
    { "externalCode": "BATATA-FRITA", "quantity": 1 }
  ]
}
```
**Resposta (200 OK):** Retorna os itens que foram adicionados.

---

#### `POST /api/v2/orders/{orderId}/request-payment`
Sinaliza que a conta de um pedido de mesa (`Dine-in`) foi solicitada. Isso atualiza o status da mesa para `PAGANDO`.

**Parâmetros de Path:**
- `orderId` (string, **obrigatório**): O UUID do pedido.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id"
}
```
**Resposta (200 OK):** `{ "success": true, "message": "Table status updated to PAGANDO." }`
