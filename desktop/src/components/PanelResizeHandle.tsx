import { useRef } from 'react';

export function PanelResizeHandle({ side, onResize }: { side: 'left' | 'right'; onResize: (delta: number) => void }) {
  const start = useRef<number | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { start.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (start.current == null) return; const delta = event.clientX - start.current; if (!delta) return; onResize(side === 'left' ? delta : -delta); start.current = event.clientX; };
  const onPointerEnd = () => { start.current = null; };
  return <div className={`panel-resize-handle ${side}`} role="separator" aria-orientation="vertical" aria-label={side === 'left' ? 'Ubah lebar watchlist' : 'Ubah lebar panel insight'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />;
}
