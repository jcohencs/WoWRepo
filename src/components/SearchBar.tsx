import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { REALM_REGION, REALMS } from '../../shared/types';
import { parseCharacterUrl } from '../../server/core/input';
import { api, type Query } from '../lib/api';

interface Props {
  initial: Query | null;
  busy: boolean;
  onSearch: (q: Query) => void;
}

const isKnownRealm = (slug: string) => REALMS.some((r) => r.slug === slug);

export function SearchBar({ initial, busy, onSearch }: Props) {
  const [realm, setRealm] = useState<string>(initial && isKnownRealm(initial.realm) ? initial.realm : REALMS[0].slug);
  const [name, setName] = useState(initial?.name ?? '');
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    setNames([]);
    api.names(realm).then((list) => live && setNames(list), () => undefined);
    return () => {
      live = false;
    };
  }, [realm]);

  // Suggest only once a couple of letters are typed, so the list stays short.
  const typed = name.trim().toLowerCase();
  const suggestions = typed.length >= 2 ? names.filter((n) => n.toLowerCase().startsWith(typed)).slice(0, 12) : [];

  const fillFromUrl = (text: string) => {
    const ref = parseCharacterUrl(text);
    if (!ref || !isKnownRealm(ref.realm)) return false;
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
    if (fillFromUrl(name) || !name.trim()) return;
    onSearch({ region: REALM_REGION, realm, name: name.trim() });
  };

  return (
    <form className="search" onSubmit={submit}>
      <label className="field field-realm">
        <span>Realm</span>
        <select value={realm} onChange={(e) => setRealm(e.target.value)}>
          {REALMS.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-name">
        <span>Character name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPaste={onPaste}
          placeholder="Your character's name"
          autoComplete="off"
          spellCheck={false}
          list="character-names"
        />
        <datalist id="character-names">
          {suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <button className="button" type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Loading…' : 'Check my parses'}
      </button>
    </form>
  );
}
