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
  private route = inject(ActivatedRoute);
  private tutorialService = inject(TutorialService);

  private tutorialId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))));

  tutorial = computed(() => {
    const id = this.tutorialId();
    if (!id) return null;
    return this.tutorialService.getTutorialById(id);
  });
}