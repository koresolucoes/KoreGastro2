


import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
// FIX: Remove problematic type imports. We will use 'any' as a workaround for an older/buggy library version where these types are not exported correctly.
// import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabase-client'; // Use the shared client
import { DemoService } from './demo.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  private demoService = inject(DemoService);
  // FIX: Use 'any' for User type since it cannot be imported from the user's version of the library.
  currentUser = signal<any | null>(null);

  // This signal will be true once the initial session check is complete.
  // The authGuard will wait for this signal before proceeding.
  authInitialized = signal(false);

  constructor() {
    // Check for an existing session on startup asynchronously.
    this.checkSession();

    // Listen to authentication state changes
    // FIX: Cast supabase.auth to 'any' to bypass typing issues and use 'any' for event/session types.
    (supabase.auth as any).onAuthStateChange((_event: any, session: any | null) => {
        // This listener handles all authentication state changes. When a user is redirected
        // from a password recovery link, the Supabase JS client fires a SIGNED_IN event and
        // creates a temporary session from the URL fragment. This updates the currentUser
        // signal, allowing the user to update their password while in this temporary state.
        this.currentUser.set(session?.user ?? null);
        
        // This is important for flows like password reset where the session
        // is established via URL fragment after the initial `getSession` check.
        if (!this.authInitialized()) {
            this.authInitialized.set(true);
        }
    });
  }

  private async checkSession() {
    // In Supabase v2, getSession is async and returns the session in a data object
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { data: { session } } = await (supabase.auth as any).getSession();
    this.currentUser.set(session?.user ?? null);
    this.authInitialized.set(true); // Signal that the initial check is done
  }

  /**
   * Signs in the user using email and password.
   * @param email The user's email address.
   * @param password The user's password.
   */
  async signInWithPassword(email: string, password: string): Promise<{ error: any }> {
    // Supabase v2 method
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { error } = await (supabase.auth as any).signInWithPassword({ email, password });
    return { error };
  }

  /**
   * Sends a password reset email to the given email address.
   * Supabase handles the link generation and token.
   * @param email The user's email address.
   */
  async sendPasswordResetEmail(email: string): Promise<{ error: any }> {
    // Supabase v2 method
    // FIX: Cast supabase.auth to 'any' to bypass typing issues. The method name is correct for v2.
    const { error } = await (supabase.auth as any).resetPasswordForEmail(email, {
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
    // Supabase v2 method
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { error } = await (supabase.auth as any).updateUser({ password });
    return { error };
  }


  /**
   * Signs out the current user.
   */
  async signOut(): Promise<{ error: any }> {
    this.demoService.disableDemoMode();
    // The `signOut` method call is correct for v2.
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { error } = await (supabase.auth as any).signOut();
    return { error };
  }
}