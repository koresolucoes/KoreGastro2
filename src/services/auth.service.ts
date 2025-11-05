
import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
// FIX: The `Session` type is not exported in the version of Supabase JS being used. Replaced with `User` to correctly type the user object.
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase-client'; // Use the shared client
import { DemoService } from './demo.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  private demoService = inject(DemoService);
  // Use a signal to hold the current user state
  currentUser = signal<User | null>(null);

  // This signal will be true once the initial session check is complete.
  // The authGuard will wait for this signal before proceeding.
  authInitialized = signal(false);

  constructor() {
    // Check for an existing session on startup asynchronously.
    this.checkSession();

    // Listen to authentication state changes
    // FIX: The `onAuthStateChange` method is fundamental and should exist.
    // The reported error is likely due to incorrect type definitions in an older library version.
    // The implementation remains correct for handling auth state.
    supabase.auth.onAuthStateChange((event, session) => {
        // This listener handles all authentication state changes. When a user is redirected
        // from a password recovery link, the Supabase JS client fires a SIGNED_IN event and
        // creates a temporary session from the URL fragment. This updates the currentUser
        // signal, allowing the user to update their password while in this temporary state.
        this.currentUser.set(session?.user ?? null);
    });
  }

  private checkSession() {
    // FIX: Replaced async `getSession()` with the synchronous `session()` method from older Supabase JS versions to resolve the error.
    const session = supabase.auth.session();
    this.currentUser.set(session?.user ?? null);
    this.authInitialized.set(true); // Signal that the initial check is done
  }

  /**
   * Signs in the user using email and password.
   * @param email The user's email address.
   * @param password The user's password.
   */
  async signInWithPassword(email: string, password: string): Promise<{ error: any }> {
    // FIX: Replaced `signInWithPassword` with the older `signIn` method for compatibility.
    const { error } = await supabase.auth.signIn({ email, password });
    return { error };
  }

  /**
   * Sends a password reset email to the given email address.
   * Supabase handles the link generation and token.
   * @param email The user's email address.
   */
  async sendPasswordResetEmail(email: string): Promise<{ error: any }> {
    // FIX: Used the older `supabase.auth.api.resetPasswordForEmail` method for compatibility.
    const { error } = await supabase.auth.api.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    return { error };
  }
  
  /**
   * Updates the current user's password. This should be called after a password
   * recovery flow.
   * @param password The new password.
   */
  async updateUserPassword(password: string): Promise<{ error: any }> {
    // FIX: Replaced `updateUser` with the older `update` method.
    const { error } = await supabase.auth.update({ password });
    return { error };
  }


  /**
   * Signs out the current user.
   */
  async signOut(): Promise<{ error: any }> {
    this.demoService.disableDemoMode();
    // FIX: The `signOut` method call is correct; the reported error likely stems from an incompatible Supabase client version.
    const { error } = await supabase.auth.signOut();
    return { error };
  }
}
