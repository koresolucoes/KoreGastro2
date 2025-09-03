import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationModalComponent {
  notificationService = inject(NotificationService);
  state = this.notificationService.notificationState;
}
