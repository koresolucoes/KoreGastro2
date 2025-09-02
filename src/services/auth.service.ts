import { Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase-client'; // Use the shared client

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // Use a signal to hold the current user state
  currentUser = signal<User | null>(null);
  // This signal will be true once the initial session check is complete.
  // The authGuard will wait for this signal before proceeding.
  authInitialized = signal(false);

  constructor() {
    // Immediately check for an existing session on startup
    supabase.auth.getSession().then(({ data: { session } }) => {
        this.currentUser.set(session?.user ?? null);
        this.authInitialized.set(true); // Signal that the initial check is done
    });

    // Listen to authentication state changes
    supabase.auth.onAuthStateChange((event, session) => {
        this.currentUser.set(session?.user ?? null);
    });
  }

  /**
   * Signs in the user using email and password.
   * @param email The user's email address.
   * @param password The user's password.
   */
  async signInWithPassword(email: string, password: string): Promise<{ error: any }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
