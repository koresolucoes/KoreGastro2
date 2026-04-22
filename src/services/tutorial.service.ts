
import { Injectable, signal } from '@angular/core';

export interface TutorialStep {
  title: string;
  content: string;
  imageUrl: string;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  icon: string; // Material symbol name
  steps: TutorialStep[];
}

@Injectable({
  providedIn: 'root'
})
export class TutorialService {
  private readonly tutorials = signal<Tutorial[]>([
    {
      id: 'multi-loja-configuracao',
      title: 'Multi-Loja e Início Rápido',
      description: 'Aprenda a gerenciar múltiplas unidades, alternar entre lojas e convidar sua equipe de gestão.',
      icon: 'storefront',
      steps: [
        {
          title: '1. Alternando entre Lojas',
          content: 'No topo da barra lateral (ou menu superior), você verá o nome da loja atual. Clique nele para abrir o seletor. Se você é dono de várias franquias, todas aparecerão aqui para troca rápida de contexto.',
          imageUrl: 'https://picsum.photos/800/400?random=1'
        },
        {
          title: '2. Criando ou Vinculando Lojas',
          content: 'No seletor de lojas, use a opção "Adicionar / Vincular Loja". Você pode criar uma nova unidade do zero (com banco de dados separado) ou aceitar um convite para gerenciar uma loja existente.',
          imageUrl: 'https://picsum.photos/800/400?random=2'
        },
        {
          title: '3. Convidando Gestores',
          content: 'Vá em `Configurações > Gestão de Equipe`. Digite o e-mail de um gerente ou sócio. Eles receberão acesso imediato a esta unidade específica ao fazer login no ChefOS.',
          imageUrl: 'https://picsum.photos/800/400?random=3'
        }
      ]
    },
    {
      id: 'operacao-venda-hibrida',
      title: 'PDV: Mesas e Comandas',
      description: 'Domine a operação híbrida: controle mesas no mapa e gerencie comandas individuais simultaneamente.',
      icon: 'point_of_sale',
      steps: [
        {
          title: '1. Alternando Visualizações',
          content: 'No topo da tela do PDV, use os botões "Mesas" e "Comandas" para alternar. O modo "Mesas" mostra o mapa do salão. O modo "Comandas" mostra um grid de cartões numéricos.',
          imageUrl: 'https://picsum.photos/800/400?random=4'
        },
        {
          title: '2. Abrindo uma Comanda',
          content: 'No modo Comandas, digite o número do cartão/comanda na busca ou clique em "Abrir Comanda". Você pode atribuir um nome (ex: "Pedro") para facilitar a identificação.',
          imageUrl: 'https://picsum.photos/800/400?random=5'
        },
        {
          title: '3. Painel de Pedidos',
          content: 'Ao abrir uma mesa ou comanda, o painel lateral aparece. Use a busca rápida (Spotlight) para adicionar itens pelo código ou nome. O sistema avisa se houver estoque baixo.',
          imageUrl: 'https://picsum.photos/800/400?random=6'
        },
        {
          title: '4. Pagamento e Divisão',
          content: 'Na hora de pagar, clique em "Conta". Você pode dividir o pagamento por item (arrastando itens para pessoas) ou dividir o valor total igualmente entre os clientes.',
          imageUrl: 'https://picsum.photos/800/400?random=7'
        }
      ]
    },
    {
      id: 'painel-admin',
      title: 'Painel de Administração',
      description: 'Aprenda a gerenciar assinaturas, visualizar métricas globais e controlar o acesso ao sistema.',
      icon: 'admin_panel_settings',
      steps: [
        {
          title: '1. Acesso ao Painel',
          content: 'O Painel de Administração é exclusivo para usuários com permissão de administrador do sistema. Ele pode ser acessado pelo menu lateral clicando em "Acesso Admin".',
          imageUrl: 'https://picsum.photos/800/400?random=30'
        },
        {
          title: '2. Visão Geral (Dashboard)',
          content: 'No dashboard principal, você pode ver métricas globais como o número total de restaurantes cadastrados, a Receita Recorrente Mensal (MRR) e o status das assinaturas.',
          imageUrl: 'https://picsum.photos/800/400?random=31'
        },
        {
          title: '3. Gestão de Assinaturas',
          content: 'Na aba de assinaturas, você pode visualizar todos os planos ativos, cancelar assinaturas inadimplentes ou conceder períodos de teste (trial) para novos clientes.',
          imageUrl: 'https://picsum.photos/800/400?random=32'
        }
      ]
    },
    {
      id: 'delivery-ifood-integrado',
      title: 'Delivery e Integração iFood',
      description: 'Centralize sua operação de delivery. Receba pedidos do iFood com sincronização automática de cardápio e gerencie entregadores.',
      icon: 'delivery_dining',
      steps: [
        {
          title: '1. Sincronização Automática de Cardápio',
          content: 'Ao receber um pedido do iFood, o ChefOS verifica automaticamente se os itens existem no seu sistema. Se um item for novo, ele é criado automaticamente no seu cardápio. Além disso, os preços são sincronizados em tempo real com os valores praticados no iFood.',
          imageUrl: 'https://picsum.photos/800/400?random=8'
        },
        {
          title: '2. Painel KDS Delivery',
          content: 'Acesse o menu `iFood > KDS Delivery`. Aqui você vê pedidos do iFood e pedidos de Delivery Próprio em colunas (Recebidos, Em Preparo, Pronto, Em Rota). O status é atualizado automaticamente no portal do iFood.',
          imageUrl: 'https://picsum.photos/800/400?random=9'
        },
        {
          title: '3. Gestão de Entregadores',
          content: 'Quando um pedido estiver "Pronto", clique nele e selecione "Atribuir Entregador". Você pode cadastrar sua frota e acompanhar quem está levando cada pedido.',
          imageUrl: 'https://picsum.photos/800/400?random=10'
        },
        {
          title: '4. Gestão de Disputas iFood',
          content: 'Se um cliente abrir uma reclamação no iFood, o pedido ficará amarelo ou vermelho no KDS. Clique nele para Aceitar (reembolsar) ou Rejeitar a disputa diretamente pelo ChefOS.',
          imageUrl: 'https://picsum.photos/800/400?random=11'
        }
      ]
    },
    {
      id: 'estoque-requisicoes',
      title: 'Estoque 2.0: Requisições e Praça',
      description: 'Controle avançado de estoque separando o Almoxarifado Central do Estoque da Cozinha (Praça).',
      icon: 'inventory_2',
      steps: [
        {
          title: '1. O Conceito de Requisição',
          content: 'No ChefOS, o "Estoque Central" é onde chegam as compras. A Cozinha/Bar deve pedir itens através de "Requisições" para mover o estoque para a "Praça". Isso ajuda a identificar onde ocorrem as perdas.',
          imageUrl: 'https://picsum.photos/800/400?random=12'
        },
        {
          title: '2. Criando uma Requisição',
          content: 'Vá em `Produção > Requisições`. Selecione sua estação (ex: Cozinha) e adicione os insumos que precisa para o turno. Você pode usar "Kits/Templates" para pedir listas frequentes.',
          imageUrl: 'https://picsum.photos/800/400?random=13'
        },
        {
          title: '3. Aprovando e Transferindo',
          content: 'O gerente ou estoquista acessa a aba "Gerenciar Pedidos", revisa a requisição e clica em "Confirmar Entrega". Isso baixa do estoque central e aumenta o estoque da estação.',
          imageUrl: 'https://picsum.photos/800/400?random=14'
        }
      ]
    },
    {
      id: 'porcionamento-transformacao',
      title: 'Processamento e Porcionamento',
      description: 'Transforme peças inteiras em porções (ex: Peça de Filé -> Medalhões) controlando rendimento e custos.',
      icon: 'content_cut',
      steps: [
        {
          title: '1. Iniciar Porcionamento',
          content: 'Vá em `Estoque > Porcionamento`. Clique em "Registrar Novo". Escolha o insumo de entrada (ex: Peça de Alcatra) e o lote específico.',
          imageUrl: 'https://picsum.photos/800/400?random=15'
        },
        {
          title: '2. Definir Saídas e Rendimento',
          content: 'Adicione os resultados: "Rendimento Principal" (ex: Bifes de 200g) e "Subprodutos" (ex: Aparas para caldo). O sistema calculará o custo unitário da porção baseado no custo da peça inteira.',
          imageUrl: 'https://picsum.photos/800/400?random=16'
        },
        {
          title: '3. Finalizar',
          content: 'Ao salvar, o sistema dá baixa na peça inteira e adiciona as porções ao estoque. Um novo lote "PORCIONADO" é criado automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=17'
        }
      ]
    },
    {
      id: 'seguranca-alimentar-etiquetas',
      title: 'Etiquetagem e Validade (ANVISA)',
      description: 'Gere etiquetas de validade para produtos abertos ou manipulados e garanta a conformidade sanitária.',
      icon: 'label',
      steps: [
        {
          title: '1. Configuração do Item',
          content: 'Na edição de um ingrediente ou receita, preencha o campo "Validade após aberto (dias)". Isso automatiza o cálculo da data.',
          imageUrl: 'https://picsum.photos/800/400?random=18'
        },
        {
          title: '2. Gerando a Etiqueta',
          content: 'No Estoque ou na Ficha Técnica, clique no ícone de "Etiqueta" (tag). O sistema pré-preenche a data de manipulação (hoje) e a validade calculada.',
          imageUrl: 'https://picsum.photos/800/400?random=19'
        },
        {
          title: '3. Impressão',
          content: 'Escolha o modelo (Padrão 60x40mm ou Compacto) e clique em Imprimir. A etiqueta sai colorida de acordo com o dia da semana (padrão PVPS) se sua impressora suportar, ou com identificação de texto clara.',
          imageUrl: 'https://picsum.photos/800/400?random=20'
        }
      ]
    },
    {
      id: 'rh-completo',
      title: 'RH: Escalas, Ponto e Pagamento',
      description: 'Gerencie sua equipe, controle horas trabalhadas e gere previsões de folha de pagamento.',
      icon: 'groups',
      steps: [
        {
          title: '1. Controle de Ponto',
          content: 'Funcionários usam seus PINs para bater ponto na tela de seleção. Se a geolocalização estiver ativa, o sistema valida se eles estão na loja. No menu `RH > Controle de Ponto`, você pode corrigir registros manuais.',
          imageUrl: 'https://picsum.photos/800/400?random=21'
        },
        {
          title: '2. Escalas de Trabalho',
          content: 'Em `RH > Escalas`, planeje a semana visualmente. Clique nos dias para adicionar turnos ou folgas. Você pode copiar a escala da semana anterior para agilizar.',
          imageUrl: 'https://picsum.photos/800/400?random=22'
        },
        {
          title: '3. Folha de Pagamento',
          content: 'Acesse `RH > Folha de Pagamento`. O sistema calcula automaticamente as horas normais e extras baseadas no ponto vs. escala. Você pode lançar bônus/descontos e imprimir um espelho do contracheque.',
          imageUrl: 'https://picsum.photos/800/400?random=23'
        }
      ]
    },
    {
      id: 'gestao-financeira',
      title: 'Financeiro e Relatórios',
      description: 'Analise o DRE, CMV teórico vs. real e o desempenho de vendas detalhado.',
      icon: 'query_stats',
      steps: [
        {
          title: '1. Relatório de Resumo',
          content: 'Em `Relatórios > Resumo`, escolha "Financeiro". Você verá o DRE simplificado com Faturamento Bruto, CMV (baseado nas fichas técnicas) e Lucro Bruto Estimado.',
          imageUrl: 'https://picsum.photos/800/400?random=24'
        },
        {
          title: '2. Auditoria e Cancelamentos',
          content: 'A aba "Auditoria" mostra todos os itens e pedidos cancelados, quem cancelou e o motivo. Use isso para identificar fraudes ou falhas operacionais.',
          imageUrl: 'https://picsum.photos/800/400?random=25'
        },
        {
          title: '3. Construtor de Relatórios',
          content: 'Precisa de algo específico? Use o "Construtor" para selecionar colunas (data, tipo, funcionário), filtrar e agrupar dados. Depois, exporte para CSV/Excel.',
          imageUrl: 'https://picsum.photos/800/400?random=26'
        }
      ]
    },
    {
      id: 'nfce-fidelidade',
      title: 'NFC-e e Fidelidade',
      description: 'Como configurar a emissão fiscal e criar programas de recompensa para clientes.',
      icon: 'receipt_long',
      steps: [
        {
          title: '1. Configuração Fiscal (FocusNFe)',
          content: 'Em `Configurações > Módulos`, clique em "Emissão Fiscal". Insira seu token de produção da FocusNFe e faça upload do certificado digital A1. O sistema validará automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=27'
        },
        {
          title: '2. Emitindo Nota no Caixa',
          content: 'Na tela de pagamento ou no histórico de vendas, clique no botão "NFC-e". O sistema enviará os dados para a SEFAZ e retornará o status em segundos.',
          imageUrl: 'https://picsum.photos/800/400?random=28'
        },
        {
          title: '3. Programa de Fidelidade',
          content: 'Ative a fidelidade em Configurações. Defina quantos pontos o cliente ganha por real gasto. Crie prêmios (ex: "Sobremesa Grátis = 100 pontos"). No PDV, associe o cliente à venda para pontuar.',
          imageUrl: 'https://picsum.photos/800/400?random=29'
        }
      ]
    }
  ]);

  getTutorials(): Tutorial[] {
    return this.tutorials();
  }

  getTutorialById(id: string): Tutorial | undefined {
    return this.tutorials().find(t => t.id === id);
  }
}
