/**
 * Skill guides and the recipe book, generated from the game's own data so they always match the game. Used by the
 * in-game guide (click a skill) and by the preview site's guide pages.
 */
import {
  BOWS, COOKING, CRAFTING, CROSSBOWS, STOCKS, WAR_BOWS, FIREMAKING, FISHING_SPOTS, FLETCH_ARROWS, FLETCH_BOWS, GEM_CUTTING, ITEM_LIST, METALS, MONSTERS, PRAYERS, ROCKS, SIGILCRAFT,
  SKILL_NAMES, SLAYER_SETS, SLAYER_TASKS, COURSES, WAYFARER_REWARDS, FAMILY_NAMES, SMELTING, SPELLS, TREES, sigilsPerStone, item, type Skill, CARVINGS,
} from "./data.ts";
import { ESSENCES, HERBS, MIXTURES, POTIONS } from "./apothecary.ts";
import { NPCS } from "./content.ts";
import { AMULETS, STALLS, amuletRecipe, carvingRecipes, arrowRecipe, boltRecipe, craftingRecipes, crossbowRecipe, spinningRecipes, stringingRecipe, fletchingRecipes, headlessRecipe, smeltingRecipes, smithingRecipes } from "./engine.ts";
import type { Recipe } from "./state.ts";
import { ORDERS, ORDER_TIERS, orderOf, type OrderId } from "./knights.ts";

export type GuideEntry = { level: number; name: string; detail: string; icon?: string; spell?: string };
const byLevel = (entries: GuideEntry[]) => entries.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
/** Items whose equip requirement names this skill (weapons, armour, tools). In Defence and Faith the Orders' arms are left to orderArms. */
function gear(skill: Skill): GuideEntry[] {
  return ITEM_LIST.flatMap(entry => {
    const needed = entry.equip?.requires?.[skill];
    if (!needed || entry.mastery || ((skill === "defence" || skill === "prayer") && orderOf(entry.id) && entry.id !== "dusk_cape")) return [];
    const bonus = entry.equip!.bonuses, best = Object.entries(bonus).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `+${v} ${k}`).join(", ");
    return [{ level: needed, name: entry.name, detail: `${entry.equip!.slot === "weapon" ? "Wield" : "Wear"}${best ? ` (${best})` : ""}`, icon: entry.id }];
  });
}
/**
 * The Orders' arms, one entry a tier instead of one a piece: the five Orders of Faith together, since their pieces are the
 * same but for the look and the blessing, and the Order of Dusk on its own, since its pieces have names of their own.
 */
