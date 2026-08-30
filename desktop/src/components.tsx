import type { ReactNode } from 'react';

export function ViewToggle({ detail, onChange }: { detail: boolean; onChange: (value: boolean) => void }) {
  return <div className="view-toggle" role="group" aria-label="Mode tampilan">
    <button className={!detail ? 'selected' : ''} onClick={() => onChange(false)}>Ringkas</button>
    <button className={detail ? 'selected' : ''} onClick={() => onChange(true)}>Detail</button>
  </div>;
}

export function DetailHint({ detail, children }: { detail: boolean; children: ReactNode }) {
  return detail ? <div className="detail-hint">{children}</div> : null;
}
