import { supabaseAdmin } from './supabase';
export async function checkAnalisaLimit(telegram_id?: number, isAdmin: boolean = false) {
  if (isAdmin || Number(telegram_id) === 660211525) {
    return { allowed: true, remaining: 999 };
  }

  if (!telegram_id) return { allowed: false, error: 'telegram_id is required' };

  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (error || !user) {
      console.error("User not found or error:", error);
      return { allowed: false, error: 'User not found' };
    }

    if (user.role === 'admin' || user.role === 'pro') {
      return { allowed: true, remaining: 999 };
    }

    const today = new Date().toISOString().split('T')[0];
    let currentSisa = user.sisa_analisa;
    
    // Check if we need to reset
    if (user.last_reset < today) {
      currentSisa = 5;
      await supabaseAdmin
        .from('users')
        .update({ sisa_analisa: currentSisa, last_reset: today })
        .eq('telegram_id', telegram_id);
    }

    if (currentSisa <= 0) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: currentSisa };
  } catch (error) {
    console.error("Error in checkAnalisaLimit:", error);
    return { allowed: false, error: 'Internal server error' };
  }
}

export async function decrementAnalisaLimit(telegram_id: number, symbol: string) {
  if (!telegram_id) return;
  
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('role, sisa_analisa')
      .eq('telegram_id', telegram_id)
      .single();
      
    if (!user) return;
    
    // Log the usage
    await supabaseAdmin.from('usage_logs').insert({
      telegram_id,
      symbol,
      action: 'analisa'
    });

    if (user.role === 'admin' || user.role === 'pro') {
      return; // No need to decrement
    }

    await supabaseAdmin
      .from('users')
      .update({ sisa_analisa: Math.max(0, user.sisa_analisa - 1) })
      .eq('telegram_id', telegram_id);
      
  } catch (error) {
    console.error("Error in decrementAnalisaLimit:", error);
  }
}

export const FREE_LIMITS = {
  WATCHLIST: 3,
  ALERTS: 2,
  analisaPerHari: 5
};

export function checkWatchlistLimit(currentCount: number) {
  // Check if admin on client side (using cookies usually, but let's mock if not available)
  let isAdmin = false;
  if (typeof document !== 'undefined') {
    isAdmin = document.cookie.includes('saham_admin=true') || document.cookie.includes('role=admin') || document.cookie.includes('role=pro');
  }
  
  if (isAdmin) return { allowed: true };
  
  if (currentCount >= FREE_LIMITS.WATCHLIST) {
    return { allowed: false, limit: FREE_LIMITS.WATCHLIST };
  }
  
  return { allowed: true };
}

export async function refreshAdminStatus() {
  return hasProAccess();
}

export function hasProAccess() {
  if (typeof document !== 'undefined') {
    return document.cookie.includes('saham_admin=true') || 
           document.cookie.includes('role=admin') || 
           document.cookie.includes('role=pro');
  }
  return false;
}

export function getUsedSymbolsToday() {
  // Now handled by server-side usage_logs, returning empty array to satisfy frontend types
  return [];
}

export function incrementAnalisa(symbol: string) {
  // Real check is now done Server-Side via /api/stock/[ticker]
  // This just bypasses the old client side check
  return { allowed: true, remaining: 999 };
}

export function grantProFromLink() {
  // Legacy function for client-side pro granting, replaced by admin panel
}


