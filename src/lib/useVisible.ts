import { useEffect, useState } from 'react';

/**
 * True once the element has scrolled into (or near) view; stays true after that. Returns a callback
 * ref, so it works for elements that only appear after loading.
 */
export function useVisible(margin = '200px'): [(el: Element | null) => void, boolean] {
  const [el, setEl] = useState<Element | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, margin, seen]);
  return [setEl, seen];
}
