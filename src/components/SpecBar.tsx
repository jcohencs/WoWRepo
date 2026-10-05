import { specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

/**
 * Switches the page between the class's specs. "Best spec" lets each boss use whichever spec the
 * character parsed best with there.
 */
export function SpecBar({
  className,
  specs,
  active,
  mainSpec,
  onSelect,
}: {
  className: string;
  specs: string[];
  active: string | null;
  mainSpec: string;
  onSelect: (spec: string | null) => void;
}) {
  return (
    <div className="spec-bar" role="group" aria-label="Spec">
      <span className="spec-bar-label">Spec</span>
      <div className="segmented">
        <button aria-pressed={active == null} onClick={() => onSelect(null)} title="Each boss uses the spec of your best kill there">
          {active == null && mainSpec && <SpecIcon className={className} spec={mainSpec} size={18} />}
          Best spec{active == null && mainSpec ? ` (${specLabel(mainSpec)})` : ''}
        </button>
        {specs.map((s) => (
          <button key={s} aria-pressed={active === s} onClick={() => onSelect(s)}>
            <SpecIcon className={className} spec={s} size={18} />
            {specLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
