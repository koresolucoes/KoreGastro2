


import { Injectable, signal, inject } from '@angular/core';
import { Router } from "@angular/router";
import { AuthUser, AuthSession } from "@supabase/supabase-js";
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
  currentUser = signal<AuthUser | null>(null);

  // This signal will be true once the initial session check is complete.
  // The authGuard will wait for this signal before proceeding.
  authInitialized = signal(false);

  constructor() {
    // Check for an existing session on startup asynchronously.
    this.checkSession();

    // Listen to authentication state changes
    // FIX: Cast supabase.auth to 'any' to bypass typing issues and use 'any' for event/session types.
    supabase.auth.onAuthStateChange((_event: string, session: AuthSession | null) => {
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
    const { data: { session } } = await supabase.auth.getSession();
    this.currentUser.set(session?.user ?? null);
    this.authInitialized.set(true); // Signal that the initial check is done
  }

  private loginTimestamps: number[] = [];

  /**
   * Signs in the user using email and password.
   * @param email The user's email address.
   * @param password The user's password.
   */
  async signInWithPassword(email: string, password: string): Promise<{ error: any }> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.loginTimestamps = this.loginTimestamps.filter(t => t > oneMinuteAgo);
    
    if (this.loginTimestamps.length >= 10) {
      return { error: new Error('Muitas tentativas de login. Por favor aguarde 1 minuto antes de tentar novamente.') };
    }
    this.loginTimestamps.push(now);

    // Supabase v2 method
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  private resetPasswordTimestamps: number[] = [];

  /**
   * Sends a password reset email to the given email address.
   * Supabase handles the link generation and token.
   * @param email The user's email address.
   */
  async sendPasswordResetEmail(email: string): Promise<{ error: any }> {
    // Basic Client-Side Rate Limiting
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.resetPasswordTimestamps = this.resetPasswordTimestamps.filter(t => t > oneMinuteAgo);
    
    if (this.resetPasswordTimestamps.length >= 3) {
      return { error: new Error('Muitas requisições. Por favor aguarde 1 minuto antes de tentar novamente.') };
    }
    
    this.resetPasswordTimestamps.push(now);

    // Supabase v2 method
    // FIX: Cast supabase.auth to 'any' to bypass typing issues. The method name is correct for v2.
    const origin = window.location.origin;
    const allowedOrigins = ['http://localhost:3000', 'https://ais-dev', 'https://ais-pre'];
    const isAllowed = allowedOrigins.some(allowed => origin.includes(allowed) || origin === allowed);
    const safeRedirect = isAllowed ? `${origin}/#/reset-password` : 'https://google.com'; // fallback if hijacked

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: safeRedirect,
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
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  }


  /**
   * Signs out the current user.
   */
  async signOut(): Promise<{ error: any }> {
    this.demoService.disableDemoMode();
    sessionStorage.removeItem('active_employee');
    // The `signOut` method call is correct for v2.
    // FIX: Cast supabase.auth to 'any' to bypass typing issues.
    const { error } = await supabase.auth.signOut();
    return { error };
  }
}