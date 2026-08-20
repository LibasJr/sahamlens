import { describe, expect, it } from 'vitest';
import { summarizeJourneyCounts, type JourneyCounts } from '../journey-summary';

const kosong: JourneyCounts = {
  periodDays: 30,
  sessions: 0,
  searchSessions: 0,
  searchToAnalysisSessions: 0,
  radarSessions: 0,
  radarToAnalysisSessions: 0,
  analysisSessions: 0,
  evidenceSessions: 0,
  medianMsToFirstAnalysis: null,
  lensaiQuestions: 0,
  lensaiQuestionsWithContext: 0,
  supportReferencesShown: 0,
  repeatWatchlistVisitors: 0,
  watchlistVisitors: 0,
};

describe('ringkasan perjalanan riset', () => {
  it('menghitung tiap rasio terhadap penyebutnya sendiri', () => {
    const summary = summarizeJourneyCounts({
      ...kosong,
      sessions: 400,
      searchSessions: 200,
      searchToAnalysisSessions: 150,
      radarSessions: 80,
      radarToAnalysisSessions: 20,
      analysisSessions: 240,
      evidenceSessions: 96,
      medianMsToFirstAnalysis: 21_400,
      lensaiQuestions: 50,
      lensaiQuestionsWithContext: 35,
      watchlistVisitors: 60,
      repeatWatchlistVisitors: 24,
    });

    expect(summary.searchToAnalysisPct).toBe(75);
    expect(summary.radarToAnalysisPct).toBe(25);
    expect(summary.summaryToEvidencePct).toBe(40);
    expect(summary.lensaiWithContextPct).toBe(70);
    expect(summary.repeatWatchlistPct).toBe(40);
  });

  it('memberi null - bukan nol - saat penyebutnya kosong', () => {
    // Nol persen berarti "dicoba, tidak ada yang lanjut". Belum ada data berarti hal yang
    // sama sekali berbeda, dan panel admin harus bisa membedakannya.
    const summary = summarizeJourneyCounts(kosong);
    expect(summary.searchToAnalysisPct).toBeNull();
    expect(summary.radarToAnalysisPct).toBeNull();
    expect(summary.summaryToEvidencePct).toBeNull();
    expect(summary.lensaiWithContextPct).toBeNull();
    expect(summary.repeatWatchlistPct).toBeNull();
    expect(summary.medianSecondsToFirstAnalysis).toBeNull();
  });

  it('nol persen tetap nol, bukan null', () => {
    const summary = summarizeJourneyCounts({ ...kosong, searchSessions: 30, searchToAnalysisSessions: 0 });
    expect(summary.searchToAnalysisPct).toBe(0);
  });

  it('median dilaporkan dalam detik, dibulatkan satu desimal', () => {
    expect(summarizeJourneyCounts({ ...kosong, medianMsToFirstAnalysis: 21_449 }).medianSecondsToFirstAnalysis).toBe(21.4);
    expect(summarizeJourneyCounts({ ...kosong, medianMsToFirstAnalysis: 0 }).medianSecondsToFirstAnalysis).toBe(0);
  });

  it('membulatkan persen ke bilangan bulat', () => {
    expect(summarizeJourneyCounts({ ...kosong, searchSessions: 3, searchToAnalysisSessions: 1 }).searchToAnalysisPct).toBe(33);
  });

  it('meneruskan hitungan mentah apa adanya', () => {
    // Panel admin menampilkan rasio DAN penyebutnya - "75% dari 4 sesi" bukan temuan.
    const summary = summarizeJourneyCounts({ ...kosong, sessions: 12, supportReferencesShown: 3 });
    expect(summary.sessions).toBe(12);
    expect(summary.supportReferencesShown).toBe(3);
    expect(summary.periodDays).toBe(30);
  });
});
