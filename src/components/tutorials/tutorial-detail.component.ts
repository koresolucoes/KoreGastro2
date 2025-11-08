

import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Tutorial, TutorialService } from '../../services/tutorial.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

@Component({
  selector: 'app-tutorial-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tutorial-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialDetailComponent {
  // FIX: Explicitly type the injected ActivatedRoute service.
  private route: ActivatedRoute = inject(ActivatedRoute);
  private tutorialService = inject(TutorialService);

  private tutorialId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))));

  tutorial = computed(() => {
    const id = this.tutorialId();
    // FIX: Changed the check to be more explicit with `typeof` to satisfy the TypeScript compiler,
    // ensuring that the `id` passed to the service is definitely a string.
    if (typeof id === 'string') {
      return this.tutorialService.getTutorialById(id);
    }
    return null;
  });
}
