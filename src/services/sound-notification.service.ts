import { Injectable, signal } from '@angular/core';
import { environment } from '../config/environment';

// Declare Howler globals to inform TypeScript they exist from the CDN script
declare var Howl: any;
declare var Howler: any;

@Injectable({
  providedIn: 'root',
})
export class SoundNotificationService {
  isMuted = signal(true);

  private newOrderSound: any;
  private allergyAlertSound: any;
  private delayedOrderSound: any;
  private confirmationSound: any;

  constructor() {
    const supabaseStorageUrl = `${environment.supabaseUrl}/storage/v1/object/public/koregastro`;

    // Initialize Howl sounds. Howler handles loading and decoding.
    this.newOrderSound = new Howl({
      src: [`${supabaseStorageUrl}/ion.mp3`]
    });
    this.allergyAlertSound = new Howl({
      src: [`${supabaseStorageUrl}/timer.mp3`]
    });
    this.delayedOrderSound = new Howl({
      src: [`${supabaseStorageUrl}/train.mp3`]
    });
    this.confirmationSound = new Howl({
      src: [`${supabaseStorageUrl}/button.mp3`]
    });
    
    // Set the initial mute state in Howler
    Howler.mute(this.isMuted());
  }
  
  toggleMute() {
    this.isMuted.update(muted => !muted);
    // Use Howler's global mute function
    Howler.mute(this.isMuted());

    // Howler attempts to unlock the audio context automatically on the first play
    // that is initiated by a user gesture. This toggle serves as that gesture.
    // We play a very quiet sound to unlock it if it's currently suspended.
    if (!this.isMuted() && Howler.ctx && Howler.ctx.state === 'suspended') {
      console.log("Attempting to unlock audio context with Howler...");
      this.confirmationSound.volume(0.1);
      this.confirmationSound.play();
    }
  }

  private playSound(sound: any) { // Type `any` because `Howl` is a declared global
    // Howler respects its own global mute state, so we don't need to check `isMuted()` here.
    sound.play();
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
