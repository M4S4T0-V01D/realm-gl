/**
 * The Pursuance journal (the Quest journal tab's second page): every creature you've met, what you know of it and how
 * to learn the rest, how well you've mastered it, and what to bring. Everything in it comes from pursuance.ts and is
 * learnt in play; the creature's Adventurer Card, once found, adds its story.
 */
import React, { useState } from "react";
import { MONSTERS, item, type MonsterDef } from "./data.ts";
import { level, type Game } from "./state.ts";
import { FACTS, MASTERY, eyeLevel, habitats, knownByFact, knows, knowsTrick, lore, mastery, pursuable, tricksOf, type Fact } from "./pursuance.ts";
import { taskText } from "./slayer.ts";
import { CARDS, cardFound } from "./codex.ts";

/** What to bring against it, from what you know: its weak element's spells, faith against the dead, antidotes against venom… */
function bring(game: Game, def: MonsterDef): string[] {
  const out: string[] = [], id = def.id;
  if (knows(game, id, "weakness")) {
    if (def.weakness && def.weakness !== "holy") out.push(({ fire: "Fire spells", water: "Water spells", wind: "Wind spells", earth: "Earth spells" } as const)[def.weakness]);
    if (def.undead || def.weakness === "holy") out.push("Faith weapons and holy light");
    if (!def.poisonImmune && (def.poisonWeak ?? 1) > 1) out.push("Weapon poison");
  }
  if (knows(game, id, "defences")) { const magic = def.magicDef ?? def.defence; if (magic < def.defence * 0.8) out.push("Spells"); else if (magic > def.defence * 1.2) out.push("Steel or arrows"); }
  if (knowsTrick(game, id, "poison")) out.push("Antidotes");
  if (knowsTrick(game, id, "breath")) out.push("A Wyrmward shield and antifire");
  if (knowsTrick(game, id, "drain_faith")) out.push("Faith potions");
  return out;
}
const FACT_LABEL: Record<Exclude<Fact, "seen">, string> = { temper: "How it fights", habitat: "Where it lives", weakness: "Weakness", defences: "Guard", abilities: "Tricks" };
const NEXT_TIER = ["Familiar: 10 put down and its weakness known.", "Seasoned: 50 put down and its guard known.", "Expert: 150 put down and everything known.", ""];
/** How to learn what you don't know yet. */
function hint(game: Game, def: MonsterDef, fact: Exclude<Fact, "seen">): string {
  switch (fact) {
    case "temper": return `Fight it, or examine it at Pursuance ${eyeLevel(def, "temper")}.`;
    case "habitat": return "Put three down, or read its tracks.";
    case "weakness": return `Find it out by spell, faith or poison, put ten down, examine it at Pursuance ${eyeLevel(def, "weakness")}, or ask the Warden.`;
    case "defences": return `Put five down, or examine it at Pursuance ${eyeLevel(def, "defences")}.`;
    case "abilities": return `${tricksOf(def).filter(trick => !knowsTrick(game, def.id, trick)).length} more to learn: fight it, or put 25 down.`;
  }
}
export function PursuanceJournal({ game }: { game: Game }) {
  const [open, setOpen] = useState<string | null>(null), player = game.player;
  const met = Object.keys(player.lore).map(id => MONSTERS[id]).filter(def => pursuable(def) && knows(game, def.id, "seen")).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const def = open ? MONSTERS[open] : null;
  if (def) {
    const entry = lore(game, def.id), tier = mastery(game, def.id), kills = player.killLog[def.id] ?? 0, known = knownByFact(game, def), card = CARDS.find(each => each.kind === "enemy" && each.unlock.kill === def.id);
    const join = (lines: string[]) => lines.length ? lines.join(" ") : null;
    const shows: Record<Exclude<Fact, "seen">, string | null> = {
      temper: join(known.temper),
      habitat: knows(game, def.id, "habitat") ? habitats(game, def.id).join(", ") || null : null,
      weakness: join(known.weakness),
      defences: join(known.defences),
      abilities: !tricksOf(def).length ? "None to speak of." : join(known.abilities),
    };
    const prep = bring(game, def);
    return (
      <div className="realm-journal realm-bestiary">
        <button type="button" className="realm-back" onClick={() => setOpen(null)}>‹ Pursuance journal</button>
        <h3>{def.name} <span className="realm-quest-state">{`level ${def.level}`}</span></h3>
        <p className="realm-muted"><b>{MASTERY[tier]}</b> · {`Put down: ${kills}`}{entry.t ? ` · ${`Tracks read: ${entry.t}`}` : ""}{entry.m ? ` · ${`Marked ones put down: ${entry.m}`}` : ""}</p>
        {NEXT_TIER[tier] && <p className="realm-muted"><b>Next:</b> {NEXT_TIER[tier]}</p>}
        <dl className="realm-facts">
          {(Object.keys(FACT_LABEL) as Exclude<Fact, "seen">[]).map(fact => (
            <React.Fragment key={fact}>
              <dt>{FACT_LABEL[fact]}</dt>
              <dd className={shows[fact] ? undefined : "realm-unknown"}>{shows[fact] ?? <>{"Not yet known."} <small>{hint(game, def, fact)}</small></>}</dd>
            </React.Fragment>
          ))}
          {prep.length > 0 && <><dt>Bring</dt><dd>{prep.join(", ")}</dd></>}
          <dt>Drops seen</dt><dd className={entry.d.length ? undefined : "realm-unknown"}>{entry.d.length ? entry.d.map(id => item(id).name).join(", ") : "None yet."}</dd>
        </dl>
        {card && cardFound(game, card.id) && <p className="realm-lore">{card.text}</p>}
      </div>
    );
  }
  const mastered = met.filter(each => mastery(game, each.id) >= 3).length, known = (each: MonsterDef) => FACTS.filter(fact => knows(game, each.id, fact) || (fact === "abilities" && !tricksOf(each).length)).length;
  return (
    <div className="realm-quests realm-bestiary">
      <p className="realm-muted">{`Pursuance ${level(game, "slayer")}`} · {`${met.length} creatures in your journal`} · {`${mastered} mastered`}</p>
      <p className="realm-muted">{taskText(game)}</p>
      {met.length === 0 ? <p className="realm-note">Examine a creature, fight one, or read its tracks to begin.</p> : (
        <ul>
          {met.map(each => (
            <li key={each.id}><button type="button" onClick={() => setOpen(each.id)}>
              <span className={`realm-quest-dot mastery-${mastery(game, each.id)}`} aria-hidden="true" /><span className="realm-quest-name">{each.name}</span>
              <small>{`level ${each.level}`} · {`${known(each)}/${FACTS.length}`}{mastery(game, each.id) ? ` · ${MASTERY[mastery(game, each.id)]}` : ""}</small>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
