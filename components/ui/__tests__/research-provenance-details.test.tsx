import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResearchProvenanceDetails } from '../ResearchProvenanceDetails';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('ResearchProvenanceDetails', () => {
  it('merender metadata asli di progressive disclosure', () => {
    const html = render(<ResearchProvenanceDetails
      label="Sumber ROE"
      entries={[{
        label: 'ROE',
        value: 0.184,
        provenance: {
          source: 'Yahoo Finance',
          period: 'FY 2025',
          asOf: '2025-12-31T00:00:00.000Z',
          retrievedAt: '2026-08-27T03:00:00.000Z',
          confidence: 'official',
          isEstimated: false,
          transformation: 'DIRECT',
        },
      }]}
    />);

    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Sumber ROE');
    expect(html).toContain('Yahoo Finance');
    expect(html).toContain('FY 2025');
    expect(html).toContain('Langsung dari sumber');
    expect(html).toContain('official');
  });

  it('membedakan nilai turunan dan menampilkan identitas model/universe', () => {
    const html = render(<ResearchProvenanceDetails
      entries={[{
        label: 'Flow · cmf20',
        value: 0.12,
        provenance: {
          source: 'YAHOO_CHART_DERIVED_FLOW',
          confidence: 'calculated',
          isEstimated: false,
          transformation: 'DERIVED',
        },
      }]}
      model={{
        version: 'lens-score-v1.5.0',
        configHash: 'fnv1a32-12345678',
        status: 'RESEARCH_ONLY',
        universeVersion: 'idx-liquid-v2026-08-17',
      }}
    />);

    expect(html).toContain('Turunan deterministik');
    expect(html).toContain('lens-score-v1.5.0');
    expect(html).toContain('fnv1a32-12345678');
    expect(html).toContain('RESEARCH_ONLY');
    expect(html).toContain('idx-liquid-v2026-08-17');
  });

  it('tidak mengarang provenance ketika sumber hilang', () => {
    const html = render(<ResearchProvenanceDetails entries={[
      { label: 'DER', value: null, provenance: undefined },
    ]} />);

    expect(html).toContain('Sumber belum tersedia pada payload ini.');
    expect(html).not.toContain('Yahoo');
  });
});
