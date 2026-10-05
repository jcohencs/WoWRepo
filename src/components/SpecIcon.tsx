import { specLabel } from '../lib/format';

/** The in-game icon each TBC spec is usually shown with (Wowhead icon names). */
const SPEC_ICONS: Record<string, string> = {
  'Druid-Balance': 'spell_nature_starfall',
  'Druid-Feral': 'ability_racial_bearform',
  'Druid-Guardian': 'ability_racial_bearform',
  'Druid-Restoration': 'spell_nature_healingtouch',
  'Hunter-BeastMastery': 'ability_hunter_beasttaming',
  'Hunter-Marksmanship': 'ability_marksmanship',
  'Hunter-Survival': 'ability_hunter_swiftstrike',
  'Mage-Arcane': 'spell_holy_magicalsentry',
  'Mage-Fire': 'spell_fire_firebolt02',
  'Mage-Frost': 'spell_frost_frostbolt02',
  'Paladin-Holy': 'spell_holy_holybolt',
  'Paladin-Protection': 'spell_holy_devotionaura',
  'Paladin-Retribution': 'spell_holy_auraoflight',
  'Priest-Discipline': 'spell_holy_wordfortitude',
  'Priest-Holy': 'spell_holy_guardianspirit',
  'Priest-Shadow': 'spell_shadow_shadowwordpain',
  'Rogue-Assassination': 'ability_rogue_eviscerate',
  'Rogue-Combat': 'ability_backstab',
  'Rogue-Subtlety': 'ability_stealth',
  'Shaman-Elemental': 'spell_nature_lightning',
  'Shaman-Enhancement': 'spell_nature_lightningshield',
  'Shaman-Restoration': 'spell_nature_magicimmunity',
  'Warlock-Affliction': 'spell_shadow_deathcoil',
  'Warlock-Demonology': 'spell_shadow_metamorphosis',
  'Warlock-Destruction': 'spell_shadow_rainoffire',
  'Warrior-Arms': 'ability_warrior_savageblow',
  'Warrior-Fury': 'ability_warrior_innerrage',
  'Warrior-Protection': 'ability_warrior_defensivestance',
};

export function specIconUrl(className: string, spec: string): string | null {
  const icon = SPEC_ICONS[`${className}-${spec}`];
  return icon ? `https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg` : null;
}

/** Small square spec icon; hides itself if the image can't load. */
export function SpecIcon({ className, spec, size = 20 }: { className: string; spec: string; size?: number }) {
  const url = specIconUrl(className, spec);
  if (!url) return null;
  return (
    <img
      className="spec-icon"
      src={url}
      alt=""
      title={`${specLabel(spec)} ${className}`}
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
}