function orderArms(skill: "defence" | "prayer"): GuideEntry[] {
  const faith: OrderId[] = ["diamond", "ink", "sol", "hood", "ember"];
  const out = [faith, ["dusk"] as OrderId[]].flatMap(orders => ORDER_TIERS.map(tier => {
    const pieces = ITEM_LIST.filter(entry => entry.id.startsWith(`${orders[0]}_${tier.id}_`) && (skill === "prayer" || entry.equip?.requires?.defence));
    const bonus = pieces.map(entry => entry.equip!.bonuses[skill] ?? 0), names = pieces.map(entry => entry.name.split(" ").slice(2).join(" "));
    const list = `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`, dusk = orders[0] === "dusk";
    return {
      level: skill === "prayer" ? tier.faith : tier.defence, icon: `${orders[0]}_${tier.id}_body`,
      name: dusk ? `Order of Dusk: ${ORDERS.dusk.tiers![tier.id]}` : `Orders of Faith: ${tier.name} (${orders.map(id => ORDERS[id].short).join(", ")})`,
      detail: `${skill === "prayer" ? "Wear or wield" : "Wear"}: ${list} (+${Math.min(...bonus)} to +${Math.max(...bonus)} ${skill} a piece)${skill === "prayer" ? " · faith arms: Faith XP with every hit, and they hurt the undead more" : ""} · ${dusk ? "sold to those sworn to the Order of Dusk" : "sold by each Order's quartermaster to those sworn to it; every Order's set has its own look and blessing"}`,
    };
  }));
  if (skill === "prayer") out.push({ level: 20, icon: "diamond_cape", name: `Orders of Faith capes (${faith.map(id => ORDERS[id].short).join(", ")})`, detail: "Wear (+4 defence, +3 prayer) · each Order's commander gives its cape for the oath" });
  return out;
}
/** Every level-based unlock in a skill, in level order, ending with its mastery cape. */
export function skillGuide(skill: Skill): GuideEntry[] {
  const out: GuideEntry[] = [];
  const add = (level: number, name: string, detail: string, icon?: string) => out.push({ level, name, detail, icon });
  switch (skill) {
    case "attack": out.push(...gear(skill)); break;
    case "defence": out.push(...gear(skill), ...orderArms(skill)); break;
    case "ranged":
      out.push(...gear(skill));
      for (const ammo of ITEM_LIST.filter(entry => entry.ammo)) add(ammo.ammo!.level, ammo.name, `${ammo.ammo!.bolt ? "Fired by any crossbow" : "Fired by any bow"} · +${ammo.ammo!.strength} strength`, ammo.id);
      break;
    case "strength":
      add(1, "Aggressive style", "Train Strength by fighting in the Aggressive style. Every level raises your max hit.");
      add(1, "Heft", "Greatswords, battleaxes and war hammers swing harder the stronger you are: +1% of the weapon's strength bonus for every two Strength levels.");
      out.push(...gear("strength")); break;
    case "hitpoints": add(10, "Hitpoints", "Every combat level-up you train raises your hitpoints. You regenerate 1 HP a minute; eat food to heal.");
      add(10, "The Heartguard", "Red-and-white armour from Mender Hale at the Friendhollow chapel, a piece every ten levels. Each adds a hitpoint and quickens healing 6%; all nine make food heal a quarter more.", "heartguard_helm");
      out.push(...gear("hitpoints")); break;
      for (const food of ITEM_LIST.filter(entry => entry.heal).sort((a, b) => (a.heal ?? 0) - (b.heal ?? 0))) add(1, food.name, `Heals ${food.heal}`, food.id);
      break;
    case "magic": for (const spell of SPELLS) if (spell.skill !== "prayer") out.push({ level: spell.level, name: spell.name, detail: spell.description, spell: spell.id }); out.push(...gear("magic")); add(30, "Sigil satchel", "The Mage's Satchel (Archmage Solenne): a bag that holds 2,000 of every sigil and casts from them", "sigil_satchel"); break;
    case "prayer":
      for (const prayer of PRAYERS) add(prayer.level, prayer.name, prayer.description);
      for (const spell of SPELLS) if (spell.skill === "prayer") out.push({ level: spell.level, name: `Spell: ${spell.name}`, detail: `${spell.description} (Faith tab of the spellbook)`, spell: spell.id });
      out.push(...gear("prayer"), ...orderArms("prayer"));
      for (const bones of ITEM_LIST.filter(entry => entry.bones)) add(1, `Bury ${bones.name.toLowerCase()}`, `${bones.bones} Faith XP (twice that offered on an altar, three times in the Dawnhold chapel)`, bones.id);
      // The Order of the Dawn's faith weapons: a little Faith XP with each hit, and they hurt the undead more.
      for (const weapon of ITEM_LIST.filter(entry => entry.equip?.holy && !orderOf(entry.id))) add(weapon.equip!.requires?.prayer ?? 1, weapon.name, "Faith weapon: Faith XP with every hit, and it hurts the undead more", weapon.id);
      break;
    case "sigilcraft":
      for (const altar of SIGILCRAFT) add(altar.level, `${item(altar.sigil).name}s`, `${altar.xp} XP a stone at the ${item(altar.sigil).name.replace(" sigil", "")} altar; ${sigilsPerStone(altar.level + 11, altar.level)} per stone from level ${altar.level + 11}`, altar.sigil);
      break;
    case "woodcutting":
      for (const tree of Object.values(TREES)) add(tree.level, tree.name, `${tree.xp} XP a log`, tree.log);
      for (const axe of ITEM_LIST.filter(entry => entry.tool?.kind === "axe")) add(axe.tool!.level, axe.name, "Chops faster", axe.id);
      break;
    case "mining":
      for (const [kind, rock] of Object.entries(ROCKS)) add(rock.level, rock.name, `${rock.xp} XP${kind === "sigil" ? " (Wizards' Tower, never runs out)" : ""}`, rock.ore);
      for (const pick of ITEM_LIST.filter(entry => entry.tool?.kind === "pickaxe")) add(pick.tool!.level, pick.name, "Mines faster", pick.id);
      break;
    case "fishing":
      for (const spot of Object.values(FISHING_SPOTS)) for (const fish of spot.catches) add(fish.level, item(fish.fish).name.replace("Raw ", ""), `${fish.xp} XP · ${spot.action} (${item(spot.tool).name.toLowerCase()}${spot.bait ? ` and ${item(spot.bait).name.toLowerCase()}` : ""})`, fish.fish);
      break;
    case "cooking": for (const [raw, cook] of Object.entries(COOKING)) add(cook.level, item(cook.cooked).name, `${cook.xp} XP · stops burning at ${cook.stopBurn}`, raw); break;
    case "firemaking": for (const [log, fire] of Object.entries(FIREMAKING)) add(fire.level, item(log).name, `${fire.xp} XP`, log); break;
    case "smithing":
      for (const metal of METALS) {
        const smelt = SMELTING[metal.id];
        add(smelt.level, `${metal.name} bar`, `${smelt.xp} XP · ${Object.entries(smelt.ores).map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(" + ")}`, `${metal.id}_bar`);
        for (const recipe of smithingRecipes(metal.id)) add(recipe.level, recipe.label, `${recipe.xp} XP · ${Object.values(recipe.inputs)[0]} bar${Object.values(recipe.inputs)[0] > 1 ? "s" : ""}`, Object.keys(recipe.outputs)[0]);
      }
      break;
    case "crafting":
      for (const entry of CRAFTING) add(entry.level, item(entry.product).name, `${entry.xp} XP · ${entry.leather} ${entry.hide ? item(entry.hide).name.toLowerCase() : "leather"}`, entry.product);
      for (const [rough, cut] of Object.entries(GEM_CUTTING)) add(cut.level, item(cut.cut).name, `${cut.xp} XP · cut with a chisel`, rough);
      add(1, "String", "5 XP · wool at a spinning wheel (the farmhouse, Tessa's tannery)", "string");
      add(1, "Dyeing", "14 XP · a pot of dye (the Dyeworks, Dyemoor) on cloth or leather clothing; lye washes it out", "dye_madder");
      for (const carving of CARVINGS) add(carving.level, carving.name, `${carving.xp} XP · a carving gouge on two ${item(carving.log).name.toLowerCase()}. Set it down: near it, ${carving.text}, for ${Math.round(carving.ticks * 0.6 / 60 * 10) / 10} min`, carving.id);
      for (const entry of AMULETS) add(entry.level, item(entry.amulet).name, `${entry.xp} XP · a string on a cut ${entry.gem}`, entry.amulet);
      for (const bow of CROSSBOWS) add(bow.craft, item(`${bow.metal}_crossbow`).name, `${bow.xp} XP · ${item(`${bow.metal}_limbs`).name.toLowerCase()} on ${/^[aeiou]/i.test(item(bow.stock).name) ? "an" : "a"} ${item(bow.stock).name.toLowerCase()}`, `${bow.metal}_crossbow`);
      break;
    case "fletching":
      add(1, "Arrow shafts", "8 XP · a knife on any logs makes 15", "arrow_shaft"); add(1, "Headless arrows", "15 XP for 15 · feathers on shafts", "headless_arrow");
      for (const bow of FLETCH_BOWS) add(bow.level, item(bow.bow).name, `${bow.xp} XP · a knife on ${item(bow.log).name.toLowerCase()}, then a string on the unstrung bow`, bow.bow);
      for (const metal of METALS) add(FLETCH_ARROWS[metal.id].level, `${metal.name} arrows`, `${FLETCH_ARROWS[metal.id].xp} XP each · heads from the anvil`, `${metal.id}_arrow`);
      for (const bow of WAR_BOWS) add(bow.fletch, bow.name, `${bow.xp} XP · a knife on 2 ${item(bow.log).name.toLowerCase()}, then a string`, bow.id);
      for (const stock of STOCKS) add(stock.level, stock.name, `${stock.xp} XP · a knife on ${item(stock.log).name.toLowerCase()} (for a crossbow)`, stock.id);
      for (const metal of METALS) { const recipe = boltRecipe(metal.id); add(recipe.level, `${metal.name} bolts`, `${recipe.xp / 12} XP each · feathers on unfeathered bolts from the anvil`, `${metal.id}_bolts`); }
      break;
    case "thieving":
      add(1, "Sneak", "Walk softly past aggressive monsters: XP each time you slip by unseen. Spends run energy; Stealth makes it cheaper and you harder to spot");
      add(1, "Sneak attack", "Strike a monster that hasn't noticed you: harder and truer, more with Stealth");
      add(50, "Light-footed", "Aggressive monsters notice you from 3 tiles instead of 4, even when you aren't sneaking");
      add(80, "Shadow-footed", "They notice you from only 2 tiles");
      add(60, "Veilweave hood (rare)", "Found in the shadows while slipping past monsters of level 38+; wear it from 70 and stand still to vanish", "veilweave_hood");
      for (const npc of Object.values(NPCS)) if (npc.pickpocket) add(npc.pickpocket.level, `Pickpocket ${npc.name.toLowerCase()}`, `${npc.pickpocket.xp} XP · ${npc.pickpocket.coins[0]}–${npc.pickpocket.coins[1]} coins`);
      for (const [name, stall] of Object.entries(STALLS)) add(stall.level, `${name[0].toUpperCase()}${name.slice(1)} stall`, `${stall.xp} XP · the Oasis market`);
      break;
    case "agility":
      for (const [id, course] of Object.entries(COURSES)) add(course.level, course.name, `${id === "friendhollow" ? "Five obstacles west of the castle" : id === "dunes" ? "Six obstacles south-east of the Oasis" : "Six obstacles north of the Frostpeak camp"}: +${course.lapXp} XP and ${course.marks} Wayfarer's mark${course.marks > 1 ? "s" : ""} a lap`);
      add(1, "Run energy", "Comes back faster and drains slower with every level (40% slower at 99)");
      add(1, "Sure footing", "Hard obstacles can be slipped on: a fifth of the time at their level, never twelve levels above it");
      add(1, "Carrying weight", "Everything worn weighs something (Worn equipment shows it): forty kilograms doubles how fast running drains. Round shields and plate are the heavy things.");
      add(30, "Packhorse", "A quarter of your load no longer counts against your run energy"); add(60, "Long strides", "Half of it"); add(90, "Light as a Friend", "Three quarters of it");
      add(20, "Murkmire stepping stones", "A shortcut over the bog river");
      for (const reward of WAYFARER_REWARDS) if (reward.id !== "waybread") add(item(reward.id).equip?.requires?.agility ?? 1, reward.name, `${reward.cost} marks from Coach Skip · ${reward.text.replace(/ \(Wayfaring \d+\)/, "")}`, reward.id);
      add(1, "Waybread", "1 mark for 3 from Coach Skip · 40 run energy each", "waybread");
      break;
    case "apothecary":
      add(1, "Pick herbs", "Every ecosystem grows its own: forest, swamp, mountain, the Deadwood, Ashfall, coast and desert. Pick (level by herb), then Clean.");
      for (const herb of HERBS) add(herb.level, herb.name, `${herb.rarity[0].toUpperCase()}${herb.rarity.slice(1)} · ${herb.eco === "deadwood" ? "the Deadwood" : herb.eco === "ashfall" ? "Ashfall" : `${herb.eco} regions`} · ${herb.xp} XP a pick`, `clean_${herb.id}`);
      add(10, "Grind", "A pestle and mortar on a clean herb grinds it for the stronger brews.", "mortar");
      for (const essence of ESSENCES) add(essence.level, essence.name, `Distil two ${item(`clean_${essence.herb}`).name.toLowerCase()} at the still in Hollyhock`, essence.id);
      for (const potion of POTIONS) add(potion.level, potion.name, `${potion.examine} (${Object.entries(potion.inputs).filter(([id]) => id !== "vial_of_water").map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(", ")}, in a vial of water)`, potion.id);
      for (const mix of MIXTURES) add(mix.level, mix.name, `For ${FAMILY_NAMES[mix.family]} Friends only: ${mix.effect.toLowerCase()} for ten minutes`, mix.id);
      break;
    case "presence":
      add(1, "Presence", "The mark you leave on the world. Earned by discovering regions, finishing quests, felling bosses, rare finds, people met, rumours heard, work orders filled, your Friend, your name and the clothes you're seen in. The slowest skill in the Realm.");
      add(1, "Title: Newcomer", "Everyone starts somewhere. Titles show when players examine you.");
      add(10, "Title: Wanderer of the Realm", "Your Friend starts remarking on places you come back to.");
      add(20, "People notice you", "Townsfolk you've met greet you with \"Back already?\". The Namekeeper offers A Name Worth Knowing (with a name).");
      add(20, "Wanderer's cloak", "From A Name Worth Knowing · Presence grows a fifth faster", "wanderers_cloak");
      add(25, "Title: Traveller", "Presence 25.");
      add(30, "Memory moments", "Your Friend recalls firsts: the first dragon, the first death, the first Hollow.");
      add(40, "Known by name", "Townsfolk greet you by your name. Title: Adventurer. Archivist Perrin offers Known in Every Hall.");
      add(40, "Chronicler's mantle", "From Known in Every Hall · work orders pay 15% more", "chroniclers_mantle");
      add(40, "Storyteller's hat", "From Known in Every Hall", "storytellers_hat");
      add(50, "Personality", "Your Friend's own tendencies show in what it says: explorer, warrior, scholar, collector, socialite.");
      add(60, "Title: Seasoned Adventurer", "King Hollis offers The Remembered.");
      add(60, "Blade of Renown", "From The Remembered · strength grows with Presence (one for every four levels)", "blade_of_renown");
      add(60, "Cape of Renown", "From The Remembered · Presence grows a third faster", "cape_of_renown");
      add(70, "Everyone knows you", "\"Everyone here knows\" your name, in every village you've spent time in.");
      add(80, "Title: Legend of the Realm", "Presence 80.");
      add(99, "Title: Presence of the Realm", "Presence 99.");
      break;
    case "slayer":
      for (const task of SLAYER_TASKS) add("slayer" in task ? task.slayer : 1, `Task: ${task.name}`, `From combat level ${task.min}`);
      for (const monster of Object.values(MONSTERS)) if (monster.slayer) add(monster.slayer, monster.name, "Only a Slayer can wound it");
      add(20, "Warden's helm", "150 points · +15% accuracy and damage on task", "slayer_helm");
      add(30, "Warden's bracers", "250 points · +10% Slayer XP on task", "warden_bracers");
      add(1, "Longer tasks", "100 points · tasks and their points half as big again (switch it off for free)");
      for (const set of SLAYER_SETS) add(set.slayer, `${set.name} armour`, `Dropped by ${MONSTERS[set.monster].name.toLowerCase()}s · ${set.effect}`, `${set.id}_${set.pieces[0].suffix}`);
      break;
  }
  add(99, `${SKILL_NAMES[skill]} mastery cape`, "99,000 coins from the Keeper of Capes (trimmed with two 99s)", `${skill}_cape`);
  return byLevel(out);
}

