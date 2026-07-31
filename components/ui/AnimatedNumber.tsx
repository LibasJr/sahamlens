'use client';

import React, { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, animate } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('id-ID'), className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 20 });
  const display = useTransform(spring, (v) => format(v));
  const ref = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    motionValue.set(mounted.current ? motionValue.get() : 0);
    animate(motionValue, value, { duration: mounted.current ? 0.6 : 0.8, ease: [0.16, 1, 0.3, 1] });
    mounted.current = true;
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsubscribe;
  }, [display]);

  return <span ref={ref} className={className}>{format(value)}</span>;
}

export default AnimatedNumber;
