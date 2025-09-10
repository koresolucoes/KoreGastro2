import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SoundNotificationService {
  isMuted = signal(false);

  private newOrderSound = new Audio('https://cdn.pixabay.com/audio/2022/11/17/audio_85d138a165.mp3');
  private allergyAlertSound = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_c396c7365f.mp3');
  private delayedOrderSound = new Audio('https://cdn.pixabay.com/audio/2022/10/28/audio_3341a4a194.mp3');

  constructor() {
    this.newOrderSound.load();
    this.allergyAlertSound.load();
    this.delayedOrderSound.load();
  }
  
  toggleMute() {
    this.isMuted.update(muted => !muted);
  }

  private playSound(audio: HTMLAudioElement) {
    if (!this.isMuted()) {
      audio.currentTime = 0;
      audio.play().catch(error => console.error("Error playing sound:", error));
    }
  }

  playNewOrderSound() {
    this.playSound(this.newOrderSound);
  }

  playAllergyAlertSound() {
    this.playSound(this.allergyAlertSound);
  }

  playDelayedOrderSound() {
    this.playSound(this.delayedOrderSound);
  }
}