// ---------- The recipe book ----------
export type BookRecipe = Recipe & { where: string };
/** Everything you can make, by skill. */
export function recipeBook(): BookRecipe[] {
  const at = (where: string) => (recipe: Recipe): BookRecipe => ({ ...recipe, where });
  return [
    ...smeltingRecipes().map(at("Furnace")),
    ...METALS.flatMap(metal => smithingRecipes(metal.id)).map(at("Anvil (hammer)")),
    ...Object.entries(COOKING).map(([raw, cook]): BookRecipe => ({ skill: "cooking", label: item(cook.cooked).name, level: cook.level, xp: cook.xp, ticks: 3, inputs: { [raw]: 1 }, outputs: { [cook.cooked]: 1 }, where: "Range or fire" })),
    ...craftingRecipes().map(at("Anywhere (needle and thread)")),
    ...CARVINGS.flatMap(carving => carvingRecipes(carving.log)).map(at("Anywhere (carving gouge on logs)")),
    ...Object.entries(GEM_CUTTING).map(([rough, cut]): BookRecipe => ({ skill: "crafting", label: item(cut.cut).name, level: cut.level, xp: cut.xp, ticks: 2, inputs: { [rough]: 1 }, outputs: { [cut.cut]: 1 }, tools: ["chisel"], where: "Anywhere (chisel)" })),
    ...fletchingRecipes("logs").slice(0, 1).map(at("Anywhere (knife on logs)")),
    ...FLETCH_BOWS.map(bow => fletchingRecipes(bow.log)[1]).map(at("Anywhere (knife on logs)")),
    at("Anywhere")(headlessRecipe()),
    ...METALS.map(metal => arrowRecipe(metal.id)).map(at("Anywhere")),
    ...FLETCH_BOWS.flatMap(bow => fletchingRecipes(bow.log).slice(2)).map(at("Anywhere (knife on logs)")),
    ...METALS.map(metal => boltRecipe(metal.id)).map(at("Anywhere (feathers on bolts)")),
    ...CROSSBOWS.map(bow => crossbowRecipe(bow.metal)).map(at("Anywhere (limbs on a stock)")),
    ...spinningRecipes().map(at("Spinning wheel")),
    ...[...FLETCH_BOWS.map(bow => bow.bow), ...WAR_BOWS.map(bow => bow.id)].map(id => stringingRecipe(`${id}_u`)!).map(at("Anywhere (string on the bow)")),
    ...AMULETS.map(entry => amuletRecipe(entry.gem)).map(at("Anywhere (string on the gem)")),
    ...SIGILCRAFT.map((altar): BookRecipe => ({ skill: "sigilcraft", label: item(altar.sigil).name, level: altar.level, xp: altar.xp, ticks: 1, inputs: { sigil_stone: 1 }, outputs: { [altar.sigil]: 1 }, where: `${item(altar.sigil).name.replace(" sigil", "")} altar` })),
  ];
}
/** The bows and arrows each Ranged level unlocks (for the guide's summary). */
export const rangedSummary = () => BOWS.map(bow => `${bow.name} (${bow.level})`).join(", ");
