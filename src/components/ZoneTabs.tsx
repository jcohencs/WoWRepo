import { useEffect, useRef } from 'react';
import type { Zone } from '../../shared/types';

export function ZoneTabs({ zones, active, onSelect }: { zones: Zone[]; active?: number; onSelect: (id: number) => void }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <nav className="tabs" aria-label="Raids" ref={nav}>
      {zones.map((z) => (
        <button key={z.id} className="tab" aria-current={z.id === active ? 'true' : undefined} onClick={() => onSelect(z.id)}>
          {z.name}
        </button>
      ))}
    </nav>
  );
}
