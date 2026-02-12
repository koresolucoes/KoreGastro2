
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
  icon: string; // Heroicon path
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
      icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72l1.189-1.19A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z',
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
      icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z',
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
      id: 'delivery-ifood-integrado',
      title: 'Delivery e iFood KDS',
      description: 'Centralize sua operação de delivery. Receba pedidos do iFood e gerencie entregadores próprios em uma única tela.',
      icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25v2.25c0 .621.504 1.125 1.125 1.125m17.25-3.375h-7.5c-.621 0-1.125.504-1.125 1.125',
      steps: [
        {
          title: '1. Painel KDS Delivery',
          content: 'Acesse o menu `iFood > KDS Delivery`. Aqui você vê pedidos do iFood e pedidos de Delivery Próprio em colunas (Recebidos, Em Preparo, Pronto, Em Rota).',
          imageUrl: 'https://picsum.photos/800/400?random=8'
        },
        {
          title: '2. Gestão de Entregadores',
          content: 'Quando um pedido estiver "Pronto", clique nele e selecione "Atribuir Entregador". Você pode cadastrar sua frota e acompanhar quem está levando cada pedido.',
          imageUrl: 'https://picsum.photos/800/400?random=9'
        },
        {
          title: '3. Gestão de Disputas iFood',
          content: 'Se um cliente abrir uma reclamação no iFood, o pedido ficará amarelo ou vermelho no KDS. Clique nele para Aceitar (reembolsar) ou Rejeitar a disputa diretamente pelo ChefOS.',
          imageUrl: 'https://picsum.photos/800/400?random=10'
        },
        {
          title: '4. Mapa de Rastreio',
          content: 'Na aba "Rastreio em Tempo Real" (menu Delivery), você vê a localização dos seus entregadores no mapa (se eles usarem o app mobile para dar baixa na localização).',
          imageUrl: 'https://picsum.photos/800/400?random=11'
        }
      ]
    },
    {
      id: 'estoque-requisicoes',
      title: 'Estoque 2.0: Requisições e Praça',
      description: 'Controle avançado de estoque separando o Almoxarifado Central do Estoque da Cozinha (Praça).',
      icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
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
      icon: 'M14.25 9.75v-4.5m0 4.5h4.5m-4.5 0l6-6m-3 18c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 017.143 7.143c.29.416.162.966-.173 1.347l-.852 1.09a2.25 2.25 0 01-1.293.417H5.25a2.25 2.25 0 01-2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 017.143 7.143c.29.416.162.966-.173 1.347l-.852 1.09a2.25 2.25 0 01-1.293.417H5.25a2.25 2.25 0 01-2.25-2.25v-1.372z',
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
      icon: 'M9.568 3.076A1.5 1.5 0 0110.5 2.25h3a1.5 1.5 0 011.432.826l.866 1.5a1.5 1.5 0 01-.284 1.776l-1.38 1.38A1.5 1.5 0 0113.5 8.25h-3a1.5 1.5 0 01-1.06-.44l-1.38-1.38a1.5 1.5 0 01-.285-1.776l.866-1.5zM9 12.75a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM9 16.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM21 12a9 9 0 11-18 0 9 9 0 0 1 18 0z',
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
      icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
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
      icon: 'M12 6v12m-3-2.818l.879.659c1.171.66 2.605.66 3.784 0l.879-.659m-2.25-1.028a9 9 0 00-3.6 0m3.6 0a9 9 0 003.6 0M3.124 6.097A16.855 16.855 0 0012 5.25c4.75 0 9.178.883 12.876 2.454a1 1 0 01.378 1.258l-1.826 3.844a1 1 0 01-1.43.376c-3.179-1.52-6.577-2.306-9.998-2.306-3.42 0-6.819.786-9.998 2.306a1 1 0 01-1.43-.376L.748 7.355a1 1 0 01.376-1.258z',
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
      icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z',
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
