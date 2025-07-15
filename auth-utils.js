// Shared authentication utilities
class AuthManager {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.supabase;

    try {
      // Get config from your API
      const config = await this.fetchConfig();
      
      // Initialize Supabase
      this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      this.initialized = true;
      
      return this.supabase;
    } catch (error) {
      console.error('Auth initialization failed:', error);
      throw error;
    }
  }

  async fetchConfig() {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Config API returned ${response.status}`);
    }
    return await response.json();
  }

  async getCurrentUser() {
    if (!this.supabase) await this.init();
    
    const { data: { session }, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    
    return session?.user || null;
  }

  async requireAuth() {
    const user = await this.getCurrentUser();
    if (!user) {
      // Redirect to auth page
      window.location.href = '/auth.html';
      return null;
    }
    return user;
  }

  async signOut() {
    if (!this.supabase) await this.init();
    
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    
    // Redirect to auth page
    window.location.href = '/auth.html';
  }
}

// Global auth manager instance
window.authManager = new AuthManager();
