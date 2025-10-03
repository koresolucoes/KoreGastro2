
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Tutorial, TutorialService } from '../../services/tutorial.service';

@Component({
  selector: 'app-tutorials-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tutorials-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialsListComponent {
  private tutorialService = inject(TutorialService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  private router: Router = inject(Router);

  tutorials = signal<Tutorial[]>([]);

  constructor() {
    this.tutorials.set(this.tutorialService.getTutorials());
  }

  navigateToTutorial(tutorialId: string) {
    this.router.navigate(['/tutorials', tutorialId]);
  }
}