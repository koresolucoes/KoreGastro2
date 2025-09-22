
import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase-client'; // Use the shared client

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  // Use a signal to hold the current user state
  currentUser = signal<Session['user'] | null>(null);

  // This signal will be true once the initial session check is complete.
  // The authGuard will wait for this signal before proceeding.
  authInitialized = signal(false);

  constructor() {
    // Check for an existing session on startup asynchronously.
    this.checkSession();

    // Listen to authentication state changes
    supabase.auth.onAuthStateChange((event, session) => {
        // The Supabase client automatically handles the session from the URL fragment
        // when a password recovery link is used. Navigating here would prematurely
        // clear the URL fragment, invalidating the session before the user can
        // update their password. The routing is already handled by the redirectTo URL.
        this.currentUser.set(session?.user ?? null);
    });
  }

  private async checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    this.currentUser.set(session?.user ?? null);
    this.authInitialized.set(true); // Signal that the initial check is done
  }

  /**
   * Signs in the user using email and password.
   * @param email The user's email address.
   * @param password The user's password.
   */
  async signInWithPassword(email: string, password: string): Promise<{ error: any }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  /**
   * Sends a password reset email to the given email address.
   * Supabase handles the link generation and token.
   * @param email The user's email address.
   */
  async sendPasswordResetEmail(email: string): Promise<{ error: any }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  }


  /**
   * Signs out the current user.
   */
  async signOut(): Promise<{ error: any }> {
    const { error } = await supabase.auth.signOut();
    return { error };
  }
}
