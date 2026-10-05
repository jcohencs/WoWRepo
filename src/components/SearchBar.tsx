import { useState, type ClipboardEvent, type FormEvent } from 'react';
import type { Region } from '../../shared/types';
import { parseCharacterUrl, realmSlug, REGIONS } from '../../server/core/input';
import type { Query } from '../lib/api';

interface Props {
  initial: Query | null;
  busy: boolean;
  onSearch: (q: Query) => void;
}

export function SearchBar({ initial, busy, onSearch }: Props) {
  const [region, setRegion] = useState<Region>(initial?.region ?? 'US');
  const [realm, setRealm] = useState(initial?.realm ?? '');
  const [name, setName] = useState(initial?.name ?? '');

  const fillFromUrl = (text: string) => {
    const ref = parseCharacterUrl(text);
    if (!ref) return false;
    setRegion(ref.region);
    setRealm(ref.realm);
    setName(ref.name);
    onSearch(ref);
    return true;
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (fillFromUrl(e.clipboardData.getData('text'))) e.preventDefault();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (fillFromUrl(name) || fillFromUrl(realm)) return;
    if (!realm.trim() || !name.trim()) return;
    onSearch({ region, realm: realmSlug(realm), name: name.trim() });
  };

  return (
    <form className="search" onSubmit={submit}>
      <label className="field field-region">
        <span>Region</span>
        <select value={region} onChange={(e) => setRegion(e.target.value as Region)}>
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="field field-realm">
        <span>Realm</span>
        <input value={realm} onChange={(e) => setRealm(e.target.value)} onPaste={onPaste} placeholder="Dreamscythe" autoComplete="off" spellCheck={false} />
      </label>
      <label className="field field-name">
        <span>Character</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPaste={onPaste}
          placeholder="Name or Warcraft Logs link"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Check'}
      </button>
    </form>
  );
}
