import type { CSSProperties, MouseEvent } from 'react';
import { CLASS_LIST, classColor, classIconUrl, guidePath, guideTitle, talentsUrl } from '../lib/classes';
import { specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

type Navigate = (path: string) => void;

/** Opens an in-site link without reloading the page (ctrl/cmd-click still opens a new tab). */
const inSite = (navigate: Navigate, path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(path);
};

function ClassIcon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <img
      className="class-icon"
      src={classIconUrl(name)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
    />
  );
}

function TalentsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="M8 2v4M8 10v4M4 6h8M4 6v4M12 6v4M3 10h2M11 10h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="M3 2.5h7.5L13 5v8.5H3zM5.5 7h5M5.5 9.5h5M5.5 12h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Every class as a square tile: big class icon, a guide link per spec, and the talent calculator. */
export function ClassGrid({ navigate }: { navigate: Navigate }) {
  return (
    <section className="class-grid-wrap" aria-labelledby="classes-title">
      <header className="section-head">
        <div>
          <h2 id="classes-title">Classes</h2>
          <p className="soft">Talent calculators and spec guides.</p>
        </div>
      </header>
      <div className="class-grid">
        {CLASS_LIST.map((c) => (
          <article key={c.name} className="class-tile" style={{ '--class': classColor(c.name) } as CSSProperties}>
            <ClassIcon name={c.name} size={64} />
            <h3>{c.name}</h3>
            <ul className="class-tile-specs">
              {c.specs.map((spec) => (
                <li key={spec}>
                  <a href={guidePath(c.name, spec)} onClick={inSite(navigate, guidePath(c.name, spec))} title={`${guideTitle(c.name, spec)} guide`}>
                    <SpecIcon className={c.name} spec={spec} size={30} />
                    <span>{specLabel(spec)}</span>
                  </a>
                </li>
              ))}
            </ul>
            <a className="class-tile-talents" href={talentsUrl(c.name)} target="_blank" rel="noreferrer" title={`${c.name} talent calculator (Wowhead)`}>
              <TalentsIcon />
              Talents ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

/** A spec's guide page. Guides aren't written yet; this holds the place and the links. */
export function GuidePage({ name, spec, navigate }: { name: string; spec: string; navigate: Navigate }) {
  const others = CLASS_LIST.find((c) => c.name === name)?.specs.filter((s) => s !== spec) ?? [];
  return (
    <main className="content guide-page" style={{ '--class': classColor(name) } as CSSProperties}>
      <a className="back-link" href="/" onClick={inSite(navigate, '/')}>
        ← All classes
      </a>
      <header className="guide-head">
        <SpecIcon className={name} spec={spec} size={44} />
        <div>
          <h1>{guideTitle(name, spec)} guide</h1>
          <p className="soft">TBC Anniversary · Nightslayer</p>
        </div>
      </header>
      <div className="guide-links">
        <a className="button ghost" href={talentsUrl(name)} target="_blank" rel="noreferrer">
          <TalentsIcon /> {name} talents ↗
        </a>
        {others.map((s) => (
          <a key={s} className="button ghost" href={guidePath(name, s)} onClick={inSite(navigate, guidePath(name, s))}>
            <SpecIcon className={name} spec={s} size={18} /> {specLabel(s)}
          </a>
        ))}
      </div>
      <div className="guide-soon">
        <GuideIcon />
        <p>This guide is coming soon.</p>
      </div>
    </main>
  );
}

/** Sidebar box: talents and guide for the spec being looked at; follows the spec bar and boss. */
export function SpecLinksCard({ name, spec, navigate }: { name: string; spec: string; navigate: Navigate }) {
  if (!spec) return null;
  const guide = guidePath(name, spec);
  return (
    <section className="side-card spec-links" style={{ '--class': classColor(name) } as CSSProperties} aria-label={`${guideTitle(name, spec)} talents and guide`}>
      <p className="sidebar-title">Talents &amp; guide</p>
      <div className="spec-links-body">
        <div className="spec-links-who">
          <SpecIcon className={name} spec={spec} size={40} />
          <div>
            <strong>{specLabel(spec)}</strong>
            <span>{name}</span>
          </div>
        </div>
        <a className="spec-link" href={talentsUrl(name)} target="_blank" rel="noreferrer">
          <TalentsIcon />
          <span>
            <b>Talents</b>
            <small>Wowhead talent calculator</small>
          </span>
          <i aria-hidden>↗</i>
        </a>
        <a className="spec-link" href={guide} onClick={inSite(navigate, guide)}>
          <GuideIcon />
          <span>
            <b>Guide</b>
            <small>{guideTitle(name, spec)}</small>
          </span>
          <i aria-hidden>→</i>
        </a>
      </div>
    </section>
  );
}
