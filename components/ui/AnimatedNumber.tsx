'use client';

import React, { useEffect, useRef } from 'react';

const DEFAULT_FORMAT = (n: number) => Math.round(n).toLocaleString('id-ID');

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AnimatedNumber({ value, format = DEFAULT_FORMAT, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  const previousValue = useRef(value);
  const latestValue = useRef(value);
  latestValue.current = value;
  const mounted = useRef(false);

  useEffect(() => {
    formatRef.current = format;
    if (ref.current) ref.current.textContent = format(latestValue.current);
  }, [format]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (prefersReducedMotion()) {
      node.textContent = formatRef.current(value);
      previousValue.current = value;
      mounted.current = true;
      return;
    }

    const start = mounted.current ? previousValue.current : value;
    const delta = value - start;
    const duration = mounted.current ? 420 : 0;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      if (!node) return;
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      // easeOutCubic: ringan, deterministic, dan tidak memerlukan runtime animation library.
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatRef.current(start + delta * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    previousValue.current = value;
    mounted.current = true;
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span ref={ref} className={className}>{format(value)}</span>;
}

export default AnimatedNumber;
