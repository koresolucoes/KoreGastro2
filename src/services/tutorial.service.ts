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
      id: 'configuracao-inicial',
      title: 'Configuração Inicial',
      description: 'Aprenda a cadastrar seus primeiros funcionários, estações e categorias para deixar o sistema pronto para operar.',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426-1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
      steps: [
        {
          title: '1. Crie Cargos e Defina Permissões',
          content: 'Antes de cadastrar funcionários, vá para `Configurações > Cargos e Permissões`. O cargo "Gerente" já vem com acesso total. Crie outros cargos como "Caixa" e "Garçom" e clique no cadeado para definir quais telas cada um poderá acessar. Isso garante que sua equipe veja apenas o necessário.',
          imageUrl: 'https://i.imgur.com/au6yAUY.png'
        },
        {
          title: '2. Cadastre seus Funcionários',
          content: 'Agora, vá para o menu `RH > Funcionários`. Clique em "Novo Funcionário" e preencha os dados, atribuindo os cargos que você criou no passo anterior. O PIN de 4 dígitos é essencial para o login operacional de cada um.',
          imageUrl: 'https://i.imgur.com/h9pw1An.png'
        },
        {
          title: '3. Crie as Estações de Produção',
          content: 'Em `Configurações > Estações de Produção`, adicione todas as áreas que preparam itens, como "Cozinha", "Bar" ou "Pizzaria". Isso é crucial para o KDS (tela da cozinha) funcionar corretamente.',
          imageUrl: 'https://i.imgur.com/1IC1q7P.png'
        },
        {
          title: '4. Defina as Categorias de Pratos',
          content: 'Ainda em `Configurações`, na seção "Categorias de Pratos", crie as categorias do seu cardápio, como "Entradas", "Pratos Principais", "Bebidas", etc. Isso ajudará a organizar seu PDV e cardápio online.',
          imageUrl: 'https://i.imgur.com/sLWip0i.png'
        }
      ]
    },
    {
      id: 'gestao-de-estoque',
      title: 'Gestão de Estoque',
      description: 'Veja como cadastrar ingredientes, fornecedores e realizar ajustes de entrada e saída no seu inventário.',
      icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
      steps: [
        {
          title: '1. Cadastre um Ingrediente',
          content: 'Navegue até a página "Estoque" e clique em "Adicionar Ingrediente". Preencha as informações como nome, unidade de medida, custo e estoque mínimo. O estoque mínimo é usado para alertá-lo quando um item está acabando.',
          imageUrl: 'https://i.imgur.com/4e00wUT.png'
        },
        {
          title: '2. Registre uma Entrada (Compra)',
          content: 'Na lista de ingredientes, encontre o item que você comprou e clique em "Ajustar". Selecione "Registrar Entrada", informe a quantidade e o motivo (ex: Compra de Fornecedor). Isso aumentará seu estoque.',
          imageUrl: 'https://i.imgur.com/bfeP6tU.png'
        },
        {
          title: '3. Registre uma Saída (Perda)',
          content: 'Se precisar dar baixa em um item por perda ou quebra, clique em "Ajustar", selecione "Registrar Saída", e informe a quantidade e o motivo. Isso deduzirá o item do seu estoque.',
          imageUrl: 'https://i.imgur.com/ID5t7AM.png'
        }
      ]
    },
    {
      id: 'operacao-de-venda',
      title: 'Operação de Venda (PDV)',
      description: 'Um guia rápido sobre como abrir uma mesa, lançar pedidos para a cozinha e enviar a conta para o caixa.',
      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
      steps: [
        {
          title: '1. Abra uma Mesa',
          content: 'Na tela do PDV, clique em uma mesa com status "LIVRE". A mesa mudará para "OCUPADA" e o painel de pedidos será aberto automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=7'
        },
        {
          title: '2. Adicione Itens ao Pedido',
          content: 'No painel de pedidos, use o menu à esquerda para encontrar e adicionar os itens desejados. Eles aparecerão no carrinho na área de "Resumo do Pedido". Você pode adicionar notas a cada item, como "sem cebola".',
          imageUrl: 'https://picsum.photos/800/400?random=8'
        },
        {
          title: '3. Envie o Pedido',
          content: 'Após adicionar todos os itens do cliente, clique no botão "Enviar Pedido". Os itens serão enviados para as estações corretas (KDS) e listados como "PENDENTE" no resumo da mesa.',
          imageUrl: 'https://picsum.photos/800/400?random=9'
        },
        {
            title: '4. Feche a Conta',
            content: 'Quando o cliente pedir a conta, clique no botão "Fechar Conta". A mesa mudará para o status "PAGANDO" e aparecerá na tela do Caixa para o recebimento.',
            imageUrl: 'https://picsum.photos/800/400?random=10'
        }
      ]
    },
    {
      id: 'usando-o-kds',
      title: 'Operando a Cozinha (KDS)',
      description: 'Aprenda a gerenciar os pedidos da cozinha em tempo real, desde o recebimento até a liberação para o garçom.',
      icon: 'M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375',
      steps: [
        {
          title: '1. Visualizando as Comandas',
          content: 'Acesse a tela "Cozinha (KDS)". As comandas aparecerão automaticamente na estação correta assim que forem enviadas pelo PDV. Cada comanda mostra a mesa e o tempo decorrido.',
          imageUrl: 'https://picsum.photos/800/400?random=11'
        },
        {
          title: '2. Atualizando o Status dos Itens',
          content: 'Clique em um item "PENDENTE" para movê-lo para "EM PREPARO". A cor do item mudará. Clique novamente quando estiver finalizado para marcá-lo como "PRONTO".',
          imageUrl: 'https://picsum.photos/800/400?random=12'
        },
        {
          title: '3. Usando o Modo Expo',
          content: 'Alterne para a visão "Expo" para ter uma visão geral de todos os pedidos. Esta tela é ideal para o chef ou expedidor coordenar a montagem dos pratos e garantir que os pedidos saiam completos e no tempo certo.',
          imageUrl: 'https://picsum.photos/800/400?random=13'
        },
        {
          title: '4. Liberando o Pedido Completo',
          content: 'No modo "Expo", quando todos os itens de uma mesa estiverem "PRONTOS", a comanda ficará destacada em verde. Clique em "Marcar como Entregue" para notificar que o pedido pode ser retirado pelo garçom.',
          imageUrl: 'https://picsum.photos/800/400?random=14'
        }
      ]
    },
    {
      id: 'gerenciando-o-caixa',
      title: 'Gerenciando o Caixa',
      description: 'Domine as operações de caixa, incluindo recebimento de mesas, vendas rápidas no balcão e o fechamento do dia.',
      icon: 'M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
      steps: [
        {
          title: '1. Recebendo Pagamento de Mesas',
          content: 'Na tela "Caixa", a aba "Mesas p/ Pagar" mostra todas as contas em aberto. Clique em uma mesa e depois em "Pagar" para abrir o modal de pagamento, onde você pode registrar os valores e métodos de pagamento.',
          imageUrl: 'https://picsum.photos/800/400?random=15'
        },
        {
          title: '2. Realizando uma Venda Rápida',
          content: 'Use a aba "Venda Rápida" para vendas de balcão. Adicione itens ao carrinho e clique em "Finalizar Venda" para processar o pagamento diretamente, sem a necessidade de abrir uma mesa.',
          imageUrl: 'https://picsum.photos/800/400?random=16'
        },
        {
          title: '3. Lançando Despesas',
          content: 'Na aba "Fechamento de Caixa", você pode registrar saídas de dinheiro, como pagamento de fornecedores ou pequenas compras. Isso garante que seu fechamento de caixa seja preciso.',
          imageUrl: 'https://picsum.photos/800/400?random=17'
        },
        {
          title: '4. Fechamento de Caixa',
          content: 'Ao final do expediente, vá para "Fechamento de Caixa", confira o resumo de vendas, insira o valor contado no caixa e clique em "Fechar Caixa". O sistema calculará qualquer diferença e gerará um relatório para impressão.',
          imageUrl: 'https://picsum.photos/800/400?random=18'
        }
      ]
    },
    {
      id: 'criando-fichas-tecnicas',
      title: 'Criando Fichas Técnicas',
      description: 'Aprenda a criar fichas técnicas detalhadas para seus pratos, garantindo o custo preciso (CMV) e a baixa automática de estoque.',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      steps: [
        {
          title: '1. Crie uma Nova Receita',
          content: 'Na página "Fichas Técnicas", clique em "Nova Ficha Técnica". Preencha as informações básicas como nome, preço de venda e categoria do prato.',
          imageUrl: 'https://picsum.photos/800/400?random=19'
        },
        {
          title: '2. Adicione Etapas e Ingredientes',
          content: 'Adicione as etapas de preparação (ex: "Massa", "Molho"). Para cada etapa, adicione os ingredientes do seu estoque e especifique a quantidade usada. O sistema calculará o custo automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=20'
        },
        {
          title: '3. Use Sub-receitas',
          content: 'Se um prato utiliza outra receita já cadastrada (como um molho base), você pode adicioná-la como uma sub-receita. O custo da sub-receita será somado ao custo total do prato.',
          imageUrl: 'https://picsum.photos/800/400?random=21'
        },
        {
          title: '4. Análise o Custo (CMV)',
          content: 'O painel à direita mostra o Custo de Mercadoria Vendida (CMV) do prato, atualizado em tempo real conforme você adiciona ingredientes. Use essa informação para otimizar sua precificação.',
          imageUrl: 'https://picsum.photos/800/400?random=22'
        }
      ]
    },
    {
      id: 'planejando-o-mise-en-place',
      title: 'Planejando o Mise en Place',
      description: 'Organize a produção diária da sua cozinha. Crie tarefas de preparo, atribua a funcionários e acompanhe o progresso.',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      steps: [
        {
          title: '1. Acesse o Plano do Dia',
          content: 'Na tela "Mise en Place", selecione a data para a qual deseja planejar a produção. O sistema criará um quadro de tarefas para aquele dia.',
          imageUrl: 'https://picsum.photos/800/400?random=23'
        },
        {
          title: '2. Adicione Tarefas de Produção',
          content: 'Clique em "Adicionar Tarefa". Você pode criar uma tarefa baseada em uma sub-receita (ex: produzir 2 litros de Molho Branco) ou uma tarefa personalizada (ex: higienizar vegetais).',
          imageUrl: 'https://picsum.photos/800/400?random=24'
        },
        {
          title: '3. Atribua Responsáveis',
          content: 'Para cada tarefa, defina a quantidade a ser produzida, a estação responsável e, opcionalmente, atribua a um funcionário específico para organizar o trabalho da equipe.',
          imageUrl: 'https://picsum.photos/800/400?random=25'
        },
        {
          title: '4. Acompanhe o Progresso',
          content: 'Os cozinheiros podem clicar nas tarefas para atualizar seu status de "A Fazer" para "Em Preparo" e, finalmente, "Concluído". As tarefas concluídas que são sub-receitas vinculadas ao estoque atualizarão o inventário automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=26'
        }
      ]
    },
    {
      id: 'analisando-resultados',
      title: 'Analisando Relatórios e Desempenho',
      description: 'Extraia dados valiosos sobre suas vendas, produtos mais populares e o desempenho da equipe para tomar decisões inteligentes.',
      icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2z',
      steps: [
        {
          title: '1. Gere Relatórios de Vendas',
          content: 'Na página "Relatórios", selecione o período desejado e o tipo "Vendas". O sistema mostrará o faturamento bruto, total de pedidos, ticket médio e um resumo por forma de pagamento.',
          imageUrl: 'https://picsum.photos/800/400?random=27'
        },
        {
          title: '2. Descubra os Itens Mais Vendidos',
          content: 'Mude o tipo de relatório para "Itens Mais Vendidos" para ver um ranking dos seus pratos mais populares no período, incluindo a quantidade vendida e a receita gerada por cada um.',
          imageUrl: 'https://picsum.photos/800/400?random=28'
        },
        {
          title: '3. Avalie o Desempenho da Equipe',
          content: 'Acesse a tela "Desempenho" para analisar métricas por funcionário, como total de vendas e gorjetas. Na aba "Cozinha", você pode ver a produtividade em tarefas de mise en place e o tempo médio de preparo por estação.',
          imageUrl: 'https://picsum.photos/800/400?random=29'
        }
      ]
    },
    {
        id: 'ordens-de-compra',
        title: 'Gerenciando Ordens de Compra',
        description: 'Crie ordens de compra, acompanhe o status e dê entrada nos produtos no estoque de forma automatizada.',
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.658-.463 1.243-1.117 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.117 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
        steps: [
          {
            title: '1. Crie uma Nova Ordem',
            content: 'Vá para a página "Compras" e clique em "Nova Ordem de Compra". Selecione o fornecedor e defina o status inicial como "Rascunho".',
            imageUrl: 'https://picsum.photos/800/400?random=30'
          },
          {
            title: '2. Adicione Itens ao Pedido',
            content: 'Na tela de edição, procure e adicione os ingredientes que deseja comprar. Informe a quantidade e o custo unitário negociado com o fornecedor.',
            imageUrl: 'https://picsum.photos/800/400?random=31'
          },
          {
            title: '3. Receba os Produtos',
            content: 'Quando os produtos chegarem, encontre a ordem de compra e clique em "Receber". O sistema irá automaticamente dar entrada de todos os itens no seu estoque com as quantidades especificadas na ordem.',
            imageUrl: 'https://picsum.photos/800/400?random=32'
          }
        ]
    },
    {
      id: 'gestao-de-fornecedores',
      title: 'Gestão de Fornecedores',
      description: 'Cadastre e gerencie os contatos dos seus fornecedores para facilitar o processo de compras.',
      icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6.375M9 12h6.375M9 17.25h6.375',
      steps: [
        {
          title: '1. Acesse a área de Fornecedores',
          content: 'Vá para Configurações e encontre o painel "Fornecedores". Aqui você pode ver todos os fornecedores já cadastrados e buscar por um específico.',
          imageUrl: 'https://picsum.photos/800/400?random=33'
        },
        {
          title: '2. Adicione um Novo Fornecedor',
          content: 'Clique em "Adicionar" e preencha as informações de contato, como nome da empresa, pessoa de contato, telefone e e-mail. Ter esses dados centralizados facilita a criação de Ordens de Compra.',
          imageUrl: 'https://picsum.photos/800/400?random=34'
        }
      ]
    },
    {
      id: 'cadastro-de-pratos',
      title: 'Cadastro de Pratos (Cardápio)',
      description: 'Aprenda a cadastrar os pratos do seu cardápio, definir preços e categorias para o PDV e o menu online.',
      icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
      steps: [
        {
          title: '1. Crie o Prato',
          content: 'Vá para "Fichas Técnicas" e clique em "Nova Ficha Técnica". O primeiro passo é definir o nome do prato, o preço de venda e a qual categoria do cardápio ele pertence.',
          imageUrl: 'https://picsum.photos/800/400?random=35'
        },
        {
          title: '2. Defina a Disponibilidade',
          content: 'Marque la opción "Disponível" para que el plato aparezca en el PDV y en el menú en línea. Puede desmarcar esta opción en cualquier momento para eliminar el plato del menú sin borrarlo.',
          imageUrl: 'https://picsum.photos/800/400?random=36'
        },
        {
          title: '3. Veja no PDV',
          content: 'Após salvar, o novo prato estará disponível para ser lançado nos pedidos na tela do PDV, dentro da categoria que você selecionou.',
          imageUrl: 'https://picsum.photos/800/400?random=37'
        }
      ]
    },
    {
      id: 'impressao-de-recibos',
      title: 'Impressão de Recibos e Pré-contas',
      description: 'Saiba como imprimir pré-contas para conferência do cliente e recibos finais após o pagamento.',
      icon: 'M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6 3.129M6.72 13.829L6 3.129m0 10.7a48.45 48.45 0 0112 0m-12 0v.042m12 0v-.042m0 10.704l.72-10.7M17.28 13.829c.24.03.48.062.72.096m-.72-.096L18 3.129m-1.2 10.7l.72-10.7m0 10.7a48.45 48.45 0 00-12 0m12 0v.042m-12 0v-.042',
      steps: [
        {
          title: '1. Imprima a Pré-conta no PDV',
          content: 'Na tela do PDV, clique com o botão direito (ou segure o toque no celular) em uma mesa ocupada para abrir o menu de opções. Selecione "Imprimir Pré-conta" para gerar uma conferência para o cliente.',
          imageUrl: 'https://picsum.photos/800/400?random=38'
        },
        {
          title: '2. Finalize o Pagamento no Caixa',
          content: 'Após enviar a conta para o caixa, vá para a tela "Caixa", encontre a mesa e processe o pagamento. Ao final, o sistema oferecerá a opção de imprimir o recibo final.',
          imageUrl: 'https://picsum.photos/800/400?random=39'
        },
        {
          title: '3. Reimprima um Recibo',
          content: 'Precisa de uma segunda via? Na tela "Caixa", vá para a aba "Vendas Finalizadas". Encontre a venda e clique no botão "Reimprimir" para gerar um novo recibo.',
          imageUrl: 'https://picsum.photos/800/400?random=40'
        }
      ]
    },
    {
      id: 'relatorios-de-vendas',
      title: 'Gerando Relatórios de Vendas',
      description: 'Aprenda a usar o gerador de relatórios para analisar suas vendas por período e identificar os itens mais lucrativos.',
      icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2z',
      steps: [
        {
          title: '1. Acesse a Tela de Relatórios',
          content: 'No menu, clique em "Relatórios". Esta é a sua central para extrair dados consolidados sobre a operação.',
          imageUrl: 'https://picsum.photos/800/400?random=41'
        },
        {
          title: '2. Selecione o Período e Tipo',
          content: 'Escolha o intervalo de datas que deseja analisar (início e fim). Em seguida, selecione o tipo de relatório, como "Vendas" para um resumo financeiro ou "Itens Mais Vendidos" para um ranking de produtos.',
          imageUrl: 'https://picsum.photos/800/400?random=42'
        },
        {
          title: '3. Analise e Imprima',
          content: 'Clique em "Gerar Relatório". Os dados serão exibidos na tela. Você pode usar o botão "Imprimir" para gerar uma versão física do relatório para reuniões ou arquivamento.',
          imageUrl: 'https://picsum.photos/800/400?random=43'
        }
      ]
    },
    {
      id: 'cardapio-online-qrcode',
      title: 'Cardápio Online e QR Code',
      description: 'Disponibilize seu cardápio para os clientes de forma digital através de um QR Code gerado automaticamente.',
      icon: 'M3.75 4.5a.75.75 0 00-.75.75v13.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75V5.25a.75.75 0 00-.75-.75H3.75zM8.25 8.25a.75.75 0 01.75.75v.008a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm.75 2.25a.75.75 0 00-.75.75v3.75a.75.75 0 001.5 0V12a.75.75 0 00-.75-.75zm3-2.25a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm2.25 .75a.75.75 0 00-.75.75v3a.75.75 0 001.5 0V9.75a.75.75 0 00-.75-.75z',
      steps: [
        {
          title: '1. Gerando o QR Code',
          content: 'Vá para Configurações e encontre o painel "QR Code do Cardápio Online". O sistema gera automaticamente um QR Code único para o seu estabelecimento.',
          imageUrl: 'https://picsum.photos/800/400?random=44'
        },
        {
          title: '2. Baixando e Imprimindo',
          content: 'Clique em "Baixar QR Code" para salvar a imagem. Imprima e coloque nas mesas ou em locais visíveis para que os clientes possam escanear com seus celulares.',
          imageUrl: 'https://picsum.photos/800/400?random=45'
        },
        {
          title: '3. Gerenciando a Visibilidade',
          content: 'A disponibilidade dos pratos no cardápio online é controlada pela opção "Disponível?" na Ficha Técnica de cada item. Se um prato está sem estoque, ele também é ocultado automaticamente.',
          imageUrl: 'https://picsum.photos/800/400?random=46'
        }
      ]
    },
    {
      id: 'gestao-saloes-mesas',
      title: 'Gestão de Salões e Mesas',
      description: 'Organize o layout do seu restaurante. Crie salões e posicione as mesas visualmente com a ferramenta de edição.',
      icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
      steps: [
        {
          title: '1. Gerenciando Salões',
          content: 'Na tela do PDV, clique em "Gerenciar Salões". Aqui você pode adicionar, renomear ou excluir salões (ex: "Área Interna", "Varanda").',
          imageUrl: 'https://picsum.photos/800/400?random=47'
        },
        {
          title: '2. Entrando no Modo de Edição',
          content: 'Volte para a tela do PDV, selecione um salão e clique em "Editar Layout". As mesas se tornarão editáveis, permitindo que você as mova.',
          imageUrl: 'https://picsum.photos/800/400?random=48'
        },
        {
          title: '3. Adicionando e Posicionando Mesas',
          content: 'Clique em "Adicionar Mesa" para criar uma nova. Arraste-a para a posição desejada no salão. Use o canto inferior direito para redimensioná-la conforme o tamanho real.',
          imageUrl: 'https://picsum.photos/800/400?random=49'
        },
        {
          title: '4. Salvando o Layout',
          content: 'Após organizar suas mesas, clique em "Salvar Layout" para sair do modo de edição. As novas posições e tamanhos serão salvos para todos os usuários.',
          imageUrl: 'https://picsum.photos/800/400?random=50'
        }
      ]
    },
    {
      id: 'criando-promocoes',
      title: 'Criando Promoções',
      description: 'Configure promoções como Happy Hour ou pratos com desconto para dias específicos da semana e horários.',
      icon: 'M9.568 3.076A1.5 1.5 0 0110.5 2.25h3a1.5 1.5 0 011.432.826l.866 1.5a1.5 1.5 0 01-.284 1.776l-1.38 1.38A1.5 1.5 0 0113.5 8.25h-3a1.5 1.5 0 01-1.06-.44l-1.38-1.38a1.5 1.5 0 01-.285-1.776l.866-1.5zM9 12.75a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM9 16.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      steps: [
        {
          title: '1. Crie uma Nova Promoção',
          content: 'Vá para Configurações, encontre o painel de Promoções e clique em "Nova Promoção". Dê um nome claro, como "Happy Hour de Terça".',
          imageUrl: 'https://picsum.photos/800/400?random=51'
        },
        {
          title: '2. Defina as Regras',
          content: 'Configure os dias da semana e o horário de início e fim em que a promoção será válida. Marque a opção "Ativa" para que ela funcione no sistema.',
          imageUrl: 'https://picsum.photos/800/400?random=52'
        },
        {
          title: '3. Adicione Pratos à Promoção',
          content: 'Na tela de edição da promoção, adicione os pratos que farão parte dela. Para cada prato, defina o tipo de desconto (percentual ou valor fixo) e o valor. Os preços serão ajustados automaticamente no PDV durante o período da promoção.',
          imageUrl: 'https://picsum.photos/800/400?random=53'
        }
      ]
    },
    {
      id: 'desempenho-cozinha',
      title: 'Análise de Desempenho da Cozinha',
      description: 'Monitore a eficiência da sua cozinha, analisando o tempo de preparo por estação e a produtividade da equipe no mise en place.',
      icon: 'M3 3v18h18',
      steps: [
        {
          title: '1. Acesse a Tela de Desempenho',
          content: 'No menu, vá para "Desempenho" e selecione a aba "Cozinha". Aqui você encontrará os principais indicadores de produção.',
          imageUrl: 'https://picsum.photos/800/400?random=54'
        },
        {
          title: '2. Velocidade por Estação',
          content: 'Analise o gráfico "Velocidade por Estação" para ver o tempo médio de preparo de itens em cada área (Cozinha, Bar, etc.). Tempos altos podem indicar gargalos ou necessidade de mais pessoal.',
          imageUrl: 'https://picsum.photos/800/400?random=55'
        },
        {
          title: '3. Produtividade no Mise en Place',
          content: 'O gráfico "Produtividade (Mise en Place)" mostra quantas tarefas de preparo cada funcionário concluiu no período. Use isso para reconhecer os mais produtivos e identificar necessidades de treinamento.',
          imageUrl: 'https://picsum.photos/800/400?random=56'
        }
      ]
    },
    {
      id: 'gestao-completa-rh',
      title: 'Gestão Completa de RH',
      description: 'Do cadastro à folha de pagamento, aprenda a gerenciar todos os aspectos da sua equipe de forma integrada.',
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.001 3.001 0 015.658 0M9 9a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0zM9 9h6',
      steps: [
        {
          title: '1. Cadastre os Funcionários',
          content: 'Vá para RH > Funcionários para adicionar os membros da sua equipe. Preencha todos os dados, incluindo informações para a folha de pagamento.',
          imageUrl: 'https://picsum.photos/800/400?random=57'
        },
        {
          title: '2. Crie as Escalas de Trabalho',
          content: 'Em RH > Escalas, planeje a semana da sua equipe. Selecione a semana, e clique nos dias e funcionários para adicionar os turnos de trabalho.',
          imageUrl: 'https://picsum.photos/800/400?random=58'
        },
        {
          title: '3. Gerencie Ausências',
          content: 'Na tela de RH > Gestão de Ausências, você pode aprovar ou rejeitar as solicitações de folga e férias da equipe. Os funcionários fazem suas solicitações em RH > Minhas Ausências.',
          imageUrl: 'https://picsum.photos/800/400?random=59'
        },
        {
          title: '4. Gere a Folha de Pagamento',
          content: 'Acesse RH > Folha de Pagamento, selecione o período e o sistema calculará uma prévia dos salários com base nas horas trabalhadas e agendadas. Você pode gerar um contracheque detalhado para cada funcionário.',
          imageUrl: 'https://picsum.photos/800/400?random=60'
        }
      ]
    },
    {
      id: 'controle-de-ponto',
      title: 'Controle de Ponto Manual',
      description: 'Aprenda a visualizar, adicionar e editar manualmente os registros de ponto dos funcionários, garantindo a precisão das horas trabalhadas.',
      icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
      steps: [
        {
          title: '1. Acessando o Controle de Ponto',
          content: 'No menu RH, vá para "Controle de Ponto". Você verá uma lista de todos os registros de ponto. Use os filtros de data e funcionário no topo da página para encontrar os registros que você precisa.',
          imageUrl: 'https://picsum.photos/800/400?random=67'
        },
        {
          title: '2. Adicionando um Registro Manualmente',
          content: 'Clique em "Adicionar Registro". Selecione o funcionário e preencha os horários de entrada, saída e pausas. Este recurso é útil para corrigir esquecimentos ou ajustar registros de dias anteriores.',
          imageUrl: 'https://picsum.photos/800/400?random=68'
        },
        {
          title: '3. Editando um Registro Existente',
          content: 'Encontre o registro que deseja corrigir na lista e clique em "Editar". Na tela de edição, você pode ajustar qualquer um dos horários ou adicionar observações. Lembre-se de salvar as alterações.',
          imageUrl: 'https://picsum.photos/800/400?random=69'
        }
      ]
    },
    {
      id: 'gestao-de-reservas',
      title: 'Gestão de Reservas',
      description: 'Configure e gerencie suas reservas, desde a criação manual até a página de reserva online para clientes.',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      steps: [
        {
          title: '1. Configure o Sistema de Reservas',
          content: 'Vá para Configurações e encontre o painel de "Configurações de Reserva". Ative o sistema, defina seus horários de funcionamento, duração da reserva e capacidade.',
          imageUrl: 'https://picsum.photos/800/400?random=61'
        },
        {
          title: '2. Divulgue seu Link Público',
          content: 'Ainda nas configurações, copie o "Link Público para Reservas". Compartilhe este link em suas redes sociais ou site para que os clientes possam fazer reservas online.',
          imageUrl: 'https://picsum.photos/800/400?random=62'
        },
        {
          title: '3. Gerencie as Reservas do Dia',
          content: 'Acesse a tela "Reservas". As reservas online aparecerão como "Pendentes". Você pode confirmá-las, cancelá-las ou marcá-las como concluídas. Você também pode adicionar reservas manuais para clientes que ligam.',
          imageUrl: 'https://picsum.photos/800/400?random=63'
        }
      ]
    },
    {
      id: 'cargos-e-permissoes',
      title: 'Cargos e Permissões',
      description: 'Crie cargos, defina o que cada um pode acessar e garanta a segurança e o controle do seu sistema.',
      icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
      steps: [
        {
          title: '1. Crie um Novo Cargo',
          content: 'Vá para Configurações e encontre o painel "Cargos e Permissões". Adicione um novo cargo, como "Caixa" ou "Garçom Chefe".',
          imageUrl: 'https://picsum.photos/800/400?random=64'
        },
        {
          title: '2. Edite as Permissões',
          content: 'Clique no ícone de cadeado ao lado de um cargo. Uma tela se abrirá com todas as funcionalidades do sistema. Marque as caixas para dar acesso às telas que este cargo precisa para trabalhar.',
          imageUrl: 'https://picsum.photos/800/400?random=65'
        },
        {
          title: '3. Atribua o Cargo a um Funcionário',
          content: 'Vá para o menu `RH > Funcionários`. Edite um funcionário e, no campo "Cargo", atribua a nova função que você criou. Ao fazer login, este funcionário verá no menu apenas as telas que você permitiu.',
          imageUrl: 'https://picsum.photos/800/400?random=66'
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