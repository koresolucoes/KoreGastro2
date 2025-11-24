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
- O `restaurantId` (ID do usuário) deve ser enviado no corpo (`body`) de requisições `POST` e `PATCH`, ou como um parâmetro de query (`query parameter`) em requisições `GET` e `DELETE`.

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
  }
]
```

---

#### `GET /api/v2/halls?id={hallId}`
Obtém os detalhes de um salão específico.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do salão.

**Exemplo de Resposta (200 OK):**
```json
{
  "id": "uuid-do-salao-1",
  "name": "Salão Principal",
  ...
}
```

---

#### `GET /api/v2/halls?id={hallId}&subresource=tables`
Lista todas as mesas associadas a um salão específico.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do salão.
- `subresource` (string, **obrigatório**): Deve ser "tables".

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
  ...
}
```

---

#### `PATCH /api/v2/halls?id={hallId}`
Atualiza o nome de um salão.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID do salão.

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

#### `DELETE /api/v2/halls?id={hallId}`
Exclui um salão e todas as mesas contidas nele.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do salão.

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
    ...
  }
]
```

---

#### `GET /api/v2/tables?id={tableId}`
Obtém os detalhes de uma mesa específica.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID da mesa.

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

#### `PATCH /api/v2/tables?id={tableId}`
Atualiza os dados de uma mesa, como status, posição ou número.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID da mesa.

**Corpo da Requisição (JSON, exemplo de mudança de status):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "status": "OCUPADA"
}
```
**Resposta (200 OK):** Retorna o objeto da mesa atualizada.

---

#### `DELETE /api/v2/tables?id={tableId}`
Exclui uma mesa.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID da mesa.

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
    "price": 30.00,
    "is_available": true,
    "has_stock": true,
    ...
  }
]
```

---

#### `GET /api/v2/menu-items?id={itemId}`
Obtém um item específico do cardápio.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID da receita (item).

**Resposta (200 OK):** Objeto do item do cardápio.

---

#### `PATCH /api/v2/menu-items?id={itemId}`
Atualiza o preço ou a disponibilidade de um item.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID da receita (item).

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
    { "externalCode": "HB-CLASSICO", "quantity": 2, "notes": "Um sem picles" }
  ]
}
```
**Resposta (201 Created):** Retorna o objeto do pedido criado.

---

#### `GET /api/v2/orders?id={orderId}`
Obtém os detalhes de um pedido.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do pedido.

**Resposta (200 OK):** Objeto do pedido com `order_items` e `customers`.

---

#### `DELETE /api/v2/orders?id={orderId}`
Cancela um pedido que está aberto (`OPEN`).

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do pedido.

**Resposta (200 OK):** Objeto do pedido com status `CANCELLED`.

---

#### `POST /api/v2/orders?id={orderId}&subresource=items`
Adiciona um ou mais itens a um pedido existente e aberto.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID do pedido.
- `subresource` (string, **obrigatório**): Deve ser "items".

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

#### `POST /api/v2/orders?id={orderId}&subresource=request-payment`
Sinaliza que a conta de um pedido de mesa (`Dine-in`) foi solicitada. Isso atualiza o status da mesa para `PAGANDO`.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID do pedido.
- `subresource` (string, **obrigatório**): Deve ser "request-payment".

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id"
}
```
**Resposta (200 OK):** `{ "success": true, "message": "Table status updated to PAGANDO." }`

---

### Clientes (`/api/v2/customers`)
Recurso para gerenciar a base de clientes do restaurante.

---

#### `GET /api/v2/customers`
Lista todos os clientes ou busca por um termo.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `search` (string, opcional): Termo para buscar em nome, telefone, email ou CPF.

**Resposta (200 OK):** Array de objetos de cliente.

---

#### `GET /api/v2/customers?id={customerId}`
Obtém os detalhes de um cliente específico.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do cliente.

**Resposta (200 OK):** Objeto do cliente.

---

#### `POST /api/v2/customers`
Cria um novo cliente.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "name": "Novo Cliente",
  "phone": "11987654321",
  "email": "cliente@email.com",
  "cpf": "111.222.333-44",
  "address": "Rua Exemplo, 123",
  "password": "uma_senha_opcional_com_min_6_chars"
}
```
**Resposta (201 Created):** Retorna o objeto do cliente criado (sem o `password_hash`).

---

#### `POST /api/v2/customers?action=login`
Autentica um cliente para obter seus dados. Útil para portais de cliente.

