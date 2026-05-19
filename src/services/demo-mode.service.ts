import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GuidedTourService, TourStep } from './guided-tour.service';

@Injectable({
  providedIn: 'root'
})
export class DemoModeService {
  private tour = inject(GuidedTourService);
  private router = inject(Router);

  startSalesDemoTour() {
    // Navigates to Launchpad first if needed, or straight to POS.
    // Assuming they are logged in.
    this.router.navigate(['/pos']).then(() => {
        setTimeout(() => {
            const steps: TourStep[] = [
                {
                    targetSelector: '.demo-start-sales-btn', 
                    title: 'Bem-vindo ao PDV!',
                    content: 'Vamos simular o atendimento. Clique em uma mesa livre no mapa para iniciar uma comanda!',
                    actionRequired: 'click',
                    position: 'bottom'
                },
                {
                   targetSelector: '.demo-spotlight-input',
                   title: 'Spotlight e Cardápio',
                   content: 'O painel lateral abriu. Aqui você encontra os produtos. Você pode usar a busca rápida ou navegar pelas categorias.',
                   actionRequired: 'none',
                   position: 'left'
                },
                {
                   targetSelector: '.demo-product-card:first-of-type', 
                   title: 'Selecionando um Produto',
                   content: 'Clique neste produto para adicioná-lo à comanda.',
                   actionRequired: 'click',
                   position: 'left'
                },
                {
                   targetSelector: '.demo-quick-add-btn',
                   title: 'Confirmando o Item',
                   content: 'Aqui você pode adicionar observações ou mudar a quantidade. Clique em "Adicionar Item" para colocar no carrinho.',
                   actionRequired: 'click',
                   position: 'bottom'
                },
                {
                   targetSelector: '.demo-send-btn',
                   title: 'Enviando para a Cozinha (KDS)',
                   content: 'Agora, clique em "Enviar" no rodapé. Isso mandará os itens diretamente para a tela da Cozinha (KDS).',
                   actionRequired: 'click',
                   position: 'top',
                   onNext: () => {
                       // Automatically navigate to KDS after they click send
                       setTimeout(() => {
                           this.router.navigate(['/kds']).then(() => {
                               // Start second part of tour
                               setTimeout(() => {
                                   this.tour.startTour([
                                       {
                                           targetSelector: '.demo-kds-ticket:first-of-type',
                                           title: 'Tela da Cozinha',
                                           content: 'Aqui está o pedido que você acabou de enviar! A cozinha vê isso em tempo real.',
                                           actionRequired: 'none',
                                           position: 'right'
                                       },
                                       {
                                           targetSelector: '.demo-kds-ticket:first-of-type .demo-kds-start-btn',
                                           title: 'Iniciando o Preparo',
                                           content: 'Simule o trabalho da cozinha clicando em "INICIAR TUDO"!',
                                           actionRequired: 'click',
                                           position: 'bottom'
                                       },
                                       {
                                           targetSelector: 'body',
                                           title: 'Pronto!',
                                           content: 'É assim que a operação híbrida do ChefOS funciona. Agora explore o sistema completo, modifique cardápios, gerencie equipes ou veja o KDS configurado para multiplas estações.',
                                           actionRequired: 'click',
                                           position: 'center'
                                       }
                                   ])
                               }, 1000);
                           });
                       }, 800);
                   }
                }
            ];
            
            this.tour.startTour(steps);
        }, 1000); // give time for POS to load
    });
  }
}
