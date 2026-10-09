/** The skill guides page: the game's own guide data (games/rarefriends-realm/guide.ts), rendered as tables. */
import { SKILLS, SKILL_NAMES, SPELLS, item, type Skill } from "../../games/rarefriends-realm/data.ts";
import { recipeBook, skillGuide } from "../../games/rarefriends-realm/guide.ts";
import { artUrl, itemArt, skillArt, spellArt } from "../../games/rarefriends-realm/icons.ts";

const INTRO: Record<Skill, string> = {
  attack: "Accuracy in melee. Fight in the Accurate style. Higher levels wield better weapons.",
  strength: "Max hit in melee. Fight in the Aggressive style.",
  defence: "Avoid hits. Fight in the Defensive style, or train it with Longrange. Higher levels wear better armour.",
  ranged: "Bows fire the best arrows in your pack. Accurate, Rapid (faster) and Longrange (+2 tiles) styles.",
  hitpoints: "Your health. Every hit you land in combat trains it. Eat to heal.",
  magic: "Spells paid in sigils: combat, curses, utility and teleports. Elemental staffs give free sigils of their element.",
  prayer: "Bury bones, or offer them on an altar (three times the XP in the Dawnhold chapel). Pray at altars to restore your faith; prayers boost your stats while they drain. The Order of the Dawn's weapons train Faith with every hit.",
  sigilcraft: "Mine sigil stones in the Wizards' Tower and press them at the eleven altars across the Realm.",
  woodcutting: "Chop trees for logs. Better axes chop faster.",
  fletching: "A knife on logs makes shafts or bows; feathers and anvil-smithed heads finish arrows.",
  fishing: "Nets, rods, cages and harpoons at spots around the Realm.",
  cooking: "Cook on a range or your own fire. You stop burning food at higher levels.",
  firemaking: "Light logs with a tinderbox. Cook on the fire.",
  mining: "Mine ore in the Ashen Hills, at the Emberforge and on Frostpeak. Better pickaxes mine faster.",
  smithing: "Smelt ore at a furnace, then hammer bars into weapons, armour and arrowheads at an anvil.",
  crafting: "Stitch leather and drakehide into armour, and cut gems with a chisel.",
  thieving: "Sneak past aggressive monsters unseen (a new toggle beside Run), strike from the shadows, pickpocket townsfolk and steal from the Oasis market stalls. Get caught and it hurts.",
  agility: "Obstacle courses and shortcuts. Agility restores run energy faster.",
  slayer: "Warden Thistle gives contracts: put creatures down, read their tracks or study them. Contracts give Pursuance XP and points, and every new fact about a creature pays once.",
  apothecary: "Gather the Realm's herbs region by region, clean, grind and brew them into tonics, potions, poisons and antidotes at Mother Yarrow's bench in Hollyhock.",
  presence: "The mark you leave on the world: discovery, quests, bosses, rare finds, your Friend, your outfits and your name. Shown as your character's profile.",
};
const img = (canvas: HTMLCanvasElement, alt = "") => `<img src="${artUrl(canvas)}" alt="${alt}" loading="lazy">`;
const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const guide = document.getElementById("guide")!, picker = document.getElementById("picker")!;

function showSkill(skill: Skill) {
  const rows = skillGuide(skill).map(entry => {
    const icon = entry.icon ? img(itemArt(item(entry.icon).icon)) : entry.spell ? (() => { const spell = SPELLS.find(s => s.id === entry.spell)!; return img(spellArt(spell.id, spell.element, spell.kind)); })() : img(skillArt(skill));
    return `<tr><td class="level">${entry.level}</td><td class="icon">${icon}</td><td><b>${escape(entry.name)}</b><br><small>${escape(entry.detail)}</small></td></tr>`;
  }).join("");
  guide.innerHTML = `<h2>${img(skillArt(skill))} ${SKILL_NAMES[skill]}</h2><p class="intro">${INTRO[skill]}</p>
    <table><thead><tr><th>Level</th><th class="icon"></th><th>Unlocks</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function showBook(filter = "", skill = "all") {
  const book = recipeBook(), skills = [...new Set(book.map(recipe => recipe.skill))];
  // A search finds a recipe by its English name or its name in the language shown (lang.ts).
  const t = (window as unknown as { realmT?: (text: string) => string }).realmT ?? (text => text);
  const matches = (name: string) => name.toLowerCase().includes(filter) || t(name).toLowerCase().includes(filter);
  const rows = book.filter(recipe => (skill === "all" || recipe.skill === skill) && (!filter || matches(recipe.label) || Object.keys(recipe.inputs).some(id => matches(item(id).name))))
    .map(recipe => `<tr><td class="level">${recipe.level}</td><td class="icon">${img(itemArt(item(Object.keys(recipe.outputs)[0]).icon))}</td>
      <td><b>${escape(recipe.label)}</b><br><small>${SKILL_NAMES[recipe.skill]} · ${recipe.xp} XP · ${escape(recipe.where)}</small></td>
      <td><span class="inputs">${Object.entries(recipe.inputs).map(([id, n]) => `<span title="${escape(item(id).name)}">${img(itemArt(item(id).icon), item(id).name)}${n}</span>`).join("")}</span></td></tr>`).join("");
  guide.innerHTML = `<h2>Recipe book</h2><p class="intro">Everything you can make, with its level, XP and ingredients.</p>
    <div class="search"><input id="q" type="search" placeholder="Search recipes or ingredients" value="${escape(filter)}" aria-label="Search recipes">
    <select id="s" aria-label="Skill"><option value="all">All skills</option>${skills.map(entry => `<option value="${entry}"${entry === skill ? " selected" : ""}>${SKILL_NAMES[entry]}</option>`).join("")}</select></div>
    <table><thead><tr><th>Level</th><th class="icon"></th><th>Recipe</th><th>Needs</th></tr></thead><tbody>${rows || `<tr><td colspan="4">No recipes match.</td></tr>`}</tbody></table>`;
  const q = document.getElementById("q") as HTMLInputElement, s = document.getElementById("s") as HTMLSelectElement;
  q.oninput = () => { const at = q.selectionStart; showBook(q.value.toLowerCase(), s.value); const again = document.getElementById("q") as HTMLInputElement; again.focus(); again.setSelectionRange(at, at); };
  s.onchange = () => showBook(q.value.toLowerCase(), s.value);
}
const select = (key: string) => {
  for (const button of picker.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.key === key));
  if (key === "recipes") showBook(); else showSkill(key as Skill);
  history.replaceState(null, "", `#${key}`);
};
picker.innerHTML = [...SKILLS.map(skill => `<button type="button" data-key="${skill}">${img(skillArt(skill))}${SKILL_NAMES[skill]}</button>`), `<button type="button" data-key="recipes">📖 Recipe book</button>`].join("");
picker.addEventListener("click", event => { const button = (event.target as HTMLElement).closest("button"); if (button?.dataset.key) select(button.dataset.key); });
const start = location.hash.slice(1);
select((SKILLS as readonly string[]).includes(start) || start === "recipes" ? start : "attack");
