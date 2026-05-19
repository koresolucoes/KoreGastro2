import { Injectable, signal, ApplicationRef, EnvironmentInjector, createComponent, ComponentRef } from '@angular/core';
import { GuidedTourOverlayComponent } from '../components/shared/guided-tour-overlay/guided-tour-overlay.component';

export interface TourStep {
  targetSelector: string; // CSS selector of the element to click/focus
  highlightSelector?: string; // Optional: CSS selector for the visual cutout hole
  title: string;
  content: string;
  actionRequired?: 'click' | 'input' | 'none'; // 'click' means user must click the targetSelector to continue
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  onNext?: () => void; // Optional callback to execute when moving to next step
}

@Injectable({
  providedIn: 'root'
})
export class GuidedTourService {
  private currentSteps: TourStep[] = [];
  private currentStepIndex = signal(-1);
  private overlayRef: ComponentRef<GuidedTourOverlayComponent> | null = null;

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  startTour(steps: TourStep[]) {
    this.currentSteps = steps;
    this.currentStepIndex.set(0);
    this.showOverlay();
  }

  nextStep() {
    const currentSetup = this.currentSteps[this.currentStepIndex()];
    if (currentSetup?.onNext) {
      currentSetup.onNext();
    }
    
    if (this.currentStepIndex() < this.currentSteps.length - 1) {
      this.currentStepIndex.update(i => i + 1);
      // Ensure the DOM has time to update before finding the next element
      setTimeout(() => this.updateOverlay(), 100); 
    } else {
      this.endTour();
    }
  }

  endTour() {
    this.currentSteps = [];
    this.currentStepIndex.set(-1);
    this.hideOverlay();
  }

  private showOverlay() {
    if (!this.overlayRef) {
      this.overlayRef = createComponent(GuidedTourOverlayComponent, {
        environmentInjector: this.injector
      });
      document.body.appendChild(this.overlayRef.location.nativeElement);
      this.appRef.attachView(this.overlayRef.hostView);
    }
    this.updateOverlay();
  }

  private updateOverlay(retryCount = 0) {
    if (this.overlayRef && this.currentStepIndex() >= 0) {
      const step = this.currentSteps[this.currentStepIndex()];
      const elements = document.querySelectorAll(step.targetSelector);
      let element = Array.from(elements).find(e => {
          const htmlEl = e as HTMLElement;
          // Check if element is actually taking up space on screen
          const rect = htmlEl.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
      }) as HTMLElement;
      
      let highlightElement = element;
      if (step.highlightSelector) {
          const hElements = document.querySelectorAll(step.highlightSelector);
          const foundHElement = Array.from(hElements).find(e => {
              const htmlEl = e as HTMLElement;
              const rect = htmlEl.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
          }) as HTMLElement;
          if (foundHElement) {
              highlightElement = foundHElement;
          }
      }
      
      if (!element && retryCount < 20) { // Retry up to 4 seconds (20 * 200ms)
        setTimeout(() => this.updateOverlay(retryCount + 1), 200);
        return;
      }
      
      this.overlayRef.setInput('step', step);
      this.overlayRef.setInput('targetElement', element);
      this.overlayRef.setInput('highlightElement', highlightElement);
      this.overlayRef.instance.onNext = () => this.nextStep();
      this.overlayRef.instance.onSkip = () => this.endTour();
    }
  }
  
  private hideOverlay() {
    if (this.overlayRef) {
      this.appRef.detachView(this.overlayRef.hostView);
      this.overlayRef.destroy();
      this.overlayRef = null;
    }
  }
}
