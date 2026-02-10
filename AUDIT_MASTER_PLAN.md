
# 📋 Plano Mestre: Auditoria e Rastreabilidade do ChefOS (Fase 2)

Este documento registra o plano aprovado para implementar o rastreamento total de ações de funcionários no sistema.

## 1. Estrutura de Dados (Concluído no SQL)
As seguintes alterações foram preparadas no arquivo `database_audit_schema.sql`:

### Nova Tabela: `inventory_logs`
Responsável por armazenar o histórico imutável de movimentação de estoque.
- **Campos:** `id`, `user_id` (Loja), `ingredient_id`, `employee_id` (Quem), `quantity_change`, `previous_balance`, `new_balance`, `reason`, `created_at`.
- **Uso:** Será alimentada sempre que `adjustIngredientStock` for chamado.

### Alterações em Tabelas Existentes
- **Orders:** Adicionados `created_by_employee_id` e `closed_by_employee_id`.
- **Order Items:** Adicionados `added_by_employee_id` e `authorized_by_employee_id` (Cancelamento já existia).
- **Purchase Orders:** Adicionados `created_by_employee_id` e `received_by_employee_id`.
- **Portioning Events:** Reforçado `employee_id`.

## 2. Próximos Passos (Implementação de Lógica)

### A. Atualizar `PosDataService`
1.  **Criar Pedido:** Capturar `activeEmployee` e salvar em `created_by_employee_id`.
2.  **Adicionar Itens:** Capturar `activeEmployee` e salvar em `added_by_employee_id`.
3.  **Fechar Conta:** Capturar `activeEmployee` (quem está no caixa) e salvar em `closed_by_employee_id`.

### B. Atualizar `InventoryDataService`
1.  **Log de Estoque:** Modificar a função `adjustIngredientStock`.
    *   **Atual:** Apenas chama RPC do banco.
    *   **Novo:** 
        1. Obter snapshot do estoque atual.
        2. Chamar RPC para atualizar.
        3. Inserir registro na tabela `inventory_logs` com o ID do funcionário logado.
2.  **Compras:** Ao criar ou receber uma ordem de compra, salvar o ID do funcionário.

### C. Atualizar `CashierDataService`
1.  **Fechamento:** Garantir que o relatório de fechamento de caixa contenha o ID do funcionário que realizou a contagem.

## 3. Interface (Visual)
1.  **Histórico do Pedido:** Exibir nomes dos funcionários em vez de apenas horários.
2.  **Relatórios:** Criar relatório de "Movimentação de Estoque por Usuário".

---
**Status Atual:**
- [x] Schema SQL criado.
- [x] Modelos TypeScript atualizados.
- [ ] Implementação da lógica nos serviços (Aguardando aprovação para modificar código).
