
# Plano de Reestruturação de Estoque: Almoxarifado vs. Cozinha

Este plano visa migrar o sistema de um modelo de estoque único para um modelo profissional de "Almoxarifado Central" com distribuição para "Setores/Estações".

## Glossário
*   **Almoxarifado (Estoque Central):** Representado pela tabela `ingredients`. É onde as compras dão entrada.
*   **Estoque Setorial:** Representado pela nova tabela `station_stocks`. É o estoque físico disponível na mão do cozinheiro na praça (ex: geladeira da linha).
*   **Requisição:** O ato de mover estoque do Central para o Setorial.

---

## FASE 1: Fundação de Dados (Atual)
**Objetivo:** Criar a estrutura no banco de dados sem quebrar o app atual.
1.  Executar o script SQL contido em `supabase.md`.
2.  Atualizar os tipos TypeScript (`src/models/db.models.ts`) para incluir as novas interfaces (`StationStock`, `Requisition`, `RequisitionItem`).
3.  O sistema continua funcionando exatamente como hoje (vendas descontam de `ingredients`), ignorando as novas tabelas.

---

## FASE 2: Movimentação (O Fluxo de Requisição)
**Objetivo:** Permitir que o estoque seja movido, mas ainda sem alterar como as vendas consomem os itens.
1.  **Backend (Services):**
    *   Criar `RequisitionService` para criar, listar e aprovar requisições.
    *   A lógica de "Aprovar" deve:
        *   Deduzir quantidade da tabela `ingredients` (Almoxarifado).
        *   Somar quantidade na tabela `station_stocks` (Setor).
2.  **Frontend (UI):**
    *   Criar tela de **"Nova Requisição"** (para funcionários pedirem itens).
    *   Criar tela de **"Gerenciar Requisições"** (para o gerente aprovar/entregar).
    *   Adicionar visualização de estoque por setor na tela de Inventário.

---

## FASE 3: Consumo Inteligente (O Grande Switch)
**Objetivo:** Alterar a lógica de baixa de estoque do PDV/KDS para consumir primeiro do setor.
1.  **Refatorar `InventoryDataService.deductStockForOrderItems`:**
    *   *Lógica Atual:* Desconta direto de `ingredients.stock`.
    *   *Nova Lógica:*
        1. Identificar a estação de produção do item (já existe no `RecipePreparation`).
        2. Tentar descontar de `station_stocks` daquela estação.
        3. Se `station_stocks` for insuficiente:
            *   *Opção A (Rígida):* Bloquear venda (Não recomendado).
            *   *Opção B (Híbrida - Recomendada):* Zerar o `station_stocks` e descontar o restante do `ingredients.stock` (Almoxarifado), marcando uma flag de "Quebra de Processo" para relatório posterior.
2.  **Refatorar `MiseEnPlaceDataService`:**
    *   A produção de sub-receitas (mise en place) deve consumir ingredientes do `station_stocks` onde a tarefa está sendo executada.

---

## FASE 4: Relatórios e Auditoria
**Objetivo:** Dar visibilidade sobre onde o estoque está sumindo.
1.  Criar relatório de "Diferença de Estoque Setorial" (Contagem física da praça vs Sistema).
2.  Criar relatório de "Baixas Diretas" (Quantas vezes a venda teve que pegar estoque do almoxarifado porque a praça estava vazia no sistema).

---

## Próximo Passo Sugerido
Assim que o SQL for aplicado, iniciar a **Fase 1 (Tipagem)** e **Fase 2 (Serviços de Movimentação)**.
