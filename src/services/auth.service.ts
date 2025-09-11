
import { Injectable, signal } from '@angular/core';
// FIX: The `User` type is not always exported directly. Using `Session['user']` is a more robust way to get the user type.
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase-client'; // Use the shared client

@Injectable({
  providedIn: 'root',
})
export class AuthService {
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
   * Signs out the current user.
   */
  async signOut(): Promise<{ error: any }> {
    const { error } = await supabase.auth.signOut();
    return { error };
  }
}
