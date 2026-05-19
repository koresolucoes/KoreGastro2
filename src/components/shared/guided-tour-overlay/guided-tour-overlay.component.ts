import { Component, ChangeDetectionStrategy, input, effect, InputSignal, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TourStep } from '../../../services/guided-tour.service';

@Component({
  selector: 'app-guided-tour-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-[9999] pointer-events-none transition-opacity duration-300">
      
      @if (targetRect()) {
        <!-- Top Block -->
        <div class="absolute top-0 left-0 right-0 bg-black/70 pointer-events-auto transition-all duration-300"
             [style.height.px]="targetRect()!.top"
             (click)="$event.stopPropagation(); $event.preventDefault();"></div>
             
        <!-- Bottom Block -->
        <div class="absolute bottom-0 left-0 right-0 bg-black/70 pointer-events-auto transition-all duration-300"
             [style.top.px]="targetRect()!.top + targetRect()!.height"
             (click)="$event.stopPropagation(); $event.preventDefault();"></div>
             
        <!-- Left Block -->
        <div class="absolute bg-black/70 pointer-events-auto transition-all duration-300"
             [style.top.px]="targetRect()!.top"
             [style.left.px]="0"
             [style.width.px]="targetRect()!.left"
             [style.height.px]="targetRect()!.height"
             (click)="$event.stopPropagation(); $event.preventDefault();"></div>
             
        <!-- Right Block -->
        <div class="absolute bg-black/70 pointer-events-auto transition-all duration-300"
             [style.top.px]="targetRect()!.top"
             [style.left.px]="targetRect()!.left + targetRect()!.width"
             [style.right.px]="0"
             [style.height.px]="targetRect()!.height"
             (click)="$event.stopPropagation(); $event.preventDefault();"></div>
             
        <!-- Highlight Ring & Catch Area -->
        <div class="absolute border-2 border-brand/50 bg-brand/5 rounded-2xl pointer-events-auto transition-all duration-300 z-10 cursor-pointer"
             [style.left.px]="targetRect()!.left"
             [style.top.px]="targetRect()!.top"
             [style.width.px]="targetRect()!.width"
             [style.height.px]="targetRect()!.height"
             (click)="onTargetClick($event)"></div>
      } @else {
         <div class="absolute inset-0 bg-black/70 pointer-events-auto transition-all duration-300"></div>
      }

      <!-- Tooltip -->
      @if (step()) {
        <div class="absolute bg-surface-elevated rounded-xl shadow-2xl border border-brand p-5 pointer-events-auto z-[10000] w-80 transition-all duration-300"
             [style.left.px]="tooltipPos().left"
             [style.top.px]="tooltipPos().top">
          
          <h3 class="text-title font-bold text-lg mb-2 flex items-center gap-2">
            <span translate="no" class="notranslate material-symbols-outlined text-brand">info</span>
            {{ step()!.title }}
          </h3>
          <p class="text-muted text-sm mb-4 leading-relaxed">{{ step()!.content }}</p>
          
          <div class="flex justify-between items-center">
            <button (click)="onSkip()" class="text-muted hover:text-title text-xs font-medium focus:outline-none">
              Pular tour
            </button>
            @if (step()!.actionRequired !== 'click') {
              <button (click)="onNext()" class="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors">
                Próximo
              </button>
            } @else {
              <span class="text-brand text-xs font-bold animate-pulse text-right">
                Clique na área<br/>destacada para seguir
              </span>
            }
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidedTourOverlayComponent {
  step: InputSignal<TourStep | null> = input<TourStep | null>(null);
  targetElement: InputSignal<HTMLElement | null> = input<HTMLElement | null>(null);
  
  onNext: () => void = () => {};
  onSkip: () => void = () => {};

  targetRect = () => {
    const el = this.targetElement();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Add some padding around the element
    return {
      left: rect.left - 8,
      top: rect.top - 8,
      width: rect.width + 16,
      height: rect.height + 16
    };
  };

  tooltipPos = () => {
    const rect = this.targetRect();
    const position = this.step()?.position || 'bottom';
    
    if (!rect) {
      // Center of screen if no target
      return { left: window.innerWidth / 2 - 160, top: window.innerHeight / 2 - 100 };
    }

    const tooltipWidth = 320; // w-80 = 20rem = 320px
    const tooltipHeight = 220; // safe approximation for max tooltip height

    let left = window.innerWidth / 2 - tooltipWidth / 2;
    let top = window.innerHeight / 2 - tooltipHeight / 2;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - (rect.left + rect.width);

    // Initial placement based on requested position
    if (position === 'top' && spaceAbove > tooltipHeight) {
        top = rect.top - tooltipHeight - 16;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (position === 'bottom' && spaceBelow > tooltipHeight) {
        top = rect.top + rect.height + 16;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (position === 'left' && spaceLeft > tooltipWidth) {
        left = rect.left - tooltipWidth - 16;
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
    } else if (position === 'right' && spaceRight > tooltipWidth) {
        left = rect.left + rect.width + 16;
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
    } else if (position === 'center') {
        left = window.innerWidth / 2 - tooltipWidth / 2;
        top = window.innerHeight / 2 - tooltipHeight / 2;
    } else {
        // Fallback: finding the largest space
        const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);
        if (maxSpace === spaceAbove) {
            top = rect.top - tooltipHeight - 16;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
        } else if (maxSpace === spaceBelow) {
            top = rect.top + rect.height + 16;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
        } else if (maxSpace === spaceLeft) {
            left = rect.left - tooltipWidth - 16;
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
        } else {
            left = rect.left + rect.width + 16;
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
        }
    }

    // Boundary checks to ensure tooltip stays on screen
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
    
    // Safety check: if after boundary corrections the tooltip STILL overlaps the hole,
    // force it to move out of the way aggressively.
    const isOverlapping = (
        left < rect.left + rect.width &&
        left + tooltipWidth > rect.left &&
        top < rect.top + rect.height &&
        top + tooltipHeight > rect.top
    );

    if (isOverlapping) {
        if (spaceAbove > spaceBelow) {
             top = rect.top - tooltipHeight - 16;
        } else {
             top = rect.top + rect.height + 16;
        }
        // apply boundaries again but maybe overlapping x now
        top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
    }

    return { left, top };
  };

  constructor(private cdr: ChangeDetectorRef) {}

  @HostListener('window:resize')
  onResize() {
    this.cdr.markForCheck();
  }
  
  onTargetClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    
    const s = this.step();
    const el = this.targetElement();
    
    if (s?.actionRequired === 'click' && el) {
        // Dispatch click to the underlying element
        el.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY
        }));
        
        // Progress tour
        setTimeout(() => this.onNext(), 150);
    }
  }
}
