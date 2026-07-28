import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ToastAndroid, AppState, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Zap, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Layers, Activity, Brain, RefreshCw, Search as SearchIcon, AlertTriangle } from 'lucide-react-native';

const NEXTJS_API_URL = 'http://192.168.1.119:3001';
const CURRENT_VERSION_CODE = 10; // Stock Analyst Rebranding

// TV Colors from Tailwind
const COLORS = {
  bg: '#131722',
  card: '#1E222D',
  border: '#2A2E39',
  borderLight: '#363A45',
  text: '#D1D4DC',
  muted: '#787B86',
  green: '#22AB94',
  red: '#F7525F',
  yellow: '#FF9800',
  accent: '#2962FF',
  hover: '#2A2E39'
};

const POPULAR_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'AMRT', 'ICBP', 'ADRO', 'GOTO'];

export default function App() {
  const [ticker, setTicker] = useState('BBCA');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [techData, setTechData] = useState<any>(null);
  const [fundData, setFundData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [marketClosed, setMarketClosed] = useState(false);
  const [mode, setMode] = useState<'TECH' | 'FUND'>('TECH');

  const appState = useRef(AppState.currentState);

  const isMarketOpen = () => {
    const now = new Date();
    // WIB is UTC+7
    const wibNow = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000);
    const day = wibNow.getDay();
    const hour = wibNow.getHours();

    if (day === 0 || day === 6) return false;
    return hour >= 9 && hour < 15;
  };

  const checkForUpdate = async () => {
    try {
      const res = await fetch(`${NEXTJS_API_URL}/updates/version.json?t=${Date.now()}`);
      const json = await res.json();
      if (json.versionCode > CURRENT_VERSION_CODE) {
        Alert.alert(
          "Update Tersedia!",
          `Versi baru ${json.versionName} tersedia. Apakah Anda ingin mengunduh dan memasangnya sekarang?`,
          [
            { text: "Nanti Saja", style: "cancel" },
            { text: "Update Sekarang", onPress: () => downloadAndInstallUpdate(json.apkFileName) }
          ]
        );
      }
    } catch (e) {
      console.log("Check update error", e);
    }
  };

  const downloadAndInstallUpdate = async (apkName: string) => {
    try {
      ToastAndroid.show("Mengunduh update... Harap tunggu.", ToastAndroid.LONG);
      const downloadUrl = `${NEXTJS_API_URL}/updates/${apkName}`;
      const fileUri = FileSystem.documentDirectory + apkName;

      const downloadRes = await FileSystem.downloadAsync(downloadUrl, fileUri);
      if (downloadRes.status === 200) {
        ToastAndroid.show("Unduhan selesai. Membuka installer...", ToastAndroid.SHORT);
        const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: 'application/vnd.android.package-archive',
        });
      } else {
        Alert.alert("Error", "Gagal mengunduh file APK.");
      }
    } catch (e) {
      Alert.alert("Error", "Terjadi kesalahan saat mengunduh update.");
    }
  };

  const fetchData = async (symbol: string, currentMode: 'TECH' | 'FUND', silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = currentMode === 'TECH' ? `/api/stock/${symbol}` : `/api/fundamental/${symbol}`;
      const res = await fetch(`${NEXTJS_API_URL}${endpoint}`);
      const json = await res.json();
      
      if (json.stock) {
        if (currentMode === 'TECH') {
          setTechData(json);
        } else {
          setFundData(json);
        }
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData(ticker, mode);
  };

  const handleModeSwitch = (newMode: 'TECH' | 'FUND') => {
    setMode(newMode);
    // Jika data untuk tab tersebut belum ada, fetch. Jika sudah ada, jangan tampilkan loading (silent fetch)
    if (newMode === 'TECH' && !techData) fetchData(ticker, 'TECH');
    else if (newMode === 'FUND' && !fundData) fetchData(ticker, 'FUND');
    else fetchData(ticker, newMode, true); // fetch in background
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      Keyboard.dismiss();
      const newTicker = searchInput.trim().toUpperCase();
      setTicker(newTicker);
      setSearchInput('');
      setTechData(null);
      setFundData(null);
    }
  };

  const handleQuickSelect = (sym: string) => {
    Keyboard.dismiss();
    setTicker(sym);
  };

  useEffect(() => {
    checkForUpdate();
    setMarketClosed(!isMarketOpen());
    handleRefresh();

    const interval = setInterval(() => {
      const closed = !isMarketOpen();
      setMarketClosed(closed);
      if (!closed) {
        fetchData(ticker, mode, true);
      }
    }, 60000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkForUpdate();
      }
      appState.current = nextAppState;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [ticker, mode]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  const data = mode === 'TECH' ? techData : fundData;
  const stock = data?.stock || (techData?.stock || fundData?.stock || {});
  const isUp = (stock.change_pct || 0) >= 0;

  // AI Consensus parsing (like in Web)
  let consensus = 'AWAITING DATA';
  let consensusColor = COLORS.yellow;
  let consensusBg = COLORS.yellow + '20'; // 20% opacity approx

  if (data?.consensus) {
    const mainDecision = data.consensus.split(' ')[0].replace('KEPUTUSAN: ', '').toUpperCase();
    if (mainDecision.includes('BULLISH') || mainDecision.includes('UNDERVALUED')) {
      consensus = mainDecision;
      consensusColor = COLORS.green;
      consensusBg = COLORS.green + '20';
    } else if (mainDecision.includes('BEARISH') || mainDecision.includes('OVERVALUED')) {
      consensus = mainDecision;
      consensusColor = COLORS.red;
      consensusBg = COLORS.red + '20';
    } else {
      consensus = mainDecision;
    }
  }

  // Parse agent details like web
  const agents = data?.analyzers || [];
  const hasAgents = agents.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* HEADER (Titel & Disclaimer) */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>SahamLens Super App - Full AI Multi-Agent</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View style={styles.badgeInstitutional}>
                <Text style={styles.badgeInstitutionalText}>INSTITUTIONAL AI</Text>
              </View>
              <Text style={{ color: COLORS.muted, fontSize: 10, marginLeft: 8 }}>Empowered by yfinance & AI Agent</Text>
            </View>
          </View>
        </View>

        {/* SEARCH BAR & QUICK TAGS */}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchInputContainer}>
              <SearchIcon color={COLORS.muted} size={18} style={{ marginHorizontal: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari Emiten (BBCA, dll)"
                placeholderTextColor={COLORS.muted}
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={handleSearch}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              <Text style={styles.searchBtnText}>CARI</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
            {POPULAR_TICKERS.map(sym => (
              <TouchableOpacity key={sym} style={[styles.tag, ticker === sym && styles.tagActive]} onPress={() => handleQuickSelect(sym)}>
                <Text style={[styles.tagText, ticker === sym && styles.tagTextActive]}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* DISCLAIMER BANNER */}
        <View style={styles.disclaimerBanner}>
          <AlertTriangle color={COLORS.yellow} size={16} />
          <Text style={styles.disclaimerText}>
            <Text style={{ fontWeight: 'bold', color: COLORS.yellow }}>Disclaimer:</Text> Bukan saran finansial, untuk edukasi
          </Text>
        </View>

        {/* STATUS BAR */}
        <View style={styles.statusContainer}>
          <View style={styles.statusPill}>
            <View style={[styles.dot, { backgroundColor: marketClosed ? COLORS.red : COLORS.green }]} />
            <Text style={styles.statusText}>{marketClosed ? 'Market Closed' : 'Market Open'}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              Update: {formatTime(lastUpdate)} • {marketClosed ? 'No Polling' : '1m'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={loading}
          >
            <RefreshCw color="white" size={12} />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* MODE TOGGLE */}
        <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: mode === 'TECH' ? COLORS.hover : 'transparent', borderRadius: 8 }}
            onPress={() => handleModeSwitch('TECH')}
          >
            <Text style={{ color: mode === 'TECH' ? COLORS.green : COLORS.muted, fontWeight: 'bold' }}>TECHNICAL</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: mode === 'FUND' ? COLORS.hover : 'transparent', borderRadius: 8 }}
            onPress={() => handleModeSwitch('FUND')}
          >
            <Text style={{ color: mode === 'FUND' ? COLORS.accent : COLORS.muted, fontWeight: 'bold' }}>FUNDAMENTAL</Text>
          </TouchableOpacity>
        </View>

        {/* TOP SUMMARY BANNER */}
        <View style={styles.card}>
          <View style={styles.bannerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.zapIconBox}>
                <Zap color={COLORS.yellow} size={24} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.tickerLarge}>{stock.symbol || ticker}.JK</Text>
                  <Text style={styles.companyName}>{stock.name || 'Loading...'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Text style={styles.priceLarge}>
                    Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                    {isUp ? <ArrowUpRight color={COLORS.green} size={16} /> : <ArrowDownRight color={COLORS.red} size={16} />}
                    <Text style={[styles.changeLarge, { color: isUp ? COLORS.green : COLORS.red }]}>
                      {isUp ? '+' : ''}{stock.change_pct || 0}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* AI CONSENSUS BADGE */}
            <View style={{ alignItems: 'flex-start', marginTop: 16 }}>
              <Text style={styles.consensusLabel}>{mode === 'TECH' ? '10-ALGO TECHNICAL CONSENSUS' : '10-ALGO FUNDAMENTAL CONSENSUS'}</Text>
              <View style={[styles.consensusBox, { borderColor: consensusColor, backgroundColor: consensusBg }]}>
                {(loading && !data) ? <ActivityIndicator color={consensusColor} size="small" /> : <Brain color={consensusColor} size={20} />}
                <Text style={[styles.consensusText, { color: consensusColor }]}>
                  {(loading && !data) ? 'Calculating...' : consensus}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* MASTER STRATEGIST AI ANALYSIS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Brain color={COLORS.accent} size={20} />
            <Text style={styles.cardTitle}>Top Algo Performer</Text>
          </View>
          {(loading && !data) ? (
            <View style={{ padding: 10, gap: 10 }}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: '80%' }]} />
              <View style={[styles.skeletonLine, { width: '90%' }]} />
            </View>
          ) : (
            <Text style={styles.analysisText}>
              {data?.bestPerformer ? `Best Metric: ${data.bestPerformer.label}\nValue: ${data.bestPerformer.value}\nDecision: ${data.bestPerformer.decision} (${data.bestPerformer.confidence}% Conf)` : 'Menunggu kalkulasi...'}
            </Text>
          )}
        </View>

        {/* AI AGENT BREAKDOWN */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Layers color={COLORS.green} size={20} />
            <Text style={styles.cardTitle}>Algo Filters Breakdown</Text>
          </View>
          <View style={{ gap: 8 }}>
            {hasAgents ? agents.map((agent: any, idx: number) => (
              <View key={idx} style={styles.agentRow}>
                <View>
                  <Text style={styles.agentRowText}>{agent.label}</Text>
                  <Text style={{ color: COLORS.text, fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>{agent.value}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.agentReady, { color: agent.decision === 'BULLISH' ? COLORS.green : agent.decision === 'BEARISH' ? COLORS.red : COLORS.yellow }]}>
                    {agent.decision}
                  </Text>
                  <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 2 }}>{agent.confidence}% Conf</Text>
                </View>
              </View>
            )) : (
              <Text style={{ textAlign: 'center', color: COLORS.muted, padding: 10, fontSize: 12 }}>
                Running 10 TS Algorithms...
              </Text>
            )}
          </View>
        </View>

        {/* QUICK METRICS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Activity color={COLORS.yellow} size={20} />
            <Text style={styles.cardTitle}>Market Metrics</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>VOLUME</Text>
              <Text style={styles.metricValue}>{stock.volume?.toLocaleString('id-ID') || '-'}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>SECTOR</Text>
              <Text style={[styles.metricValue, { color: COLORS.accent }]} numberOfLines={1}>{stock.sector || '-'}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: 16, paddingTop: 50 },

  // Header
  header: { marginBottom: 16 },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  badgeInstitutional: { backgroundColor: '#22AB9420', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#22AB94' },
  badgeInstitutionalText: { color: '#22AB94', fontSize: 10, fontWeight: 'bold' },

  // Search
  searchSection: { marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, height: 40 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  searchBtn: { backgroundColor: COLORS.green, paddingHorizontal: 16, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginLeft: 8 },
  searchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  // Tags
  tagsScroll: { flexDirection: 'row', marginBottom: 8 },
  tag: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
  tagActive: { backgroundColor: COLORS.green + '20', borderColor: COLORS.green },
  tagText: { color: COLORS.muted, fontSize: 12, fontWeight: 'bold' },
  tagTextActive: { color: COLORS.green },

  // Disclaimer
  disclaimerBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.yellow + '10', borderWidth: 1, borderColor: COLORS.yellow + '50', padding: 10, borderRadius: 8, marginBottom: 16 },
  disclaimerText: { color: COLORS.text, fontSize: 11, marginLeft: 8 },

  // Status Container
  statusContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: COLORS.muted, fontSize: 11, fontFamily: 'monospace' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.hover, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 6 },
  refreshButtonText: { color: 'white', fontSize: 11, fontWeight: 'bold' },

  // Card
  card: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },

  // Banner
  bannerRow: { flexDirection: 'column' },
  zapIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.yellow + '15', borderWidth: 1, borderColor: COLORS.yellow + '40', justifyContent: 'center', alignItems: 'center' },
  tickerLarge: { color: 'white', fontSize: 24, fontWeight: '900', fontFamily: 'monospace' },
  companyName: { color: COLORS.muted, fontSize: 14, marginLeft: 10 },
  priceLarge: { color: 'white', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  changeLarge: { fontSize: 14, fontWeight: 'bold' },

  consensusLabel: { color: COLORS.muted, fontSize: 10, fontFamily: 'monospace', marginBottom: 4 },
  consensusBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, gap: 8 },
  consensusText: { fontSize: 18, fontWeight: '900', fontFamily: 'monospace' },

  // Card Internal
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12, marginBottom: 16 },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  analysisText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },

  // Skeleton
  skeletonLine: { height: 16, backgroundColor: COLORS.hover, borderRadius: 4 },

  // Agent Breakdown
  agentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 8, marginBottom: 6 },
  agentRowText: { color: COLORS.muted, fontSize: 12, fontFamily: 'monospace' },
  agentReady: { color: COLORS.green, fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },

  // Metrics
  metricBox: { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 8 },
  metricLabel: { color: COLORS.muted, fontSize: 10, fontFamily: 'monospace', marginBottom: 4 },
  metricValue: { color: 'white', fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' }
});
