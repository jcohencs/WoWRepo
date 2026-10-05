import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import type { Realm, Region } from '../../shared/types';
import { parseCharacterUrl, realmSlug, REGIONS } from '../../server/core/input';
import { api, type Query } from '../lib/api';

interface Props {
  initial: Query | null;
  busy: boolean;
  onSearch: (q: Query) => void;
}

const REGION_NAMES: Record<Region, string> = { US: 'Americas', EU: 'Europe', KR: 'Korea', TW: 'Taiwan', CN: 'China' };

export function SearchBar({ initial, busy, onSearch }: Props) {
  const [region, setRegion] = useState<Region>(initial?.region ?? 'US');
  const [realm, setRealm] = useState(initial?.realm ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [realms, setRealms] = useState<Realm[] | null>(null);
  const [realmsFailed, setRealmsFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setRealms(null);
    setRealmsFailed(false);
    api.realms(region).then(
      (list) => live && setRealms(list),
      () => live && setRealmsFailed(true),
    );
    return () => {
      live = false;
    };
  }, [region]);

  // Keep a realm that came from a pasted link or the address bar even if the list doesn't have it.
  const options = realms && realm && !realms.some((r) => r.slug === realm) ? [{ name: realm, slug: realm }, ...realms] : realms;
  const typeRealm = realmsFailed || (realms != null && realms.length === 0);

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
    if (fillFromUrl(name)) return;
    if (!realm.trim() || !name.trim()) return;
    onSearch({ region, realm: realmSlug(realm), name: name.trim() });
  };

  return (
    <form className="search" onSubmit={submit}>
      <label className="field field-region">
        <span>Region</span>
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value as Region);
            setRealm('');
          }}
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {REGION_NAMES[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-realm">
        <span>Realm</span>
        {typeRealm ? (
          <input value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="Type your realm" autoComplete="off" spellCheck={false} />
        ) : (
          <select value={realm} onChange={(e) => setRealm(e.target.value)} disabled={!options} required>
            <option value="" disabled>
              {options ? 'Choose your realm' : 'Loading realms…'}
            </option>
            {options?.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="field field-name">
        <span>Character name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPaste={onPaste}
          placeholder="Name, or paste your Warcraft Logs link"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button className="button" type="submit" disabled={busy || !realm || !name.trim()}>
        {busy ? 'Loading…' : 'Check my parses'}
      </button>
    </form>
  );
}
