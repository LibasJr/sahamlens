import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchCurrentFundamentalSourceMock } = vi.hoisted(() => ({
  fetchCurrentFundamentalSourceMock: vi.fn(),
}));

vi.mock('@/modules/fundamental/service/current-fundamental-source.service', () => ({
  fetchCurrentFundamentalSource: fetchCurrentFundamentalSourceMock,
}));

import { asksAboutIssuerProfile, buildIssuerProfileKnowledge } from '../issuer-profile-knowledge';

beforeEach(() => {
  fetchCurrentFundamentalSourceMock.mockReset();
});

describe('asksAboutIssuerProfile', () => {
  it.each([
    'DGWG perusahaan apa?',
    'DGWG bergerak di bidang apa?',
    'bisnisnya DGWG apa saja?',
    'ANTM jual apa?',
    'EMTK dapat uang dari mana?',
    'profil perusahaan BBCA',
    'BRPT lini bisnisnya apa?',
  ])('mengenali pertanyaan profil emiten: %s', (prompt) => {
    expect(asksAboutIssuerProfile(prompt)).toBe(true);
  });

  it.each([
    'fundamental DGWG gimana?',
    'RSI DGWG berapa?',
    'nilai wajar DGWG',
  ])('tidak menyerobot intent analisis biasa: %s', (prompt) => {
    expect(asksAboutIssuerProfile(prompt)).toBe(false);
  });
});

describe('buildIssuerProfileKnowledge', () => {
  it('mengirim identitas dan kegiatan usaha yang terverifikasi ke LensAI', async () => {
    fetchCurrentFundamentalSourceMock.mockResolvedValue({
      price: {
        longName: 'PT Delta Giri Wacana Tbk',
        shortName: 'Delta Giri Wacana Tbk',
      },
      assetProfile: {
        sector: 'Basic Materials',
        industry: 'Agricultural Inputs',
        longBusinessSummary: 'The company distributes crop protection products, fertilizers, seeds, and agricultural equipment.',
        website: 'https://example.test',
      },
    });

    const block = await buildIssuerProfileKnowledge(['DGWG']);

    expect(fetchCurrentFundamentalSourceMock).toHaveBeenCalledWith('DGWG', { timeoutMs: 8000 });
    expect(block).toContain('PROFIL EMITEN');
    expect(block).toContain('PT Delta Giri Wacana Tbk');
    expect(block).toContain('Delta Giri Wacana Tbk.');
    expect(block).toContain('Basic Materials');
    expect(block).toContain('Agricultural Inputs');
    expect(block).toContain('crop protection products, fertilizers, seeds, and agricultural equipment');
    expect(block).toContain('https://example.test');
  });

  it('tetap mengetahui nama emiten dari master ticker saat profil provider kosong', async () => {
    fetchCurrentFundamentalSourceMock.mockResolvedValue(null);

    const block = await buildIssuerProfileKnowledge(['DGWG']);

    expect(block).toContain('Delta Giri Wacana Tbk.');
    expect(block).toContain('Profil bisnis provider: tidak tersedia');
    expect(block).toContain('jangan menebak sektor');
  });

  it('tidak mengarang field profil yang provider tidak kirim', async () => {
    fetchCurrentFundamentalSourceMock.mockResolvedValue({
      price: { longName: 'PT Delta Giri Wacana Tbk', shortName: null },
      assetProfile: null,
    });

    const block = await buildIssuerProfileKnowledge(['DGWG']);

    expect(block).toContain('Sektor: tidak tersedia');
    expect(block).toContain('Industri: tidak tersedia');
    expect(block).toContain('Ringkasan kegiatan usaha (sumber publik): tidak tersedia');
  });
});
