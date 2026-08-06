# Arquitetura de Produto: ChefOS

O ChefOS adota uma arquitetura de nível *enterprise* desenhada para escalar, baseada no princípio de **Fonte Única da Verdade (Single Source of Truth)**. O objetivo é eliminar a duplicação de dados e garantir consistência entre o que é comprado, o que é produzido e o que é vendido em múltiplos canais.

## O Fluxo em Cascata

A arquitetura do ChefOS é projetada em camadas de responsabilidade única. O fluxo de informações segue uma hierarquia rigorosa, onde módulos inferiores dependem de módulos superiores, mas os superiores nunca conhecem o contexto de como seus dados são aplicados nos inferiores.

```text
ESTOQUE & PRODUÇÃO
        ↓
FICHAS TÉCNICAS
        ↓
CATÁLOGO CENTRAL
        ↓
   PUBLICAÇÃO
        ↓
 CANAIS DE VENDA
```

---

## 1. Módulo: Estoque & Produção
A fundação de toda a operação. Aqui lidamos com o mundo físico, insumos e preparos internos.

* **Responsabilidade:** Controlar o que entra, o que é armazenado e o que é transformado na cozinha.
* **Componentes:**
    * **Estoque de Insumos:** Matérias-primas em sua forma bruta (ex: farinha, tomate, peça de carne).
    * **Ordens de Produção:** Gestão do trabalho da cozinha que transforma insumos brutos em produtos semiacabados (ex: fatiar 10kg de queijo, produzir 30 litros de molho, porcionar massas).
    * **Rendimentos e Pré-preparo:** Cálculo de perdas operacionais e conversão de unidades (ex: perda de limpeza da carne, redução de molhos).
* **Dependências:** Não depende de nenhum outro módulo. É a base do negócio.

## 2. Módulo: Fichas Técnicas
A ponte inteligente entre o mundo físico (Estoque) e o mundo comercial (Catálogo).

* **Responsabilidade:** Definir rigorosamente "como fabricar" um produto vendável ou insumo semiacabado.
* **Componentes:**
    * **Receituário:** Composição detalhada de ingredientes e quantidades (ex: 1 Pão, 150g Hambúrguer, 2 fatias de Bacon, 30ml Molho).
    * **Custeio Base (CMV):** Cálculo automático do Custo da Mercadoria Vendida atualizado em tempo real com base no custo médio do estoque.
* **Como funciona em conjunto:** As Fichas Técnicas consomem os insumos e semiacabados do Estoque. O Catálogo, por sua vez, consome as Fichas Técnicas. Um produto no catálogo *é a representação comercial* de uma Ficha Técnica.

## 3. Módulo: Catálogo
A Fonte Única da Verdade para tudo o que pode ser comercializado. Este módulo é puramente transacional e não se mistura com o visual ou com as regras de um canal de venda específico.

* **Responsabilidade:** Centralizar a definição do portfólio geral de vendas da operação.
* **Componentes:**
    * **Produtos:** Cadastro base independente de canal (Nome original, SKU, Custo, Categoria interna).
    * **Modificadores e Adicionais:** Opções de customização sistêmicas (ex: "Sem cebola", "Adicional de Bacon", "Ponto da Carne").
    * **Combos:** Agrupamentos lógicos de múltiplos produtos do catálogo.
    * **Tabelas de Preço:** Separação total entre *Produto* e *Preço*. Permite ter o mesmo "Cheeseburger" por R$35 no Salão, R$40 no iFood e R$32 no Happy Hour, sem duplicar o cadastro do produto.
    * **Etiquetas e Tags:** Classificadores genéricos para relatórios e agrupamentos lógicos de retaguarda.

## 4. Módulo: Publicação
O motor de orquestração comercial. Um produto pode existir no Catálogo (estar precificado e com ficha técnica), mas não estar publicado em nenhum lugar.

* **Responsabilidade:** Gerenciar o ciclo de vida e a distribuição do catálogo para o mercado. É o funil de inteligência de vendas.
* **Componentes:**
    * **Regras de Canal (Mapeamento):** Qual Tabela de Preço usar em qual Canal específico.
    * **Disponibilidade:** Regras temporais e de status. Liga/desliga produtos em horários específicos ou canais específicos (ex: Prato Executivo apenas almoço no salão; Combo Madrugada apenas delivery próprio).
    * **Sobrescrita Comercial (Overrides):** Permite uma imagem, nome ou descrição promocional específica para o iFood e outra para o Cardápio Digital, sempre referenciando o mesmo SKU único do Catálogo.

