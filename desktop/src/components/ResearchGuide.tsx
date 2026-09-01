import { ArrowRight, BookOpenCheck, CandlestickChart, Radar } from 'lucide-react';
import type { Workspace } from './AppNavigation';

const steps: Array<{ title: string; detail: string; workspace: Workspace; icon: typeof Radar }> = [
  { title: 'Lihat kondisi pasar', detail: 'Mulai dari regime dan breadth sebelum melihat saham individual.', workspace: 'market', icon: Radar },
  { title: 'Cari kandidat', detail: 'Gunakan Radar untuk menemukan saham yang layak diperiksa lebih lanjut.', workspace: 'radar', icon: CandlestickChart },
  { title: 'Validasi dengan bukti', detail: 'Buka Stock Workspace untuk chart, fundamental, valuasi, dan risiko.', workspace: 'analysis', icon: BookOpenCheck },
];

export function ResearchGuide({ onNavigate }: { onNavigate: (workspace: Workspace) => void }) {
  return <section className="research-guide" aria-labelledby="research-guide-title"><div className="guide-heading"><div><span className="section-kicker">ALUR RISET</span><h2 id="research-guide-title">Mulai dengan konteks, bukan sinyal.</h2></div><span>Untuk pembelajaran</span></div><div className="guide-steps">{steps.map(({ title, detail, workspace, icon: Icon }, index) => <button key={workspace} onClick={() => onNavigate(workspace)}><span className="guide-number">0{index + 1}</span><Icon size={18} /><strong>{title}</strong><small>{detail}</small><ArrowRight size={15} className="guide-arrow" /></button>)}</div></section>;
}
