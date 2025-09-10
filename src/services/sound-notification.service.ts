import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SoundNotificationService {
  isMuted = signal(true); // Start muted by default to encourage user interaction
  private audioContextUnlocked = signal(false);

  // Sound files from a highly reliable CDN (jsDelivr serving from the howler.js GitHub repo)
  private newOrderSound = new Audio('https://cdn.jsdelivr.net/gh/goldfire/howler.js/examples/sound/ion.mp3');
  private allergyAlertSound = new Audio('https://cdn.jsdelivr.net/gh/goldfire/howler.js/examples/sound/timer.mp3');
  private delayedOrderSound = new Audio('https://cdn.jsdelivr.net/gh/goldfire/howler.js/examples/sound/train.mp3');
  private confirmationSound = new Audio('https://cdn.jsdelivr.net/gh/goldfire/howler.js/examples/sound/button.mp3');

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
