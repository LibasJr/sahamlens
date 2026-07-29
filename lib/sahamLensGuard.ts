import path from 'path';

const isVercel = !!process.env.VERCEL;

export function guard() {
  // Cek 1: data folder ada gak? (Skip di Vercel karena filesystem read-only)
  if (!isVercel) {
    try {
      const fs = require('fs');
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        
        const defaultPortfolios = [
          {
            id: 'main',
            telegram_id: 660211525,
            name: 'Main Portfolio',
            cash: 100000000,
            initial_cash: 100000000
          }
        ];
        fs.writeFileSync(path.join(dataDir, 'portfolios.json'), JSON.stringify(defaultPortfolios, null, 2));
        console.log('[Guard] Created default data/portfolios.json');
      }
    } catch (err) {
      console.warn('[Guard] Could not create data folder:', err);
    }
  } else {
    console.log('[Guard] Vercel mode: skipping filesystem init (read-only)');
  }

  // Cek 2: GEMINI_API_KEY ada gak?
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ SahamLens Guard: GEMINI_API_KEY tidak ditemukan. Fitur AI mungkin akan menggunakan fallback atau terbatas.");
  }

  // Cek 3 & 4 (implemented via proxy/wrappers where applicable in the app)
  // For check 4, we enforce the admin limit inside dailyLimit check.
}
