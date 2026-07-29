// Paste this script into your browser's Developer Tools Console (F12 -> Console)
// while you are logged in to SahamLens (so the cookie is present)

(async () => {
  try {
    // 1. Get watchlist from localStorage
    const saved = localStorage.getItem('saham_watchlist');
    if (!saved) {
      console.log('No watchlist found in localStorage.');
      return;
    }

    const localWatchlist = JSON.parse(saved);
    console.log(`Found ${localWatchlist.length} items in localStorage watchlist.`);

    // 2. Get telegram_id from the user cookie
    let telegram_id = null;
    const match = document.cookie.match(new RegExp('(^| )saham_user=([^;]+)'));
    if (match) {
      try {
        const userCookie = JSON.parse(decodeURIComponent(match[2]));
        telegram_id = Number(userCookie.id);
      } catch (e) {
        console.error('Failed to parse user cookie');
      }
    }

    if (!telegram_id) {
      console.error('Could not find telegram_id in cookies. Please login via Telegram first.');
      return;
    }

    // 3. Prepare data for migration
    const watchlistData = localWatchlist.map(item => ({
      symbol: item.symbol,
      buy_price: item.buyPrice || item.buy_price || 0,
      current_price: 0,
      pnl_percent: 0,
      alert_price: 0
    }));

    // 4. Send to migration API
    console.log('Sending data to migration API...', watchlistData);
    const response = await fetch('/api/watchlist/migrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telegram_id,
        watchlist: watchlistData
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('Migration successful!', result);
      console.log('You can now clear the localStorage if you want: localStorage.removeItem("saham_watchlist")');
    } else {
      console.error('Migration failed:', result);
    }
  } catch (err) {
    console.error('Error during migration script execution:', err);
  }
})();
