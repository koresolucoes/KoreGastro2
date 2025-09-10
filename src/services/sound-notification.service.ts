import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SoundNotificationService {
  isMuted = signal(true); // Start muted by default to encourage user interaction
  private audioContextUnlocked = signal(false);

  // Sound files from a reliable CDN
  private newOrderSound = new Audio('https://cdn.pixabay.com/audio/2022/11/17/audio_85d138a165.mp3');
  private allergyAlertSound = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_c396c7365f.mp3');
  private delayedOrderSound = new Audio('https://cdn.pixabay.com/audio/2022/10/28/audio_3341a4a194.mp3');
  private confirmationSound = new Audio('https://cdn.pixabay.com/audio/2021/08/04/audio_12b0c744c8.mp3');

  constructor() {
    this.newOrderSound.load();
    this.allergyAlertSound.load();
    this.delayedOrderSound.load();
    this.confirmationSound.load();
  }
  
  toggleMute() {
    const wasMuted = this.isMuted();
    this.isMuted.update(muted => !muted);

    // If it was muted and now it is not, we need to unlock the audio context.
    // This requires a user interaction, which this toggle click provides.
    if (wasMuted && !this.isMuted() && !this.audioContextUnlocked()) {
      // Play a short, quiet confirmation sound. The browser will remember that the user
      // has initiated audio playback, allowing subsequent sounds to play automatically.
      this.confirmationSound.volume = 0.5;
      this.confirmationSound.play().then(() => {
        console.log("Audio context unlocked successfully.");
        this.audioContextUnlocked.set(true);
      }).catch(error => {
        console.error("Could not unlock audio context. Sounds may still be blocked.", error);
        // Even if this one sound fails, the user interaction occurred.
        // We'll set the flag to true to allow future attempts.
        this.audioContextUnlocked.set(true);
      });
    }
  }

  private playSound(audio: HTMLAudioElement) {
    if (!this.isMuted()) {
      // Ensure audio context is unlocked if the first interaction wasn't the mute button.
      if (!this.audioContextUnlocked()) {
        this.audioContextUnlocked.set(true);
        console.warn("Audio context was not explicitly unlocked. Attempting to play directly.");
      }
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