import type { Raid } from '../../shared/types';

export function RaidSelect({ raids, active, onSelect }: { raids: Raid[]; active?: string; onSelect: (id: string) => void }) {
  return (
    <label className="raid-select">
      <span>Raid</span>
      <select value={active ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {!active && <option value="">Choose a raid</option>}
        {raids.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