**Parâmetros de Query:**
- `action` (string, **obrigatório**): Deve ser "login".

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "identifier": "cliente@email.com",
  "password": "senha_do_cliente"
}
```
- `identifier` pode ser e-mail, telefone ou CPF.

**Resposta (200 OK):** O objeto completo do cliente (sem `password_hash`).
**Resposta (401 Unauthorized):** Credenciais inválidas.

---

#### `PATCH /api/v2/customers?id={customerId}`
Atualiza os dados de um cliente ou seus pontos de fidelidade.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID do cliente.

**Corpo (JSON - para dados gerais):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "name": "Cliente Atualizado",
  "password": "nova_senha_opcional"
}
```

**Corpo (JSON - para pontos de fidelidade):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "loyalty_points_change": 50,
  "description": "Bônus de aniversário"
}
```
**Resposta (200 OK):** Retorna o objeto completo e atualizado do cliente.

---

#### `DELETE /api/v2/customers?id={customerId}`
Exclui um cliente.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID do cliente.

**Resposta (204 No Content):** Nenhuma resposta.

---

### Reservas (`/api/v2/reservations`)
Recurso para gerenciar reservas.

---

#### `GET /api/v2/reservations?action=availability`
Verifica os horários disponíveis para uma data e número de pessoas.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `action` (string, **obrigatório**): Deve ser "availability".
- `date` (string, **obrigatório**): Data no formato `YYYY-MM-DD`.
- `party_size` (number, **obrigatório**): Número de pessoas.

**Resposta (200 OK):**
```json
{
  "availability": ["19:00", "19:30", "20:30"]
}
```

---

#### `GET /api/v2/reservations`
Lista as reservas dentro de um período.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `start_date` (string, **obrigatório**): Data de início no formato `YYYY-MM-DD`.
- `end_date` (string, **obrigatório**): Data de fim no formato `YYYY-MM-DD`.

**Resposta (200 OK):** Array de objetos de reserva.

---

#### `GET /api/v2/reservations?id={reservationId}`
Obtém os detalhes de uma reserva específica.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID da reserva.

**Resposta (200 OK):** Objeto da reserva.

---

#### `POST /api/v2/reservations`
Cria uma nova reserva.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "customer_name": "Cliente Externo",
  "party_size": 2,
  "reservation_time": "2024-12-25T20:00:00.000Z",
  "notes": "Vindo de um sistema parceiro."
}
```
**Resposta (201 Created):** Retorna o objeto da reserva criada.

---

#### `PATCH /api/v2/reservations?id={reservationId}`
Atualiza uma reserva. Útil para confirmar ou cancelar.

**Parâmetros de Query:**
- `id` (string, **obrigatório**): O UUID da reserva.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "status": "CONFIRMED"
}
```
**Resposta (200 OK):** Retorna o objeto da reserva atualizada.

---

#### `DELETE /api/v2/reservations?id={reservationId}`
Exclui uma reserva.

**Parâmetros de Query:**
- `restaurantId` (string, **obrigatório**).
- `id` (string, **obrigatório**): O UUID da reserva.

**Resposta (204 No Content):** Nenhuma resposta.

---

### Pagamentos (`/api/v2/payments`)
Recurso para finalizar o pagamento de um pedido.

---

#### `POST /api/v2/payments`
Processa o pagamento de um pedido aberto, finalizando a venda.

**Corpo da Requisição (JSON):**
```json
{
  "restaurantId": "seu-restaurant-id",
  "orderId": "uuid-do-pedido-aberto",
  "payments": [
    { "method": "Cartão de Crédito", "amount": 50.00 },
    { "method": "PIX", "amount": 35.50 }
  ],
  "tip": 8.55 
}
```

**Campos do Corpo:**
- `restaurantId` (string, **obrigatório**).
- `orderId` (string, **obrigatório**): O UUID do pedido a ser finalizado.
- `payments` (array, **obrigatório**): Um array de objetos de pagamento.
  - `method` (string): "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Vale Refeição".
  - `amount` (number): Valor do pagamento.
- `tip` (number, opcional): Valor da gorjeta/taxa de serviço.

**Resposta (200 OK):**
```json
{
  "success": true,
  "message": "Payment processed and order completed successfully."
}
```

**Respostas de Erro:**
- `400 Bad Request`: Dados de pagamento insuficientes ou inválidos.
- `404 Not Found`: Pedido aberto com o `orderId` fornecido não encontrado.
- `500 Internal Server Error`: Falha ao processar a transação ou atualizar o status.