## 5. Módulo: Canais de Venda
As vitrines (pontos de contato) e motores de captura de pedidos da operação (Omnichannel).

* **Responsabilidade:** Apresentar de forma atrativa o catálogo publicado ao cliente final (ou operador) e injetar pedidos validados de volta no ecossistema.
* **Componentes:**
    * **Construtores Visuais (Editor Visual):** Constrói a experiência do cliente (Banners, temas, layout, ordem de seções, destaques). Consome passivamente os dados da camada de Publicação, mas *nunca* altera os dados originais dos produtos ou preços.
    * **Integrações Externas (iFood, Rappi, etc.):** Formata e sincroniza ativamente o catálogo autorizado para atender às especificações e regras do marketplace, e orquestra a recepção dos webhooks de pedidos.
    * **Pontos Internos (PDV, Totem, Garçom, Cardápio Digital):** Interfaces de venda direta da loja.
* **Como funciona em conjunto:** Os canais de venda são "burros" em relação a custos e inventário. Eles não possuem inteligência de estoque ou fichas técnicas. Eles apenas "exibem" o que a camada de Publicação entregou com as devidas regras visuais. Quando a venda ocorre, o canal gera um Pedido Padrão.

---

## O Ciclo Completo (Exemplo Prático e Integrado)

1. O Setor de Compras dá entrada na Nota Fiscal com **10kg de Bacon em peça** (Módulo **Estoque**).
2. O Chef da cozinha abre uma **Ordem de Produção** para fatiar, fritar e porcionar o bacon, resultando em 6kg de "Bacon Crocante Fatiado" armazenados em potes (Módulo **Produção**).
3. A **Ficha Técnica** do "Cheeseburger Bacon" está programada para usar exatamente 30g desse semiacabado "Bacon Crocante Fatiado".
4. O analista de sistemas cadastra o "Cheeseburger Bacon" no **Catálogo**, gerando o SKU único `BURGER-BACON-01`. Ele associa as regras financeiras: Tabela PDV R$35 | Tabela Delivery R$42.
5. Na camada de **Publicação**, o gerente de marketing cria uma campanha de fim de semana: ativa a exibição do `BURGER-BACON-01` para o canal "iFood" (injetando a Tabela Delivery) e para o "Cardápio Digital" (injetando a Tabela PDV), associando fotos profissionais.
6. O **Canal de Venda** iFood recebe o sync, formata em seu padrão visual e exibe o hambúrguer por R$42 para o cliente final. O Editor Visual do Cardápio Digital exibe o hambúrguer na categoria "Destaques" com um banner vermelho por R$35.
7. O cliente final compra pelo iFood. O marketplace despacha o webhook. O ChefOS recebe, traduz o pedido do iFood para o padrão do sistema interno, identifica o `BURGER-BACON-01`, aciona a Ficha Técnica invisivelmente e desconta cirurgicamente 30g de "Bacon Crocante Fatiado" do painel de Inventário.

## O Valor de Negócio dessa Arquitetura (Nível Enterprise)

* **Prevenção de Erros Graves:** Como o Editor Visual não edita o Produto Base, é impossível que o designer do cardápio altere acidentalmente o preço do hambúrguer, destruindo a margem de lucro.
* **Desacoplamento Seguro:** Alterar radicalmente o layout do Cardápio Digital não tem impacto na operação. Alterar um preço promocional no iFood não vaza para a precificação do salão.
* **Escalabilidade Omnichannel:** Adicionar um novo canal de vendas inovador (ex: Geladeira Inteligente, Venda por Instagram, Totem de Autoatendimento) exige apenas plugar um novo visualizador à camada de Publicação. O catálogo, tabelas de preço, fichas técnicas e estoques permanecem intocados.
* **Controle Operacional Cirúrgico:** A separação de Produção (cozinha/pré-preparo) e Fichas Técnicas (montagem/venda) permite auditorias perfeitas, separando o que foi desperdiçado na preparação (ex: queima do bacon) do que foi efetivamente consumido na venda.
* **Evolução Natural:** O sistema deixa de ser um "programinha de restaurante" engessado e assume a postura de uma infraestrutura base para grupos gastronômicos, franquias, dark kitchens ou restaurantes independentes em fase de hipercrescimento.
