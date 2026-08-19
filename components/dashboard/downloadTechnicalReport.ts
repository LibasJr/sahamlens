import { getDecisionPresentation } from '@/modules/eligibility';
import { displayDashboardTicker } from '@/components/dashboard/dashboard-analysis';

export async function downloadTechnicalReport(args: { data: any; ticker: string }) {
  const { data, ticker } = args;
  if (!data?.scoring) return;

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const stock = data?.stock || {};
  const doc = new jsPDF();
  doc.setFontSize(16);
  const decisionPresentation = getDecisionPresentation(data.scoring.kategori, data.decision);
  const reportLabel = decisionPresentation.recommendationLabel
    ?? decisionPresentation.modelSignalLabel
    ?? 'STATUS MODEL TIDAK TERSEDIA';
  doc.text(`${displayDashboardTicker(stock.symbol || ticker)} Technical Report - Score ${data.scoring.total_score} - ${reportLabel}`, 14, 20);

  let finalY = 30;
  const chartElement = document.querySelector('.tv-lightweight-charts');
  if (chartElement) {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartElement as HTMLElement, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#0B0F19',
      });
      const imageData = canvas.toDataURL('image/png');
      const imageHeight = (canvas.height * 180) / canvas.width;
      doc.addImage(imageData, 'PNG', 14, 30, 180, imageHeight);
      finalY = 30 + imageHeight + 10;
    } catch (error) {
      console.error('Screenshot error', error);
    }
  }

  doc.setFontSize(12);
  doc.text('Technical Indicators', 14, finalY);
  const tableData = data.analyzers.map((analyzer: any) => [
    analyzer.label,
    analyzer.value,
    analyzer.decision,
    `${analyzer.confidence}/100`,
  ]);
  autoTable(doc, {
    startY: finalY + 5,
    head: [['Filter', 'Value', 'Signal', 'Rule Strength']],
    body: tableData,
  });

  finalY = (doc as any).lastAutoTable?.finalY || finalY + 30;
  doc.setFontSize(11);
  const decisionText = decisionPresentation.actionable
    ? `${decisionPresentation.recommendationLabel} dengan skor ${data.scoring.total_score}/100.`
    : `${decisionPresentation.modelSignalLabel || 'Sinyal model tidak tersedia'}. Status: ${decisionPresentation.statusLabel || 'rekomendasi tidak tersedia'}. ${decisionPresentation.explanation || ''} Skor ${data.scoring.total_score}/100 tetap ditampilkan sebagai informasi.`;
  const decisionLines = doc.splitTextToSize(decisionText, 180);
  doc.text(decisionLines, 14, finalY + 15);
  doc.text('Harga di bawah/atas indikator MA mengonfirmasi tren saat ini.', 14, finalY + 20 + (decisionLines.length * 5));

  doc.setFontSize(9);
  doc.text('Disclaimer: Laporan ini di-generate secara otomatis oleh AI. Bukan ajakan beli/jual.', 14, 280);
  doc.save(`${displayDashboardTicker(stock.symbol || ticker)}_Technical_Report.pdf`);
}
