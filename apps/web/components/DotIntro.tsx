'use client';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { reduceMotion } from '../lib/dot-motion';
import type { IntroRenderer } from '../lib/orbit-intro';
export type IntroHandle = { settle: () => Promise<void> };
export default function DotIntro({ color, ref }: { color: string; ref?: Ref<IntroHandle> }) {
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<IntroRenderer | null>(null);
  const [ready, setReady] = useState(false);
  useImperativeHandle(ref, () => ({ settle: () => renderer.current?.settle() || Promise.resolve() }));
  useEffect(() => {
    let disposed = false;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const create = () => {
      renderer.current?.dispose(); renderer.current = null; setReady(false);
      if (reduceMotion()) return;
      void import('../lib/orbit-intro').then(({ renderOrbitIntroductionLogo }) => {
        if (disposed || reduceMotion() || !canvas.current || !root.current) return;
        try { renderer.current = renderOrbitIntroductionLogo(canvas.current, root.current, { color, landingColor: color, palette: ['#7cb6ff', '#a9e597', '#ffe742', '#f886b7'] }, () => setReady(false), () => setReady(true)); } catch { setReady(false); }
      });
    };
    create(); media.addEventListener('change', create);
    const observer = new MutationObserver(create); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion'] });
    return () => { disposed = true; observer.disconnect(); media.removeEventListener('change', create); renderer.current?.dispose(); renderer.current = null; };
  }, [color]);
  return <div ref={root} className="onboarding-orbit-logo" data-dot-anchor aria-hidden="true"><span className="onboarding-ring" style={{ visibility: ready ? 'hidden' : 'visible', color }} /><canvas ref={canvas} style={{ visibility: ready ? 'visible' : 'hidden' }} /></div>;
}
