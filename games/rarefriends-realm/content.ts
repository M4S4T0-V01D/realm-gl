/**
 * NPCs, their dialogue and the Realm's quests. Dialogue is built on demand from the player's quest state.
 */
import { COURSES, FAMILY_NAMES, FAMILY_PERKS, SLAYER_REWARDS, WAYFARER_MARK, WAYFARER_REWARDS, item , REGIONAL_CLOTHING, SKILL_NAMES } from "./data.ts";
import { assignTask, buySlayerReward, currentTask, eligibleTasks, slayerPoints, slayerStreak, taskText } from "./slayer.ts";
import { TROPHY_POINTS, research, researchCost, researchable } from "./pursuance.ts";
import { buyWayfarerReward } from "./wayfaring.ts";
import { REPUTATION_PLACES, RENAME_COST, onQuestCompleted, playerName, presenceLevel, reputation, unlockedTitles } from "./presence.ts";
import { PATRONS, askText, currentOrder, fillOrder, orderText } from "./orders.ts";
import { HOME_TIERS, buyHome, homeDeed } from "./housing.ts";
import { friendSays, remember } from "./friend.ts";
import { rumourAt } from "./rumours.ts";
import { FOE_GROUPS, MATCHES, customMatch, entryFee, startMatch } from "./arena.ts";
import { ORDERS, ORDER_IDS } from "./knights.ts";
import { WEST_NPCS, WEST_QUESTS, onWestAltar, onWestKill, talkWest, westShopProblem } from "./raria.ts";
import { BAR_NPCS, BAR_QUEST_DEFS, jobBoard, onBountyKill, talkBar } from "./bars.ts";
/** A bar's job board (bars.ts), for the engine (which reaches the bars through here, so they load after this module). */
export const readJobBoard = (game: Game, barId: string) => jobBoard(game, barId);
import {
  addXp, combatLevel, count, give, giveOrDrop, has, level, message, sound, take, emit, BONE_BAG, ownsBoneBag, type Dialogue, type DialogueLine, type Game,
} from "./state.ts";

// ---------- NPC definitions ----------
export type NpcDef = {
  id: string; name: string; examine: string; options: readonly string[];
  art: { canonical: 7730 | 3412 } | { family: number; seed: number };
  shop?: string;
  /** Drawn as this mount instead of a Friend (the paddock horses). */
  mount?: string;
  pickpocket?: { level: number; xp: number; coins: readonly [number, number]; stun: number; damage: number; extra?: readonly [string, number][] };
};
const art = (family: number, seed: number) => ({ family, seed });
export const NPCS: Record<string, NpcDef> = {
  guide: { id: "guide", name: "Realm Guide", examine: "Knows the Realm by heart.", options: ["Talk-to"], art: art(5, 11) },
  glimmer: { id: "glimmer", name: "Old Glimmer", examine: "Friend #7730. A Hoverer who remembers when the Realm was new.", options: ["Talk-to"], art: { canonical: 7730 } },
  // The Rare Friends Ring (2026-10): the arena west of the Deadwood.
  ringmaster: { id: "ringmaster", name: "Ringmaster Vell Harrow", examine: "Runs the Rare Friends Ring. Has seen every match since the Ringmaker's day, or says so.", options: ["Talk-to"], art: art(6, 701) },
  ring_apothecary: { id: "ring_apothecary", name: "Sister Mallow", examine: "Sells what puts fighters back together.", options: ["Talk-to", "Trade"], shop: "ring_potions", art: art(3, 702) },
  ring_chaplain: { id: "ring_chaplain", name: "Chaplain Orrin", examine: "Keeps the Ring's chapel stores: faith for those who fight by it.", options: ["Talk-to", "Trade"], shop: "ring_faith", art: art(2, 703) },
  ring_sigilist: { id: "ring_sigilist", name: "Thessaly Vane", examine: "Sigils and staffs for the Ring's mages.", options: ["Talk-to", "Trade"], shop: "ring_mage", art: art(5, 704) },
  ring_fletcher: { id: "ring_fletcher", name: "Brisk Arrowyn", examine: "Bows and arrows for the Ring's archers.", options: ["Talk-to", "Trade"], shop: "ring_range", art: art(4, 705) },
  ring_armourer: { id: "ring_armourer", name: "Gorm Ironhand", examine: "Metal armour and blades, for coin.", options: ["Talk-to", "Trade"], shop: "ring_armour", art: art(6, 706) },
  ring_weaponsmith: { id: "ring_weaponsmith", name: "Hilde Edgewright", examine: "Sharpens everything twice. Sells it once.", options: ["Talk-to", "Trade"], shop: "ring_weapons", art: art(1, 709) },
  ring_quartermaster: { id: "ring_quartermaster", name: "The Pit Quartermaster", examine: "Takes bloodmarks and nothing else. Sells the Ring's own armour.", options: ["Talk-to", "Trade"], shop: "ring_pit", art: art(0, 707) },
  ring_champion: { id: "ring_champion", name: "Laurel Keeper Ismay", examine: "Keeps the Champions' Hall. Takes laurels, the coin of Friend Fights.", options: ["Talk-to", "Trade"], shop: "ring_champions", art: art(7, 708) },
  // The four Orders (2026-10): commanders, quartermasters and guards, all on the knights' stout frame.
  ...Object.fromEntries(ORDER_IDS.filter(id => !ORDERS[id].city).flatMap(id => { const order = ORDERS[id], seed = ({ diamond: 800, ink: 810, sol: 820, hood: 830, ember: 850 } as Record<string, number>)[id] ?? 860; return [
    [`${id}_commander`, { id: `${id}_commander`, name: order.leaderName, examine: `Commander of the ${order.name}. Swears in those who prove their faith.`, options: ["Talk-to"], art: art(10, seed) }],
    [`${id}_quartermaster`, { id: `${id}_quartermaster`, name: `${order.short} quartermaster`, examine: `Keeps the ${order.name}'s armoury. Sells to the sworn.`, options: ["Talk-to", "Trade"], shop: `${id}_armoury`, art: art(10, seed + 1) }],
    [`${id}_guard`, { id: `${id}_guard`, name: `${order.short} knight`, examine: `A knight of the ${order.name}, in its colours.`, options: ["Talk-to"], art: art(10, seed + 2) }],
  ]; })),
  // The Deadwood Maidens (2026-10): hostile until the truce, then the best market in the Realm for what's hard to find.
  maiden_matriarch: { id: "maiden_matriarch", name: "Matriarch Ysolde Thornveil", examine: "Leads the Deadwood Maidens. Has buried more of the dead than Gravesend has.", options: ["Talk-to"], art: art(3, 840) },
  maiden_trader: { id: "maiden_trader", name: "Wren of the Maidens", examine: "Keeps the Maidens' market: what the Deadwood gives up, and what they take from its dead.", options: ["Talk-to", "Trade"], shop: "maidens_market", art: art(3, 841) },
  maidens_villager: { id: "maidens_villager", name: "Deadwood Maiden", examine: "A Maiden off watch. Still armed.", options: ["Talk-to"], art: art(9, 842) },
  ...WEST_NPCS,
  ...BAR_NPCS,
  mender: { id: "mender", name: "Mender Hale", examine: "The chapel's mender. Her hands are always clean and her apron never is.", options: ["Talk-to", "Trade"], shop: "mender", art: art(3, 318) },
  // The wider world's villages (2026-10). Each village's people wear its own clothes (NPC_WEAR / regionalLook in render.ts).
  gravesend_keeper: { id: "gravesend_keeper", name: "Warden Mira Thorne", examine: "Gravesend's gravekeeper. She knows every name on every stone.", options: ["Talk-to"], art: art(2, 501) },
  gravesend_clothier: { id: "gravesend_clothier", name: "Old Wick", examine: "Sews mourning wear, and has for sixty years.", options: ["Talk-to", "Trade"], shop: "gravesend_clothier", art: art(7, 502) },
  gravesend_trader: { id: "gravesend_trader", name: "Lantern-seller Pip", examine: "Sells lanterns, candles and whatever else keeps the dark off.", options: ["Talk-to", "Trade"], shop: "gravesend_general", art: art(0, 503) },
  gravesend_villager: { id: "gravesend_villager", name: "Gravesend villager", examine: "Pale, quiet, and unbothered by the Deadwood.", options: ["Talk-to"], art: art(9, 504) },
  saltmarrow_harbour: { id: "saltmarrow_harbour", name: "Harbourmaster Brine", examine: "Runs the docks and the Salt Tithe. Barnacled.", options: ["Talk-to"], art: art(4, 511) },
  saltmarrow_fishmonger: { id: "saltmarrow_fishmonger", name: "Nell Gutting", examine: "Can fillet a sailfish in the time it takes to say so.", options: ["Talk-to", "Trade"], shop: "saltmarrow_fish", art: art(3, 512) },
  saltmarrow_clothier: { id: "saltmarrow_clothier", name: "Sal Oilskin", examine: "Waxes canvas by the yard.", options: ["Talk-to", "Trade"], shop: "saltmarrow_clothier", art: art(1, 513) },
  saltmarrow_villager: { id: "saltmarrow_villager", name: "Saltmarrow fisher", examine: "Smells of the sea. Proudly.", options: ["Talk-to"], art: art(9, 514) },
  hollyhock_apothecary: { id: "hollyhock_apothecary", name: "Mother Yarrow", examine: "Hollyhock's apothecary. Her garden is the finest in the Realm, and she knows it.", options: ["Talk-to", "Trade"], shop: "hollyhock_herbs", art: art(5, 521) },
  hollyhock_clothier: { id: "hollyhock_clothier", name: "Posy Wren", examine: "Prints leaves on everything.", options: ["Talk-to", "Trade"], shop: "hollyhock_clothier", art: art(6, 522) },
  hollyhock_villager: { id: "hollyhock_villager", name: "Hollyhock gardener", examine: "Soil under every fingernail.", options: ["Talk-to"], art: art(9, 523) },
  dyemoor_dyer: { id: "dyemoor_dyer", name: "Master Dyer Indigo Vell", examine: "His hands have been blue since he was nine.", options: ["Talk-to", "Trade"], shop: "dyemoor_dyes", art: art(8, 531) },
  dyemoor_guildmistress: { id: "dyemoor_guildmistress", name: "Guildmistress Carmine Hale", examine: "Head of the Dyers' Guild, in a coat of every colour the guild owns the secret of.", options: ["Talk-to"], art: art(3, 541) },
  dyemoor_wardrober: { id: "dyemoor_wardrober", name: "Sable Wren", examine: "Keeps a rail of every village's clothes, and can tell you where each was cut.", options: ["Talk-to", "Trade"], shop: "dyemoor_wardrobe", art: art(6, 542) },
  dyemoor_loomkeeper: { id: "dyemoor_loomkeeper", name: "Ottoline Weft", examine: "Trades across the mountains for cloth from Raria, the Federation and BarkReach.", options: ["Talk-to", "Trade"], shop: "dyemoor_farloom", art: art(1, 543) },
  dyemoor_rosekeeper: { id: "dyemoor_rosekeeper", name: "Rosamund Madder", examine: "Shirts, dresses and trousers for every day, in every colour the vats can give.", options: ["Talk-to", "Trade"], shop: "dyemoor_madder", art: art(7, 544) },
  dyemoor_clothier: { id: "dyemoor_clothier", name: "Marigold Hem", examine: "Dyemoor's finest cut, and the loudest.", options: ["Talk-to", "Trade"], shop: "dyemoor_clothier", art: art(1, 532) },
  dyemoor_tailor: { id: "dyemoor_tailor", name: "Bolt", examine: "Sells thread, cloth and capes by the armful.", options: ["Talk-to", "Trade"], shop: "dyemoor_tailor", art: art(0, 533) },
  dyemoor_villager: { id: "dyemoor_villager", name: "Dyemoor villager", examine: "Dressed in colours the rest of the Realm hasn't heard of.", options: ["Talk-to"], art: art(9, 534) },
  tallgrass_huntmaster: { id: "tallgrass_huntmaster", name: "Huntmaster Fenn", examine: "Reads tracks like other people read signs.", options: ["Talk-to"], art: art(3, 541) },
  tallgrass_outfitter: { id: "tallgrass_outfitter", name: "Ash Quiverly", examine: "Bows, arrows, hides and a story for each.", options: ["Talk-to", "Trade"], shop: "tallgrass_hunting", art: art(6, 542) },
  tallgrass_clothier: { id: "tallgrass_clothier", name: "Lark", examine: "Sews clothes you can't see in the grass.", options: ["Talk-to", "Trade"], shop: "tallgrass_clothier", art: art(3, 543) },
  tallgrass_villager: { id: "tallgrass_villager", name: "Tallgrass hunter", examine: "Still as a heron.", options: ["Talk-to"], art: art(9, 544) },
  cragmaw_foreman: { id: "cragmaw_foreman", name: "Foreman Durga Pike", examine: "Runs the Cragmaw mine, and misses nothing that comes out of it.", options: ["Talk-to"], art: art(6, 551) },
  cragmaw_armourer: { id: "cragmaw_armourer", name: "Brenna Anvilsong", examine: "Ironreach's master smith. Her glimmer and rarite work is the finest in the Realm, and priced like it.", options: ["Talk-to", "Trade"], shop: "cragmaw_armoury", art: art(6, 555) },
  cragmaw_ore: { id: "cragmaw_ore", name: "Gristle", examine: "Buys ore by weight and sells it by the lie.", options: ["Talk-to", "Trade"], shop: "cragmaw_ore", art: art(6, 552) },
  cragmaw_clothier: { id: "cragmaw_clothier", name: "Hearthkeeper Olwen", examine: "Keeps the one warm room in Cragmaw, and sells the coats to leave it in.", options: ["Talk-to", "Trade"], shop: "cragmaw_clothier", art: art(0, 553) },
  cragmaw_villager: { id: "cragmaw_villager", name: "Cragmaw miner", examine: "Soot to the eyebrows.", options: ["Talk-to"], art: art(9, 554) },
  quillhaven_archivist: { id: "quillhaven_archivist", name: "Archivist Perrin Quill", examine: "Keeper of the Quillhaven library. Shushes you before you've spoken.", options: ["Talk-to"], art: art(5, 561) },
  quillhaven_scribe: { id: "quillhaven_scribe", name: "Scribe Nettle", examine: "Copies sigils into books, and sells both.", options: ["Talk-to", "Trade"], shop: "quillhaven_sigils", art: art(8, 562) },
  quillhaven_clothier: { id: "quillhaven_clothier", name: "Brother Folio", examine: "Keeps the vestry: robes, caps and capes for the scholarly.", options: ["Talk-to", "Trade"], shop: "quillhaven_clothier", art: art(5, 563) },
  quillhaven_villager: { id: "quillhaven_villager", name: "Quillhaven scholar", examine: "Reading while walking. Hasn't fallen in the sea yet.", options: ["Talk-to"], art: art(9, 564) },
  ashfall_trader: { id: "ashfall_trader", name: "Ember Tamsin", examine: "Camps at the edge of the dragons' country and sells what she finds in the ash.", options: ["Talk-to", "Trade"], shop: "ashfall_trader", art: art(7, 571) },
  steward: { id: "steward", name: "Steward Alder", examine: "Keeps the deeds for Homestead Row. Has a key for every door and a price for every one.", options: ["Talk-to"], art: art(9, 808) },
  namekeeper: { id: "namekeeper", name: "Namekeeper Elian", examine: "Keeps the Realm's register of names. A number tells him which Friend you are; a name tells him who you became.", options: ["Talk-to"], art: art(5, 777) },
  priest: { id: "priest", name: "Brother Ossic", examine: "Friend #3412. A Skeleton who tends the chapel of the Old Friend.", options: ["Talk-to"], art: { canonical: 3412 } },
  banker: { id: "banker", name: "Banker", examine: "Good with money.", options: ["Talk-to", "Bank"], art: art(1, 21) },
  shop_general: { id: "shop_general", name: "Shopkeeper", examine: "Sells a bit of everything.", options: ["Talk-to", "Trade"], shop: "general", art: art(2, 31) },
  trader_ember: { id: "trader_ember", name: "Cinder the trader", examine: "Runs Emberforge's general store. Buys anything that isn't on fire.", options: ["Talk-to", "Trade"], shop: "general_ember", art: art(4, 351) },
  trader_frost: { id: "trader_frost", name: "Tundra Tam", examine: "Keeps the trading post, and the only warm stove on the peak.", options: ["Talk-to", "Trade"], shop: "general_frost", art: art(7, 361) },
  trader_oasis: { id: "trader_oasis", name: "Saffi the trader", examine: "Buys and sells a bit of everything, under a very large parasol.", options: ["Talk-to", "Trade"], shop: "general_oasis", art: art(1, 371) },
  stablemaster: { id: "stablemaster", name: "Marigold the stablemaster", examine: "Smells of hay and saddle soap. Knows every horse in the Realm by name.", options: ["Talk-to", "Stables"], art: art(3, 381) },
  paddock_horse: { id: "paddock_horse", name: "Horse", examine: "A chestnut horse, grazing. It has an eye on your pockets.", options: ["Stroke"], art: art(0, 1), mount: "chestnut_horse" },
  paddock_grey: { id: "paddock_grey", name: "Horse", examine: "A dapple grey, dozing in the sun.", options: ["Stroke"], art: art(0, 1), mount: "grey_horse" },
  paddock_unicorn: { id: "paddock_unicorn", name: "Unicorn", examine: "A real unicorn. It's pretending not to notice you.", options: ["Stroke"], art: art(0, 1), mount: "unicorn" },
  pike: { id: "pike", name: "Pike", examine: "Smells faintly of bait.", options: ["Talk-to", "Trade"], shop: "fishing", art: art(3, 41) },
  axel: { id: "axel", name: "Axel", examine: "Sells axes. And pickaxes, grudgingly.", options: ["Talk-to", "Trade"], shop: "axes", art: art(6, 51) },
  armsmaster: { id: "armsmaster", name: "Armsmaster Vey", examine: "Sells swords, shields and the odd cuirass.", options: ["Talk-to", "Trade"], shop: "swords", art: art(4, 61) },
  runa: { id: "runa", name: "Runa", examine: "Her shop hums.", options: ["Talk-to", "Trade"], shop: "sigils", art: art(8, 71) },
  tanner: { id: "tanner", name: "Tessa", examine: "The tanner. Her hands are stained brown.", options: ["Talk-to", "Trade", "Tan-hides"], shop: "crafting", art: art(2, 81) },
  king: { id: "king", name: "King Hollis", examine: "King of Friendhollow. His crown is a little too big for him.", options: ["Talk-to"], art: art(1, 7) },
  royal_guard: { id: "royal_guard", name: "Royal guard", examine: "Guards the King. Takes it very seriously.", options: ["Talk-to"], art: art(0, 223) },
  // The Order of the Dawn, at Dawnhold east of Highcairn: holy knights, the Faith skill's home.
  grandmaster: { id: "grandmaster", name: "Grandmaster Aldric", examine: "The Grandmaster of the Order of the Dawn. He stands like the sun is about to come up behind him.", options: ["Talk-to"], art: art(6, 404) },
  chaplain: { id: "chaplain", name: "Sister Maren", examine: "The Order's chaplain. Her candles never seem to burn down.", options: ["Talk-to"], art: art(2, 77) },
  quartermaster: { id: "quartermaster", name: "Quartermaster Bram", examine: "Keeps the Order's armoury. Counts every blade twice.", options: ["Talk-to", "Trade"], shop: "armoury", art: art(0, 512) },
  dawn_knight: { id: "dawn_knight", name: "Knight of the Dawn", examine: "A knight of the Order of the Dawn, on watch.", options: ["Talk-to"], art: art(0, 145) },
  captain: { id: "captain", name: "Captain Rook", examine: "Captain of the castle guard.", options: ["Talk-to"], art: art(6, 91) },
  guard: { id: "guard", name: "Hall guard", examine: "He looks bored.", options: ["Talk-to", "Pickpocket"], art: art(0, 101),
    pickpocket: { level: 40, xp: 46.8, coins: [20, 40], stun: 5, damage: 2 } },
  cook: { id: "cook", name: "Cook Mabel", examine: "The castle cook. She looks worried.", options: ["Talk-to"], art: art(3, 111) },
  emporium: { id: "emporium", name: "Relic keeper", examine: "Keeper of the Rare Casket chest.", options: ["Talk-to", "Caskets"], art: art(7, 121) },
  villager: { id: "villager", name: "Villager", examine: "One of the Realm's many Friends.", options: ["Talk-to", "Pickpocket"], art: art(9, 131),
    pickpocket: { level: 1, xp: 8, coins: [3, 12], stun: 4, damage: 1 } },
  miller: { id: "miller", name: "Miller Dunn", examine: "Flour on every surface.", options: ["Talk-to"], art: art(2, 141) },
  miner: { id: "miner", name: "Old miner", examine: "Coughs a lot.", options: ["Talk-to", "Trade"], shop: "mine_supplies", art: art(6, 151) },
  smith: { id: "smith", name: "Brann the smith", examine: "The Emberforge smith. His forge is cold.", options: ["Talk-to"], art: art(6, 161) },
  outfitter: { id: "outfitter", name: "Frostpeak outfitter", examine: "Wrapped in six scarves.", options: ["Talk-to", "Trade"], shop: "frost", art: art(3, 171) },
  fisher: { id: "fisher", name: "Old fisher", examine: "Hasn't moved from the pier in years.", options: ["Talk-to"], art: art(5, 181) },
  merchant: { id: "merchant", name: "Oasis merchant", examine: "Sells anything that fits on a camel.", options: ["Talk-to", "Trade", "Pickpocket"], shop: "oasis", art: art(1, 191),
    pickpocket: { level: 25, xp: 26, coins: [10, 30], stun: 5, damage: 2, extra: [["silk", 0.1], ["cake", 0.15]] } },
  witch: { id: "witch", name: "Bog witch", examine: "She's stirring something that stirs back.", options: ["Talk-to"], art: art(8, 201) },
  agility: { id: "agility", name: "Coach Skip", examine: "Never stops stretching.", options: ["Talk-to"], art: art(5, 211) },
  armourer: { id: "armourer", name: "Dora Plate", examine: "She's knocked the dents out of half the Realm's helms.", options: ["Talk-to", "Trade"], shop: "armour", art: art(6, 241) },
  weaponsmith: { id: "weaponsmith", name: "Hilt", examine: "Tests every edge on his thumb. Has a lot of plasters.", options: ["Talk-to", "Trade"], shop: "weapons", art: art(0, 251) },
  clothier: { id: "clothier", name: "Marisol the clothier", examine: "Measures you with her eyes before you've said hello.", options: ["Talk-to", "Trade"], shop: "clothier", art: art(4, 227) },
  tailor: { id: "tailor", name: "Tamsin the tailor", examine: "Pins in her mouth, a tape round her neck, and opinions about your cape.", options: ["Talk-to", "Trade"], shop: "tailor", art: art(2, 318) },
  heft: { id: "heft", name: "Grom of Heft & Haft", examine: "Arms like tree trunks. Sells weapons to match.", options: ["Talk-to", "Trade"], shop: "heft", art: art(6, 631) },
  cairn_trader: { id: "cairn_trader", name: "Brisa the trader", examine: "Runs Highcairn's stores. Buys anything you can carry up a mountain.", options: ["Talk-to", "Trade"], shop: "general_highcairn", art: art(5, 603) },
  kettle_keeper: { id: "kettle_keeper", name: "Oda of the Stone Kettle", examine: "Keeps the kettle on and the fire high.", options: ["Talk-to", "Trade"], shop: "kettle", art: art(2, 611) },
  cairn_smith: { id: "cairn_smith", name: "Tolvar the smith", examine: "Forges with mountain ore. Has opinions about it.", options: ["Talk-to", "Trade"], shop: "cairn_forge", art: art(6, 617) },
  mountain_guide: { id: "mountain_guide", name: "Mountain guide", examine: "Knows every pass in the Greyhorns.", options: ["Talk-to"], art: art(4, 623) },
  hazel: { id: "hazel", name: "Hazel the war-bowyer", examine: "Her arms could bend an oak. She says she has.", options: ["Talk-to", "Trade"], shop: "war_bows", art: art(3, 412) },
  rowan: { id: "rowan", name: "Rowan the forester", examine: "Sawdust in the beard, a pencil behind the ear.", options: ["Talk-to", "Trade"], shop: "timber", art: art(2, 377) },
  birch: { id: "birch", name: "Old Birch", examine: "Has felled more trees than you've seen.", options: ["Talk-to"], art: art(4, 509) },
  bowyer: { id: "bowyer", name: "Wren the bowyer", examine: "Smells of beeswax and pine shavings.", options: ["Talk-to", "Trade"], shop: "archery", art: art(3, 261) },
  slayer_master: { id: "slayer_master", name: "Warden Thistle", examine: "The Realm's Warden of Pursuance. She knows where everything soft is.", options: ["Talk-to", "Assignment", "Rewards", "Trade"], shop: "slayer", art: art(8, 271) },
  rare_trader: { id: "rare_trader", name: "Rare trader", examine: "Deals in Rare Caskets and the good stuff that comes with them.", options: ["Talk-to", "Rare-market", "Caskets"], art: art(7, 281) },
  innkeeper: { id: "innkeeper", name: "Bram the innkeeper", examine: "Runs the Sleepy Friend. Has never seen it busy before noon.", options: ["Talk-to", "Trade"], shop: "inn", art: art(2, 291) },
  archmage: { id: "archmage", name: "Archmage Solenne", examine: "Head of the Wizards' Tower. Her hat has its own weather.", options: ["Talk-to"], art: art(1, 311) },
  apprentice: { id: "apprentice", name: "Apprentice Pell", examine: "Keeps the Tower's stores, and the Archmage's tea.", options: ["Talk-to", "Trade"], shop: "wizards", art: art(5, 321) },
  drake_hunter: { id: "drake_hunter", name: "Ysolde the drake hunter", examine: "Singed eyebrows. Excellent stories.", options: ["Talk-to"], art: art(6, 331) },
  bone_collector: { id: "bone_collector", name: "Mort the bone collector", examine: "Buys bones and hides. Doesn't ask where from.", options: ["Talk-to", "Trade"], shop: "bones", art: art(0, 341) },
  cape_keeper: { id: "cape_keeper", name: "Keeper of Capes", examine: "Keeps a cape for every skill, and knows who's earned one.", options: ["Talk-to", "Trade"], shop: "capes", art: art(1, 301) },
};
export const npcDef = (id: string) => NPCS[id];

// ---------- Quests ----------
export type QuestDef = { id: string; name: string; points: number; difficulty: string; start: string; requirements: string[]; rewards: string[]; journal: (game: Game) => string[] };
export const stage = (game: Game, quest: string) => game.player.quests[quest] ?? 0;
export const data = (game: Game, key: string) => game.player.questData[key] ?? 0;
export const QUESTS: readonly QuestDef[] = [
  {
    id: "friends_feast", name: "A Friend's Feast", points: 1, difficulty: "Novice", start: "Talk to Cook Mabel in the castle kitchen.", requirements: [], rewards: ["1 Quest Point", "1,500 Cooking XP", "300 coins", "2 cakes"],
    journal: game => {
      const s = stage(game, "friends_feast");
      if (s === 0) return ["I can start this quest by talking to Cook Mabel in the castle kitchen, north of the fountain."];
      if (s === 1) return ["Cook Mabel needs ingredients for the Realm Feast:",
        `${has(game.player, "egg") ? "✓" : "•"} An egg (the chicken coop at Hollow Farms)`,
        `${has(game.player, "pot_of_flour") ? "✓" : "•"} A pot of flour (grain from the wheat field, milled at the windmill, into a pot)`,
        `${has(game.player, "bucket_of_milk") ? "✓" : "•"} A bucket of milk (the dairy cow in the pen)`];
      return ["The Realm Feast was a success. QUEST COMPLETE!"];
    },
  },
  {
    id: "grumblin_trouble", name: "Grumblin Trouble", points: 1, difficulty: "Novice", start: "Talk to Captain Rook in the castle.", requirements: [], rewards: ["1 Quest Point", "1,200 Attack XP", "1,200 Strength XP", "Blackiron sabre", "200 coins"],
    journal: game => {
      const s = stage(game, "grumblin_trouble");
      if (s === 0) return ["Captain Rook in the castle might need a hand."];
      if (s === 1) return [`Captain Rook asked me to thin out the Grumblins in Whisperwood, west of the farms. Grumblins defeated: ${Math.min(6, data(game, "grumblins"))}/6.`];
      return ["The Grumblins are quieter now. QUEST COMPLETE!"];
    },
  },
  {
    id: "cold_forge", name: "The Cold Forge", points: 1, difficulty: "Intermediate", start: "Talk to Brann the smith in Emberforge.", requirements: ["Smithing 5 recommended"], rewards: ["1 Quest Point", "2,500 Smithing XP", "1,200 Mining XP", "Ashsteel pickaxe", "10 inkcoal"],
    journal: game => {
      const s = stage(game, "cold_forge");
      if (s === 0) return ["Brann the smith in Emberforge, north-east past the Ashen Hills, looks troubled."];
      if (s === 1) return ["Brann needs metal to wake his forge. Bring him:",
        `${count(game.player, "pewter_bar") >= 3 ? "✓" : "•"} 3 pewter bars (pewter ore at a furnace)`,
        `${count(game.player, "blackiron_bar") >= 2 ? "✓" : "•"} 2 blackiron bars (blackiron ore, Mining 15, Smithing 15)`];
      return ["The Emberforge burns again. QUEST COMPLETE!"];
    },
  },
  {
    id: "hollow_whispers", name: "Hollow Whispers", points: 1, difficulty: "Intermediate", start: "Talk to Brother Ossic in the Friendhollow chapel.", requirements: ["Combat 20 recommended"], rewards: ["1 Quest Point", "2,500 Faith XP", "Old Friend's charm", "5 large bones"],
    journal: game => {
      const s = stage(game, "hollow_whispers");
      if (s === 0) return ["Brother Ossic in the chapel west of the fountain hears whispers at night."];
      if (s === 1) return ["The whispers come from the crypt in Murkmire, south-west. I should find a way to quiet them. Maybe something in the crypt holds a key."];
      if (s === 2) return ["I found the crypt key. I should use it at the crypt altar."];
      if (s === 3) return ["The whispers have stopped. I should tell Brother Ossic."];
      return ["The crypt is quiet. QUEST COMPLETE!"];
    },
  },
  {
    id: "lost_glimmer", name: "The Lost Glimmer", points: 2, difficulty: "Intermediate", start: "Talk to Old Glimmer by the fountain.", requirements: [], rewards: ["2 Quest Points", "2,500 Magic XP", "Breeze staff", "100 thought sigils", "5 path sigils"],
    journal: game => {
      const s = stage(game, "lost_glimmer");
      if (s === 0) return ["Old Glimmer, a Hoverer by the fountain, seems to have lost something bright."];
      if (s === 1) return ["Old Glimmer's Glimmer shattered into three shards. I should look:",
        `${data(game, "shard_chief") ? "✓" : "•"} with the loudest Grumblin in Whisperwood`,
        `${data(game, "shard_swamp") ? "✓" : "•"} inside something that lurks in Murkmire`,
        `${data(game, "shard_well") ? "✓" : "•"} down the Friendhollow well, east of the fountain`,
        `Shards carried: ${count(game.player, "glimmer_shard")}/3`];
      return ["The Glimmer shines again. QUEST COMPLETE!"];
    },
  },
  {
    id: "hazels_quiver", name: "Hazel's Quiver", points: 1, difficulty: "Novice", start: "Talk to Hazel the war-bowyer in Fernwick, in the heart of Whisperwood.", requirements: ["Woodcutting 15 (oak logs)", "Able to defeat the Grumblin chief"], rewards: ["1 Quest Point", "Hazel's quiver (wear it on your back)", "1,500 Ranged XP", "1,000 Fletching XP", "500 Craftwork XP"],
    journal: game => {
      const s = stage(game, "hazels_quiver"), p = game.player;
      if (s === 0) return ["Hazel, the war-bowyer in the woodcutters' village of Fernwick, looks like she's lost something."];
      if (s === 1) return ["The Grumblins raided Fernwick and tore up Hazel's family quiver, the one that calls arrows home. To restitch it she needs:",
        `${has(p, "torn_quiver") ? "✓" : "•"} The torn quiver (the Grumblin chief took it, at the camp south of Fernwick)`,
        `${count(p, "leather") >= 2 ? "✓" : "•"} 2 leather (cowhides tanned by Tessa in Friendhollow)`,
        `${count(p, "feather") >= 15 ? "✓" : "•"} 15 feathers (chickens, or Fletch & Feather)`,
        `${count(p, "oak_logs") >= 5 ? "✓" : "•"} 5 oak logs (the oaks around Fernwick, Woodcutting 15)`];
      return ["Hazel restitched her grandmother's quiver and gave it to me: arrows and bolts fly home to it. QUEST COMPLETE!"];
    },
  },
  {
    id: "dawn_vigil", name: "The Dawn Vigil", points: 1, difficulty: "Novice", start: "Talk to Grandmaster Aldric at Dawnhold, east of Highcairn.", requirements: ["Faith 10"], rewards: ["1 Quest Point", "Dawnsteel sword", "Ossuary bag (holds 60 bones)", "1,500 Faith XP", "The Order Armoury opens"],
    journal: game => {
      const s = stage(game, "dawn_vigil");
      if (s === 0) return ["Grandmaster Aldric of the Order of the Dawn keeps a chapterhouse, Dawnhold, east of Highcairn. He might take on a new squire."];
      if (s === 1) return ["To join the Order I must keep the Dawn Vigil: offer bones on the Dawnhold chapel altar (use them on it).",
        `Bones offered: ${Math.min(VIGIL_BONES, data(game, "vigil_bones"))}/${VIGIL_BONES}`, data(game, "vigil_bones") >= VIGIL_BONES ? "✓ The vigil is kept. I should tell Grandmaster Aldric." : "• Any bones will do, but the Order notices large ones."];
      return ["I kept the Dawn Vigil and was made a squire of the Order of the Dawn. Its armoury is open to me. QUEST COMPLETE!"];
    },
  },
  {
    id: "greyhorn_light", name: "Light in the Greyhorn", points: 2, difficulty: "Intermediate", start: "Talk to Grandmaster Aldric after The Dawn Vigil.", requirements: ["The Dawn Vigil", "Faith 30", "Able to defeat stone golems (level 45)"], rewards: ["2 Quest Points", "Cape of the Dawn", "5,000 Faith XP", "2,000 Defence XP", "The Order's finest weapons"],
    journal: game => {
      const s = stage(game, "greyhorn_light"), p = game.player;
      if (s === 0) return ["Grandmaster Aldric will have work for a squire who has kept the vigil and grown in faith (Faith 30)."];
      if (s === 1) return ["The Order's relic, the Dawnstone, was broken and lost in the Greyhorn mine, north-east of Highcairn. The stone golems there have taken its shards into themselves.",
        `${count(p, "dawnstone_shard") >= 3 ? "✓" : "•"} Dawnstone shards: ${count(p, "dawnstone_shard")}/3 (from stone golems)`, "Then bless them on the Dawnhold chapel altar."];
      if (s === 2) return ["The Dawnstone is whole and blessed. I should bring it to Grandmaster Aldric."];
      return ["The Dawnstone shines over Dawnhold again, and I am a knight of the Order. QUEST COMPLETE!"];
    },
  },
  {
    id: "pilgrims_road", name: "The Pilgrim's Road", points: 1, difficulty: "Intermediate", start: "Talk to Sister Maren in the Dawnhold chapel after The Dawn Vigil.", requirements: ["The Dawn Vigil", "Faith 35"], rewards: ["1 Quest Point", "Dawnplate greaves and boots", "9,000 Faith XP", "2,500 Wayfaring XP"],
    journal: game => {
      const s = stage(game, "pilgrims_road");
      if (s === 0) return ["Sister Maren, the Order's chaplain, sends squires on a pilgrimage once their faith has grown (Faith 35)."];
      if (s === 1) return ["Sister Maren asked me to pray at the three old altars of the Realm, and at the five wayward chapels the Order raised in the far places:",
        ...PILGRIM_ALTARS.map(([key, , where]) => `${data(game, key) ? "✓" : "•"} ${where}`), PILGRIM_ALTARS.every(([key]) => data(game, key)) ? "Then return to her." : ""].filter(Boolean);
      return ["I walked the Pilgrim's Road and prayed at every old altar of the Realm. QUEST COMPLETE!"];
    },
  },
  {
    id: "restless_crypt", name: "The Restless Crypt", points: 2, difficulty: "Intermediate", start: "Talk to Sister Maren after Light in the Greyhorn and The Pilgrim's Road.", requirements: ["Light in the Greyhorn", "The Pilgrim's Road", "Faith 45", "A faith weapon"], rewards: ["2 Quest Points", "Dawnplate helm, shield and gauntlets", "7,000 Faith XP"],
    journal: game => {
      const s = stage(game, "restless_crypt");
      if (s === 0) return ["Sister Maren fears the dead are stirring again in the Murkmire crypt."];
      if (s === 1) return [`The skeletons of the Murkmire crypt won't stay down. Only a blessed weapon lays them to rest for good: I should put ${CRYPT_REST} of them to rest with a faith weapon.`,
        `Laid to rest: ${Math.min(CRYPT_REST, data(game, "crypt_rest"))}/${CRYPT_REST}`, data(game, "crypt_rest") >= CRYPT_REST ? "Then return to Sister Maren." : ""].filter(Boolean);
      return ["The crypt is quiet, and the dead there sleep. QUEST COMPLETE!"];
    },
  },
  {
    id: "dawn_against_hollow", name: "Dawn Against the Hollow", points: 3, difficulty: "Experienced", start: "Talk to Grandmaster Aldric after The Restless Crypt and The Hollow King.", requirements: ["The Restless Crypt", "The Hollow King", "Faith 60", "A faith weapon", "Combat 80+ strongly recommended"], rewards: ["3 Quest Points", "Dawnplate cuirass", "15,000 Faith XP", "5,000 Defence XP", "The title Knight-Paladin"],
    journal: game => {
      const s = stage(game, "dawn_against_hollow"), p = game.player;
      if (s === 0) return ["Grandmaster Aldric has one last charge for a knight who has laid the dead to rest and seen the Hollow King fall."];
      if (s === 1) return ["The Hollow King is ended, but his sentinels still keep his gate in the Hollow Depths. The Order must seal it for good:",
        `${data(game, "sentinels") >= SENTINELS ? "✓" : "•"} Destroy ${SENTINELS} Hollow sentinels with a faith weapon (${Math.min(SENTINELS, data(game, "sentinels"))}/${SENTINELS})`,
        `${count(p, "hollow_essence") >= 3 ? "✓" : "•"} Bring 3 Hollow essence to seal the gate with (${count(p, "hollow_essence")}/3)`, "Then return to Grandmaster Aldric."];
      return ["The Hollow's gate is sealed with the Dawn's light, and I wear the Order's gold. QUEST COMPLETE!"];
    },
  },
  {
    id: "hollow_king", name: "The Hollow King", points: 3, difficulty: "Grandmaster", start: "Talk to Old Glimmer after The Lost Glimmer and Hollow Whispers.", requirements: ["The Lost Glimmer", "Hollow Whispers", "Combat 60+ strongly recommended"], rewards: ["3 Quest Points", "Crown of the Realm", "Cape of the Hollow", "10,000 coins", "5,000 XP in five combat skills"],
    journal: game => {
      const s = stage(game, "hollow_king");
      if (s === 0) return ["Old Glimmer will have more to say once the Glimmer is whole and the crypt is quiet."];
      if (s === 1) return ["The Hollow King stirs in the Hollow Depths, beneath the Mossy Ruins south of Friendhollow. The Hollow gate will open for me.", "I must defeat him and bring his crown to Old Glimmer."];
      if (s === 2) return ["I have the Hollow crown. I should bring it to Old Glimmer."];
      return ["The Hollow King is ended. The Realm is safe, for now. QUEST COMPLETE!"];
    },
  },
  // ---------- The wider world's village quests (2026-10) ----------
  {
    id: "gravesend_lanterns", name: "Lanterns for the Dead", points: 1, difficulty: "Novice", start: "Talk to Warden Mira Thorne in Gravesend, north of the mainland at the Deadwood's edge.", requirements: ["Combat 20 recommended"],
    rewards: ["1 Quest Point", "Mourner's hood", "2,000 Faith XP", "1,500 Attack XP", "400 coins"],
    journal: game => {
      const s = stage(game, "gravesend_lanterns");
      if (s === 0) return ["Warden Mira Thorne keeps the graves at Gravesend, where the Deadwood begins. The dead there don't stay put."];
      if (s === 1) return ["Mira asked me to put the Deadwood's restless skeletons back down and bring her bones to bless for the lanterns.",
        `${data(game, "gs_skeletons") >= 8 ? "✓" : "•"} Skeletons laid low in the Deadwood: ${Math.min(8, data(game, "gs_skeletons"))}/8`, `${count(game.player, "bones") >= 5 ? "✓" : "•"} Bones to bless: ${Math.min(5, count(game.player, "bones"))}/5`];
      return ["Gravesend's lanterns are lit again, and Mira gave me a mourner's hood for my trouble. QUEST COMPLETE!"];
    },
  },
  {
    id: "saltmarrow_tithe", name: "The Salt Tithe", points: 1, difficulty: "Novice", start: "Talk to Harbourmaster Brine on the docks at Saltmarrow, on the south coast.", requirements: ["Fishing 15 (carp)"],
    rewards: ["1 Quest Point", "Sou'wester", "2,500 Fishing XP", "1,500 Cooking XP", "500 coins"],
    journal: game => {
      const s = stage(game, "saltmarrow_tithe");
      if (s === 0) return ["Harbourmaster Brine at Saltmarrow owes the sea a tithe of fish and is a boat short."];
      if (s === 1) return ["Brine asked me to catch the tithe: five raw carp, from any water.", `${count(game.player, "raw_carp") >= 5 ? "✓" : "•"} Raw carp: ${Math.min(5, count(game.player, "raw_carp"))}/5`];
      return ["The Salt Tithe is paid and Saltmarrow's luck holds. Brine gave me a sou'wester. QUEST COMPLETE!"];
    },
  },
  {
    id: "hollyhock_errand", name: "The Apothecary's Errand", points: 1, difficulty: "Novice", start: "Talk to Mother Yarrow in Hollyhock, in the Thistle Vale south-west of the mainland.", requirements: [],
    rewards: ["1 Quest Point", "Herbalist's hat", "1,500 Apothecary XP", "1,000 Woodcutting XP", "300 coins"],
    journal: game => {
      const s = stage(game, "hollyhock_errand");
      if (s === 0) return ["Mother Yarrow, Hollyhock's apothecary, could use a pair of hands in the garden."];
      if (s === 1) return ["Mother Yarrow needs six bones for bone meal and four oak logs for new drying racks.",
        `${count(game.player, "bones") >= 6 ? "✓" : "•"} Bones: ${Math.min(6, count(game.player, "bones"))}/6`, `${count(game.player, "oak_logs") >= 4 ? "✓" : "•"} Oak logs: ${Math.min(4, count(game.player, "oak_logs"))}/4`];
      return ["The racks are up and the beds are fed. Mother Yarrow gave me a herbalist's hat and her first lesson. QUEST COMPLETE!"];
    },
  },
  {
    id: "dyemoor_dye", name: "A Dye to Remember", points: 1, difficulty: "Novice", start: "Talk to Master Dyer Indigo Vell in Dyemoor, on the river south of the mainland.", requirements: ["Craftwork 10 recommended"],
    rewards: ["1 Quest Point", "Dyemoor cloak", "2,000 Craftwork XP", "400 coins"],
    journal: game => {
      const s = stage(game, "dyemoor_dye");
      if (s === 0) return ["Master Dyer Indigo Vell of Dyemoor is trying for a colour nobody has made."];
      if (s === 1) return ["Vell needs four wool to dye and two rough sagestones to grind for the green.",
        `${count(game.player, "wool") >= 4 ? "✓" : "•"} Wool: ${Math.min(4, count(game.player, "wool"))}/4`, `${count(game.player, "rough_sagestone") >= 2 ? "✓" : "•"} Rough sagestones: ${Math.min(2, count(game.player, "rough_sagestone"))}/2`];
      return ["Vell's new green is a triumph, by his account. He gave me the first cloak dyed in it. QUEST COMPLETE!"];
    },
  },
  {
    id: "tallgrass_tracks", name: "Tracks in the Tallgrass", points: 1, difficulty: "Intermediate", start: "Talk to Huntmaster Fenn at Tallgrass, the hunters' camp east of Southshore.", requirements: ["Combat 30 recommended"],
    rewards: ["1 Quest Point", "Pelt cape", "3,000 Ranged XP", "2,000 Strength XP", "600 coins"],
    journal: game => {
      const s = stage(game, "tallgrass_tracks");
      if (s === 0) return ["Huntmaster Fenn at Tallgrass says The Wilds are overrun this season."];
      if (s === 1) return ["Fenn asked me to thin the game in The Wilds: six boars and three wolves.",
        `${data(game, "tg_boars") >= 6 ? "✓" : "•"} Boars: ${Math.min(6, data(game, "tg_boars"))}/6`, `${data(game, "tg_wolves") >= 3 ? "✓" : "•"} Wolves: ${Math.min(3, data(game, "tg_wolves"))}/3`];
      return ["The Wilds are quieter and Fenn calls me a hunter. He gave me a pelt cape. QUEST COMPLETE!"];
    },
  },
  {
    id: "cragmaw_shaft", name: "The Foreman's Shaft", points: 1, difficulty: "Intermediate", start: "Talk to Foreman Durga Pike at Cragmaw, in the Ironreach pass east of the mainland.", requirements: ["Mining 15", "Combat 40 recommended"],
    rewards: ["1 Quest Point", "Ironreach greatcoat", "3,500 Mining XP", "2,000 Smithing XP", "800 coins"],
    journal: game => {
      const s = stage(game, "cragmaw_shaft");
      if (s === 0) return ["Foreman Durga Pike's deep mine under Cragmaw has stopped sending ore up."];
      if (s === 1) return ["Something woke in the deep mine. Pike asked me to clear five stone golems from it and bring up three blackiron ore to prove the seam still runs.",
        `${data(game, "cm_golems") >= 5 ? "✓" : "•"} Stone golems: ${Math.min(5, data(game, "cm_golems"))}/5`, `${count(game.player, "blackiron_ore") >= 3 ? "✓" : "•"} Blackiron ore: ${Math.min(3, count(game.player, "blackiron_ore"))}/3`];
      return ["The deep mine is working again. Pike gave me a greatcoat off the hook. QUEST COMPLETE!"];
    },
  },
  {
    id: "quillhaven_folio", name: "The Missing Folio", points: 1, difficulty: "Intermediate", start: "Talk to Archivist Perrin Quill in Quillhaven, on the headland in the far south-east.", requirements: ["Magic 20 recommended"],
    rewards: ["1 Quest Point", "Archivist's robe", "3,000 Magic XP", "1,500 Sigilcraft XP", "500 coins"],
    journal: game => {
      const s = stage(game, "quillhaven_folio");
      if (s === 0) return ["Archivist Perrin Quill of Quillhaven is restoring a folio, and the ink has run dry."];
      if (s === 1) return ["Quill grinds sigils into ink. He needs five thought sigils and two shade sigils to finish the folio.",
        `${count(game.player, "thought_sigil") >= 5 ? "✓" : "•"} Thought sigils: ${Math.min(5, count(game.player, "thought_sigil"))}/5`, `${count(game.player, "shade_sigil") >= 2 ? "✓" : "•"} Shade sigils: ${Math.min(2, count(game.player, "shade_sigil"))}/2`];
      return ["The folio is whole: a map of the old Realm before the sea came in. Quill gave me an archivist's robe. QUEST COMPLETE!"];
    },
  },
  {
    id: "ashfall_embers", name: "Embers in the Ash", points: 2, difficulty: "Experienced", start: "Talk to Ember Tamsin at her camp at the end of the Drakespine, before Ashfall.", requirements: ["Combat 70 recommended", "A Wyrmward shield helps"],
    rewards: ["2 Quest Points", "Scorched cloak", "6,000 Attack XP", "6,000 Defence XP", "2,000 coins"],
    journal: game => {
      const s = stage(game, "ashfall_embers");
      if (s === 0) return ["Ember Tamsin camps where the Drakespine ends and Ashfall begins. She wants something from the dragons."];
      if (s === 1) return ["Tamsin wants three ash drakes out of Ashfall's passes so she can reach the ruins beyond.", `${data(game, "af_drakes") >= 3 ? "✓" : "•"} Ash drakes slain in Ashfall: ${Math.min(3, data(game, "af_drakes"))}/3`];
      return ["The passes are clear for now. Tamsin gave me a cloak burnt by a dragon, and a warning about the crater. QUEST COMPLETE!"];
    },
  },
  {
    id: "mages_satchel", name: "The Mage's Satchel", points: 1, difficulty: "Intermediate", start: "Talk to Archmage Solenne at the top of the Wizards' Tower, with Magic 30.",
    requirements: ["Magic 30", "3 leather, 60 star sigils and 20 thought sigils"], rewards: ["1 Quest Point", "Sigil satchel (holds 2,000 of every sigil; spells draw from it; worn on the back)", "2,000 Magic XP"],
    journal: game => {
      const s = stage(game, "mages_satchel"), p = game.player;
      if (s === 0) return ["Archmage Solenne keeps her sigils in a bag that never seems to run out. She might show me how it's made."];
      if (s === 1) return ["Solenne wants 3 leather for the bag, 60 star sigils to stitch the stars, and 20 thought sigils to teach it what a spell wants.",
        `${count(p, "leather") >= 3 ? "✓" : "•"} Leather: ${Math.min(3, count(p, "leather"))}/3`, `${count(p, "star_sigil") >= 60 ? "✓" : "•"} Star sigils: ${Math.min(60, count(p, "star_sigil"))}/60`, `${count(p, "thought_sigil") >= 20 ? "✓" : "•"} Thought sigils: ${Math.min(20, count(p, "thought_sigil"))}/20`];
      return ["Solenne stitched me a sigil satchel: purple, gold stars, and a hunger for sigils. My spells draw straight from it. QUEST COMPLETE!"];
    },
  },
  // ---------- The dungeon update: what's under the lake, the library and the stones ----------
  {
    id: "deepglass_heart", name: "The Heart of the Lake", points: 2, difficulty: "Intermediate", start: "Talk to the Old fisher on the Friendhollow pier, with a combat level of 30 or so.",
    requirements: ["Combat 30 recommended"], rewards: ["2 Quest Points", "Lakeglass charm", "3,000 Fishing XP", "2,500 Attack XP", "800 coins"],
    journal: game => {
      const s = stage(game, "deepglass_heart"), p = game.player;
      if (s === 0) return ["The Old fisher says Glass Lake has gone cloudy on the east shore, and there's a crack in the rock there that glows at night."];
      if (s === 1) return ["Through the crevice on the lake's east shore are the Deepglass Caverns. The fisher wants the glass crabs thinned, three crystal shards, and whatever is making the lake's heart beat put to rest.",
        `${data(game, "dg_crabs") >= 6 ? "✓" : "•"} Glass crabs cracked: ${Math.min(6, data(game, "dg_crabs"))}/6`, `${count(p, "crystal_shard") >= 3 ? "✓" : "•"} Crystal shards: ${Math.min(3, count(p, "crystal_shard"))}/3`,
        `${data(game, "dg_golem") >= 1 ? "✓" : "•"} The Crystal Golem laid to rest (behind the crystal door; its key comes from the crabs and the coffers)`];
      return ["The lake runs clear again. The fisher strung a shard on a cord and called it a charm. QUEST COMPLETE!"];
    },
  },
  {
    id: "drowned_archive", name: "The Drowned Archive", points: 2, difficulty: "Intermediate", start: "Talk to Archivist Perrin Quill in Quillhaven after The Missing Folio, with Magic 40.",
    requirements: ["Magic 40", "The Missing Folio"], rewards: ["2 Quest Points", "Lamp of insight", "5,000 Magic XP", "2,000 Sigilcraft XP", "1,500 coins"],
    journal: game => {
      const s = stage(game, "drowned_archive"), p = game.player;
      if (s === 0) return ["Perrin says the library's bottom floor flooded a hundred years ago, and the first archivist went down to save the books and never came up. There's a trapdoor."];
      if (s === 1) return ["Under the trapdoor is the Drowned Archive. Perrin wants six of the pages its drowned readers still carry, and the Archivist Below let go of his post. Perrin gave me the spare key to the sealed reading room.",
        `${count(p, "ink_page") >= 6 ? "✓" : "•"} Ink-stained pages: ${Math.min(6, count(p, "ink_page"))}/6`, `${data(game, "da_archivist") >= 1 ? "✓" : "•"} The Archivist Below laid to rest`];
      return ["Perrin dried the pages and read them, and went quiet for a long time. He gave me a lamp. The reading room is open now. QUEST COMPLETE!"];
    },
  },
  {
    id: "howling_vault", name: "What the Stones Keep", points: 3, difficulty: "Long", start: "Talk to Huntmaster Fenn in Tallgrass after Tracks in the Tallgrass, with a combat level of 70 or so.",
    requirements: ["Combat 70 recommended", "Tracks in the Tallgrass"], rewards: ["3 Quest Points", "8,000 Attack XP", "4,000 Pursuance XP", "6,000 coins"],
    journal: game => {
      const s = stage(game, "howling_vault");
      if (s === 0) return ["Fenn says the ring of stones in The Wilds has a hole in the middle now, and the game won't go within a mile of it. He's stopped pretending it was always there."];
      if (s === 1) return ["Under the stones are the Howling Vault: a gallery of the Wilds' old dead, and their lord at the end of it. Fenn gave me a vault key for the lord's door, and wants the galleries thinned and the lord put down for good.",
        `${data(game, "hb_dead") >= 12 ? "✓" : "•"} Vault archers and knights laid low: ${Math.min(12, data(game, "hb_dead"))}/12`, `${data(game, "hb_lord") >= 1 ? "✓" : "•"} The Howling King laid to rest`];
      return ["The howling under the stones has stopped. Fenn says the deer came back the same night. QUEST COMPLETE!"];
    },
  },
  // ---------- The oaths of the four Orders, and the Maidens' truce ----------
  ...ORDER_IDS.map(id => { const order = ORDERS[id]; return {
    id: `oath_${id}`, name: `The ${order.short} Oath`, points: 1, difficulty: "Intermediate" as const, start: `Talk to the commander in the ${order.short} Hall, with Faith 20.`,
    requirements: ["Faith 20", `${order.oath.n.toLocaleString()} ${order.oath.item === "coins" ? "coins" : order.oath.item.replace(/_/g, " ")}`], rewards: ["1 Quest Point", `${order.short} cape`, "3,000 Faith XP", `The ${order.name}'s armoury opens to you`],
    journal: (game: Game) => {
      const s = stage(game, `oath_${id}`), p = game.player;
      if (s === 0) return [`The ${order.name} serves ${order.godName}. Its commander swears in those who prove their faith.`];
      if (s === 1) return [`To swear the ${order.short} Oath I must pray at the ${order.short} altar and bring ${order.oath.text}.`,
        `${data(game, `prayed_${id}`) ? "✓" : "•"} Prayed at the ${order.short} altar`, `${count(p, order.oath.item) >= order.oath.n ? "✓" : "•"} ${order.oath.item === "coins" ? "Coins" : order.oath.item.replace(/_/g, " ")}: ${Math.min(order.oath.n, count(p, order.oath.item)).toLocaleString()}/${order.oath.n.toLocaleString()}`];
      return [`I swore the ${order.short} Oath. The ${order.name}'s armoury is open to me, and I wear its cape. QUEST COMPLETE!`];
    },
  }; }),
  {
    id: "ringmasters_signet", name: "The Ringmaster's Signet", points: 1, difficulty: "Intermediate", start: "Talk to Ringmaster Vell Harrow at the Rare Friends Ring after winning three matches.",
    requirements: ["Three matches won in the Ring", "30 bloodmarks"], rewards: ["1 Quest Point", "Ringmaster's signet (a ring: +4 Strength, and three teleports to the Ring a day)", "2,000 Strength XP"],
    journal: game => {
      const s = stage(game, "ringmasters_signet"), p = game.player;
      if (s === 0) return ["The Ringmaster gives his signet to fighters who keep coming back. Three matches won, he says, and he'll talk."];
      if (s === 1) return ["The Ringmaster will stamp me a signet for thirty bloodmarks once I've won three matches: a ring that carries me to the Ring three times a day, and lends me the pit's strength.",
        `${(p.stats.matches ?? 0) >= 3 ? "✓" : "•"} Matches won: ${Math.min(3, p.stats.matches ?? 0)}/3`, `${count(p, "bloodmark") >= 30 ? "✓" : "•"} Bloodmarks: ${Math.min(30, count(p, "bloodmark"))}/30`];
      return ["The Ringmaster's signet is on my finger. Three times a day it carries me to the Ring. QUEST COMPLETE!"];
    },
  },
  {
    id: "maidens_truce", name: "The Maidens' Truce", points: 2, difficulty: "Intermediate", start: "Talk to Matriarch Ysolde Thornveil at the Deadwood Maidens' camp, in the east of the Deadwood.",
    requirements: ["Combat 50 recommended"], rewards: ["2 Quest Points", "Maiden's veil", "4,000 Faith XP", "2,000 Pursuance XP", "The Maidens' market opens to you, and their spears stay down"],
    journal: game => {
      const s = stage(game, "maidens_truce"), p = game.player;
      if (s === 0) return ["The Deadwood Maidens hold the east of the wood against the dead and against everyone else. Their matriarch will talk, if nobody else will."];
      if (s === 1) return ["The matriarch will keep a truce with me if I prove I fight the dead and not the living: ten of the Deadwood's dead put down in the east of the wood, twelve grave dust for their hearth, and four crypt bones for their shrine.",
        `${data(game, "mt_dead") >= 10 ? "✓" : "•"} The dead put down in the east Deadwood: ${Math.min(10, data(game, "mt_dead"))}/10`, `${count(p, "grave_dust") >= 12 ? "✓" : "•"} Grave dust: ${Math.min(12, count(p, "grave_dust"))}/12`, `${count(p, "crypt_bones") >= 4 ? "✓" : "•"} Crypt bones: ${Math.min(4, count(p, "crypt_bones"))}/4`];
      return ["The Maidens keep the truce. Their spears stay down for me, and Wren's market is open. QUEST COMPLETE!"];
    },
  },
  // ---------- Return of Raria: Hollowmere's watch, the Federation, BarkReach and Raria ----------
  ...WEST_QUESTS,
  ...BAR_QUEST_DEFS,
  // ---------- The quests of being known: long ones, for Presence, with gear only they give ----------
  {
    id: "name_worth_knowing", name: "A Name Worth Knowing", points: 2, difficulty: "Long", start: "Talk to Namekeeper Elian by the Friendhollow square, once your Presence is 20 and your Friend has a name.",
    requirements: ["Presence 20", "A name for your Friend"], rewards: ["2 Quest Points", "Wanderer's cloak (Presence 20: Presence grows a fifth faster)", "3,000 coins", "2,000 Presence XP"],
    journal: game => {
      const s = stage(game, "name_worth_knowing"), k = KNOWN(game);
      if (s === 0) return ["Namekeeper Elian says a name is only worth what the Realm knows of it. He'd write more beside mine, if there were more to write."];
      if (s === 1) return ["Elian wants my name to mean something in the register: places seen, people met, things heard, things done.",
        `${k.regions >= 10 ? "✓" : "•"} Regions discovered: ${Math.min(10, k.regions)}/10`, `${k.people >= 25 ? "✓" : "•"} People spoken to: ${Math.min(25, k.people)}/25`,
        `${k.rumours >= 10 ? "✓" : "•"} Rumours heard: ${Math.min(10, k.rumours)}/10`, `${k.quests >= 5 ? "✓" : "•"} Quests completed: ${Math.min(5, k.quests)}/5`];
      return ["Elian wrote a second line under my name, and gave me a cloak with a stitch from every village I'd passed through. QUEST COMPLETE!"];
    },
  },
  {
    id: "known_hall", name: "Known in Every Hall", points: 3, difficulty: "Long", start: "Talk to Archivist Perrin Quill in Quillhaven, after The Quillhaven Folio and A Name Worth Knowing, with Presence 40.",
    requirements: ["Presence 40", "A Name Worth Knowing", "The Quillhaven Folio"], rewards: ["3 Quest Points", "Chronicler's mantle (Presence 40: work orders pay 15% more)", "Storyteller's hat", "6,000 coins", "3,000 Presence XP"],
    journal: game => {
      const s = stage(game, "known_hall"), k = KNOWN(game);
      if (s === 0) return ["Archivist Perrin keeps a shelf for people the whole Realm knows. It's nearly empty. He thinks I could fill a page of it."];
      if (s === 1) return ["Perrin wants proof I'm known in every hall: a name in eight settlements, their clothes on my back, their stories in my head, and deeds to my name.",
        `${k.known >= 8 ? "✓" : "•"} Settlements where I'm known: ${Math.min(8, k.known)}/8`, `${k.styles >= 4 ? "✓" : "•"} Regional outfits worn: ${Math.min(4, k.styles)}/4`,
        `${k.rumours >= 20 ? "✓" : "•"} Rumours heard: ${Math.min(20, k.rumours)}/20`, `${k.achievements >= 15 ? "✓" : "•"} Achievements: ${Math.min(15, k.achievements)}/15`];
      return ["Perrin bound a page with my name at the top and gave me the mantle and hat the library keeps for its chroniclers. QUEST COMPLETE!"];
    },
  },
  {
    id: "the_remembered", name: "The Remembered", points: 4, difficulty: "Long", start: "Talk to King Hollis in Friendhollow Castle, after Known in Every Hall, with Presence 60.",
    requirements: ["Presence 60", "Known in Every Hall", "Attack 60 to wield the reward"], rewards: ["4 Quest Points", "Blade of Renown (Presence 60: strength grows with Presence)", "Cape of Renown (Presence grows a third faster)", "12,000 coins", "5,000 Presence XP"],
    journal: game => {
      const s = stage(game, "the_remembered"), k = KNOWN(game);
      if (s === 0) return ["King Hollis says the Realm remembers very few, and that the ones it does are not always the ones who deserved it. He means to see to it, this once."];
      if (s === 1) return ["The King wants the deeds of someone the Realm will remember: bosses felled, titles earned, trust in the villages, and a long list of things done.",
        `${k.bosses >= 4 ? "✓" : "•"} Bosses felled: ${Math.min(4, k.bosses)}/4`, `${k.titles >= 8 ? "✓" : "•"} Titles earned: ${Math.min(8, k.titles)}/8`,
        `${k.trusted >= 4 ? "✓" : "•"} Settlements where I'm trusted: ${Math.min(4, k.trusted)}/4`, `${k.quests >= 12 ? "✓" : "•"} Quests completed: ${Math.min(12, k.quests)}/12`,
        `${k.achievements >= 30 ? "✓" : "•"} Achievements: ${Math.min(30, k.achievements)}/30`];
      return ["The King had my name cut into a blade and a cape made for the court. The Realm remembers me. QUEST COMPLETE!"];
    },
  },
];
export const questPoints = (game: Game) => QUESTS.reduce((sum, quest) => sum + (stage(game, quest.id) >= finalStage(quest.id) ? quest.points : 0), 0);
export function finalStage(quest: string) { return quest === "hollow_whispers" ? 4 : quest === "hollow_king" || quest === "greyhorn_light" ? 3 : 2; }
/** Bones to offer at the Dawnhold chapel for the Dawn Vigil. */
const VIGIL_BONES = 8;
/** The Pilgrim's Road: the old altars to pray at ([quest flag, altar name, where it is]). */
export const PILGRIM_ALTARS = [["pilgrim_chapel", "Altar", "The Friendhollow chapel, west of the fountain"], ["pilgrim_shrine", "Mountain shrine", "The mountain shrine in Highcairn"], ["pilgrim_crypt", "Crypt altar", "The crypt altar in Murkmire"],
  ["pilgrim_westmarch", "Wayward altar", "The wayward chapel out in the Westmarch"], ["pilgrim_drakespine", "Drakespine altar", "The chapel on the Drakespine, in dragon country"], ["pilgrim_ironreach", "Ironreach altar", "The chapel in the Ironreach snows"],
  ["pilgrim_wilds", "Wilds altar", "The chapel in The Wilds"], ["pilgrim_deadwood", "Deadwood altar", "The great ruined chapel in the Deadwood"]] as const;
/** Skeletons to lay to rest (The Restless Crypt) and sentinels to destroy (Dawn Against the Hollow), with a faith weapon. */
const CRYPT_REST = 12, SENTINELS = 5;
const faithArmed = (game: Game) => !!(game.player.equipment.weapon && item(game.player.equipment.weapon).equip?.holy);
export const questDone = (game: Game, quest: string) => stage(game, quest) >= finalStage(quest);
export const MAX_QUEST_POINTS = QUESTS.reduce((sum, quest) => sum + quest.points, 0);

export function completeQuest(game: Game, quest: string) {
  game.player.quests[quest] = finalStage(quest);
  const definition = QUESTS.find(entry => entry.id === quest)!;
  message(game, `Congratulations! Quest complete: ${definition.name}. Rewards: ${definition.rewards.join(", ")}.`, "quest");
  onQuestCompleted(game, definition.points);
  remember(game, "first_quest"); friendSays(game, "quest");
  emit(game, { type: "quest", quest, tick: game.tick }); sound(game, "quest");
}

// ---------- Dialogue helpers ----------
export const npcSays = (npc: string, ...texts: string[]): DialogueLine[] => texts.map(text => ({ who: "npc", text, npc }));
export const playerSays = (...texts: string[]): DialogueLine[] => texts.map(text => ({ who: "player", text }));
export function chat(npc: string, lines: DialogueLine[], options?: Dialogue["options"], onEnd?: () => void): Dialogue {
  return { npc, lines, index: 0, options, onEnd };
}

/** Pickpocket and quest hooks the engine calls. */
export function onMonsterKilled(game: Game, monsterId: string, x: number, y: number) {
  const player = game.player;
  onWestKill(game, monsterId); onBountyKill(game, monsterId);
  // The wider world's village quests count their kills wherever they fall.
  const tally = (quest: string, key: string, goal: number, done: string) => {
    if (stage(game, quest) !== 1) return;
    const n = player.questData[key] = (player.questData[key] ?? 0) + 1;
    if (n === goal) { message(game, done, "quest"); sound(game, "quest"); }
  };
  if ((monsterId === "skeleton" || monsterId === "shade" || monsterId === "cairn_wight") && x >= 335 && x <= 440 && y < 115) tally("maidens_truce", "mt_dead", 10, "Ten of the Deadwood's dead put down in the east. The matriarch wanted dust and bones besides.");
  if (monsterId === "glass_crab") tally("deepglass_heart", "dg_crabs", 6, "Six glass crabs cracked. The fisher wanted shards too, and the lake's heart stilled.");
  if (monsterId === "crystal_golem") tally("deepglass_heart", "dg_golem", 1, "The Crystal Golem comes apart in a shower of glass. The lake's heart is still.");
  if (monsterId === "archivist_below") tally("drowned_archive", "da_archivist", 1, "The Archivist Below closes his book at last. Perrin will want to hear it.");
  if (monsterId === "vault_archer" || monsterId === "vault_knight") tally("howling_vault", "hb_dead", 12, "Twelve of the vault dead down. Only their lord is left to settle.");
  if (monsterId === "howling_king") tally("howling_vault", "hb_lord", 1, "The Howling King falls, and the howling under the stones stops. Fenn should know.");
  if (monsterId === "skeleton") tally("gravesend_lanterns", "gs_skeletons", 8, "That's eight skeletons down. Mira will want her bones blessed now.");
  if (monsterId === "boar") tally("tallgrass_tracks", "tg_boars", 6, "Six boars. The Wilds will thank me, if not the boars.");
  if (monsterId === "wolf") tally("tallgrass_tracks", "tg_wolves", 3, "Three wolves. Fenn can count the rest himself.");
  if (monsterId === "stone_golem") tally("cragmaw_shaft", "cm_golems", 5, "Five golems back to rubble. The deep mine is quieter.");
  if (monsterId === "ash_drake") tally("ashfall_embers", "af_drakes", 3, "Three drakes. The pass is open. Ember Tamsin should hear it.");
  if (monsterId === "grumblin" && stage(game, "grumblin_trouble") === 1) {
    player.questData.grumblins = (player.questData.grumblins ?? 0) + 1;
    if (player.questData.grumblins === 6) message(game, "That's six Grumblins. I should report to Captain Rook.", "quest");
  }
  const shard = (key: string, where: string) => {
    if (stage(game, "lost_glimmer") !== 1 || data(game, key)) return;
    player.questData[key] = 1; giveOrDrop(game, "glimmer_shard");
    message(game, `A Glimmer shard ${where}!`, "quest"); sound(game, "quest");
  };
  if (monsterId === "grumblin_chief") shard("shard_chief", "falls from the chief's pocket");
  if (monsterId === "grumblin_chief" && stage(game, "hazels_quiver") === 1 && !has(player, "torn_quiver")) {
    giveOrDrop(game, "torn_quiver"); message(game, "The chief was wearing Hazel's quiver as a hat. You take it back: it's torn, but it's all there.", "quest"); sound(game, "quest");
  }
  if (monsterId === "swamp_lurker") shard("shard_swamp", "glints in the lurker's mud");
  if (monsterId === "skeleton" && stage(game, "restless_crypt") === 1 && faithArmed(game)) {
    const n = player.questData.crypt_rest = (player.questData.crypt_rest ?? 0) + 1;
    if (n === CRYPT_REST) message(game, "The last skeleton crumbles and stays down. I should tell Sister Maren.", "quest");
  }
  if (monsterId === "hollow_sentinel" && stage(game, "dawn_against_hollow") === 1 && faithArmed(game)) {
    const n = player.questData.sentinels = (player.questData.sentinels ?? 0) + 1;
    if (n === SENTINELS) message(game, `That's ${SENTINELS} Hollow sentinels destroyed by the Dawn's light.`, "quest");
  }
  if (monsterId === "stone_golem" && stage(game, "greyhorn_light") === 1 && count(player, "dawnstone_shard") < 3 && game.rng() < 0.5) {
    giveOrDrop(game, "dawnstone_shard"); message(game, "Something glows in the golem's rubble: a Dawnstone shard.", "quest"); sound(game, "quest");
  }
  if (monsterId === "hollow_king" && stage(game, "hollow_king") === 1) {
    player.quests.hollow_king = 2; giveOrDrop(game, "hollow_crown");
    message(game, "The Hollow King fades. His crown drops, weightless, into your hands.", "quest"); sound(game, "quest");
  }
  void x; void y;
}
/** Searching the Friendhollow well during The Lost Glimmer. */
export function searchWell(game: Game) {
  if (stage(game, "lost_glimmer") === 1 && !data(game, "shard_well")) {
    game.player.questData.shard_well = 1; giveOrDrop(game, "glimmer_shard");
    message(game, "You fish around in the well bucket… and find a Glimmer shard!", "quest"); sound(game, "quest");
  } else message(game, "The well is deep and cold. You see your Friend's reflection.");
}
/** The crypt: searching the old chest and blessing the altar. */
/** Why a shop won't sell to you (the Orders' armouries before the oath, the Maidens' market before the truce), or null. */
export function shopProblem(game: Game, shopId: string): string | null {
  const west = westShopProblem(game, shopId); if (west) return west;
  const order = ORDER_IDS.find(id => shopId === `${id}_armoury`);
  if (order && !questDone(game, `oath_${order}`)) return `The quartermaster won't sell to one who hasn't sworn the ${ORDERS[order].short} Oath. The commander will hear you.`;
  if (shopId === "maidens_market" && !questDone(game, "maidens_truce")) return "Wren's hand stays on her spear. The Maidens trade with those who keep the truce; speak to the matriarch.";
  return null;
}
export function searchCryptChest(game: Game) {
  if (stage(game, "hollow_whispers") === 1 && !has(game.player, "crypt_key")) {
    giveOrDrop(game, "crypt_key"); game.player.quests.hollow_whispers = 2;
    message(game, "Under a mouldy shroud you find a cold blackiron key.", "quest");
  } else message(game, "The chest is empty apart from dust.");
}
/** Bones offered at an altar: the Dawn Vigil counts those offered in the Dawnhold chapel. */
export function onBonesOffered(game: Game, chapel: boolean) {
  if (!chapel || stage(game, "dawn_vigil") !== 1) return;
  const n = game.player.questData.vigil_bones = (game.player.questData.vigil_bones ?? 0) + 1;
  if (n === VIGIL_BONES) { message(game, "The chapel candles all flare at once. The vigil is kept: I should tell Grandmaster Aldric.", "quest"); sound(game, "quest"); }
}
/** Praying at an altar: the Pilgrim's Road counts the old altars of the Realm. */
export function onAltarPrayed(game: Game, altar: { name: string; text?: string }) {
  onWestAltar(game, altar);
  if (altar.text && (ORDER_IDS as readonly string[]).includes(altar.text) && !data(game, `prayed_${altar.text}`)) { game.player.questData[`prayed_${altar.text}`] = 1; if (stage(game, `oath_${altar.text}`) === 1) { message(game, `You kneel at the ${ORDERS[altar.text as keyof typeof ORDERS].short} altar. The oath wants its gift too.`, "quest"); } }
  if (stage(game, "pilgrims_road") !== 1) return;
  const stop = PILGRIM_ALTARS.find(([, name]) => name === altar.name);
  if (!stop || data(game, stop[0])) return;
  game.player.questData[stop[0]] = 1;
  const done = PILGRIM_ALTARS.every(([key]) => data(game, key));
  message(game, done ? "You kneel at the last of the old altars. The Pilgrim's Road is walked: I should return to Sister Maren." : "You kneel and pray. This altar is one of the Pilgrim's Road.", "quest"); sound(game, "quest");
}
/** Dawnstone shards on the Dawnhold altar: three become the Dawnstone. */
export function consecrateDawnstone(game: Game) {
  if (stage(game, "greyhorn_light") !== 1) { message(game, "The shard is warm, but the altar doesn't answer. Perhaps the Grandmaster knows why."); return; }
  if (count(game.player, "dawnstone_shard") < 3) { message(game, `The altar needs the whole stone: you have ${count(game.player, "dawnstone_shard")} of 3 shards.`); return; }
  take(game.player, "dawnstone_shard", 3); giveOrDrop(game, "dawnstone"); game.player.quests.greyhorn_light = 2;
  message(game, "You lay the three shards on the altar and pray. Light runs through the cracks, and they close: the Dawnstone is whole.", "quest"); sound(game, "quest");
}
export function useCryptAltar(game: Game) {
  if (stage(game, "hollow_whispers") === 2 && has(game.player, "crypt_key")) {
    take(game.player, "crypt_key"); game.player.quests.hollow_whispers = 3;
    message(game, "You turn the key in the altar. The whispering stops all at once.", "quest"); sound(game, "quest");
  } else message(game, "A cracked altar. Something here wants to be locked.");
}

// ---------- Dialogue ----------
/** A village quest in one shape: an offer, a job to bring back or a tally to fill, and a reward. Stage 1 while on it, 2 when done. */
/** What the Realm knows of you, for the quests of being known. */
function KNOWN(game: Game) {
  const player = game.player, reps = REPUTATION_PLACES.map(place => reputation(game, place.id));
  return {
    regions: Object.keys(player.visited).length, people: Object.keys(player.talked).length, rumours: Object.keys(player.rumours).length,
    quests: QUESTS.filter(quest => questDone(game, quest.id)).length, known: reps.filter(rep => rep.score >= 1).length, trusted: reps.filter(rep => rep.score >= 4).length,
    styles: REGIONAL_CLOTHING.filter(set => set.pieces.some(piece => player.outfits[piece.id])).length, achievements: Object.keys(player.achievements).length,
    bosses: player.stats.bosses ?? 0, titles: unlockedTitles(game).length,
  };
}
const presenceReward = (game: Game, coins: number, xp: number, ...items: string[]) => { giveOrDrop(game, "coins", coins); addXp(game, "presence", xp, { raw: true }); for (const id of items) giveOrDrop(game, id); };
function nameWorthKnowing(game: Game, name: string): Dialogue {
  const k = KNOWN(game);
  return fetchQuest(game, name, "name_worth_knowing", {
    offer: [`${game.player.name}. It's written. But a name is only worth what the Realm knows of it, and so far the register says: a name.`, "Go and be known. Ten regions seen, twenty-five people spoken to, ten rumours heard, five quests done. Then I'll write the second line."],
    accept: "Good. The ink's ready when you are.", progress: `The register still has one line under ${game.player.name}. Regions ${Math.min(10, k.regions)}/10, people ${Math.min(25, k.people)}/25, rumours ${Math.min(10, k.rumours)}/10, quests ${Math.min(5, k.quests)}/5.`,
    have: () => k.regions >= 10 && k.people >= 25 && k.rumours >= 10 && k.quests >= 5, take: () => {},
    done: [`${game.player.name}: seen, spoken to, heard of, and owed. That's a second line. Take this cloak; every village you passed through put a stitch in it.`],
    reward: () => presenceReward(game, 3000, 2000, "wanderers_cloak"),
  });
}
function knownHall(game: Game, name: string): Dialogue {
  const k = KNOWN(game);
  return fetchQuest(game, name, "known_hall", {
    offer: ["The library keeps a shelf for people the whole Realm knows. It is nearly empty. Not for want of people; for want of proof.", "Be known in eight settlements. Wear the clothes of four. Carry twenty of their stories and fifteen deeds of your own. Then I'll bind a page with your name at the top."],
    accept: "Then go and be known. Quietly, please. This is a library.", progress: `Not yet a page. Known in ${Math.min(8, k.known)}/8 settlements, outfits of ${Math.min(4, k.styles)}/4, rumours ${Math.min(20, k.rumours)}/20, achievements ${Math.min(15, k.achievements)}/15.`,
    have: () => k.known >= 8 && k.styles >= 4 && k.rumours >= 20 && k.achievements >= 15, take: () => {},
    done: ["Every hall. I've bound the page. The library keeps a mantle and a hat for its chroniclers; they've been waiting for someone the ink would stick to."],
    reward: () => presenceReward(game, 6000, 3000, "chroniclers_mantle", "storytellers_hat"),
  });
}
function theRemembered(game: Game, name: string): Dialogue {
  const k = KNOWN(game);
  return fetchQuest(game, name, "the_remembered", {
    offer: ["The Realm remembers very few, and not always the ones who deserved it. I mean to see to it, this once.", "Fell four of its terrors. Earn eight titles. Be trusted in four settlements, finish twelve quests, and thirty deeds besides. Then the court will remember you the way courts do: in steel and cloth."],
    accept: "Go on, then. I'll have the smith stand ready.", progress: `Not yet. Bosses ${Math.min(4, k.bosses)}/4, titles ${Math.min(8, k.titles)}/8, trusted in ${Math.min(4, k.trusted)}/4, quests ${Math.min(12, k.quests)}/12, achievements ${Math.min(30, k.achievements)}/30.`,
    have: () => k.bosses >= 4 && k.titles >= 8 && k.trusted >= 4 && k.quests >= 12 && k.achievements >= 30, take: () => {},
    done: ["It's done, then. Your name is on the blade; the cape is the court's. The Realm remembers you. Try to deserve it a while longer."],
    reward: () => presenceReward(game, 12000, 5000, "blade_of_renown", "cape_of_renown"),
  });
}
/** A patron's work for the day: what they want, what it pays, and the hand-over. */
function orderDialogue(game: Game, npc: string, name: string): Dialogue {
  const order = currentOrder(game, npc), patron = PATRONS[npc], player = game.player;
  if (!order) return chat(name, npcSays(name, `Nothing you could make for me yet. Come back when your ${SKILL_NAMES[patron.skill]} is better.`));
  if (order.done) return chat(name, npcSays(name, "You've done today's. Come back tomorrow; there's always more."));
  if (count(player, order.item) >= order.n) return chat(name, npcSays(name, `${orderText(order)}! ${patron.thanks}`), undefined, () => { fillOrder(game, npc); });
  return chat(name, npcSays(name, askText(npc, order), `I'll pay ${order.pay.toLocaleString()} coins, well over what any shop gives, and you'll be the better ${SKILL_NAMES[patron.skill].toLowerCase() === "wayfaring" ? "for it" : "at it"}.`));
}
export function fetchQuest(game: Game, name: string, quest: string, q: { offer: string[]; accept: string; progress: string; have: () => boolean; take: () => void; done: string[]; reward: () => void; onAccept?: () => void }): Dialogue {
  const s = stage(game, quest), def = QUESTS.find(entry => entry.id === quest)!;
  if (s === 0) return chat(name, npcSays(name, ...q.offer), [
    { label: "I'll do it.", then: () => chat(name, npcSays(name, q.accept), undefined, () => { game.player.quests[quest] = 1; q.onAccept?.(); message(game, `Quest started: ${def.name}.`, "quest"); sound(game, "quest"); }) },
    { label: "Not today.", then: () => null },
  ]);
  if (s === 1) {
    if (!q.have()) return chat(name, npcSays(name, q.progress));
    return chat(name, npcSays(name, ...q.done), undefined, () => { q.take(); q.reward(); completeQuest(game, quest); });
  }
  return chat(name, npcSays(name, q.done[0]));
}
/** Who stops to chat about what they've heard: townsfolk, traders, keepers of inns and lodges. */
const GOSSIPS = /^(villager|.*_villager|innkeeper|shop_general|trader_.*|kettle_keeper|cairn_trader|gravesend_trader|saltmarrow_fishmonger|dyemoor_tailor|tallgrass_outfitter|cragmaw_ore|quillhaven_scribe|miller|fisher|birch|axel|pike|banker)$/;
/** NPCs who notice what family your Friend is, the first time you meet them: [id or prefix, family, what they say]. */
const FAMILY_GREETINGS: readonly [string, number, string][] = [
  ["dawn_knight", 0, "That's… unusual. A Skeleton, at Dawnhold. Keep your hands where I can see them. No offence."], ["grandmaster", 0, "A Skeleton Friend. The Order has opinions about your kind. I am not the Order, today."],
  ["chaplain", 8, "The Hollow walks in on two legs and says good morning. Sit. I'll light a candle for both of us."], ["dawn_knight", 8, "Stay where I can see you."],
  ["priest", 8, "The Old Friend sees you. I am not sure what he sees."], ["gravesend", 0, "You'd fit right in here. No offence meant. Some taken, probably."],
  ["cragmaw", 6, "By the old stones. A Colossus. Mind the roof."], ["quillhaven_archivist", 5, "A Hoverer! I've only ever seen that symbol in old paintings. Don't touch anything."],
  ["hollyhock_apothecary", 3, "Oh, a Cellular Friend. You'll understand the gardens better than I do."], ["king", 7, "A Sparkling Friend! The court brightens. Guards, stand down, it's meant to glow."],
  ["witch", 1, "A Mask. Heh heh. Which one's the real one, dearie? Don't tell me. I like a mystery."], ["glimmer", 4, "An Asymmetry Friend. The Realm was lopsided too, when it was new."],
  ["namekeeper", 2, "A Family Friend. Then you'll know why names matter."],
];
export function talk(game: Game, npcId: string): Dialogue {
  const dialogue = talkInner(game, npcId), player = game.player, base = npcId.split(":")[0], def = NPCS[base], name = def.name;
  if (npcId.includes(":")) return dialogue;
  // A greeting for what you are, once; then, as you become known, for who you are.
  const greeting = FAMILY_GREETINGS.find(([id, family]) => (base === id || base.startsWith(`${id}_`)) && family === player.familyId);
  if (greeting && !player.firsts[`greet_${base}`]) { player.firsts[`greet_${base}`] = 1; dialogue.lines.unshift(...npcSays(name, greeting[2])); }
  else if (player.talked[base] && presenceLevel(player) >= 20 && game.rng() < 0.3) {
    const level = presenceLevel(player), who = player.name ?? "you";
    dialogue.lines.unshift(...npcSays(name, level >= 70 && player.name ? `Everyone here knows ${who}.` : level >= 40 && player.name ? `${who}! What brings you back?` : "Back already?"));
  }
  // Craftsfolk have work going.
  if (PATRONS[base] && !dialogue.onEnd) {
    const option = { label: "Any work going?", then: () => orderDialogue(game, base, name) };
    dialogue.options = [...(dialogue.options ?? []).filter(entry => !/^(Goodbye|Not today|Just|Maybe later|Nothing)/.test(entry.label)), option, { label: "Goodbye.", then: () => null }];
  }
  // Townsfolk have heard things.
  if (GOSSIPS.test(base) && !dialogue.onEnd) {
    const here = game.npcs.filter(npc => npc.id === base).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
    const option = { label: "Heard any rumours?", then: () => chat(name, npcSays(name, rumourAt(game, here?.x ?? player.x, here?.y ?? player.y))) };
    dialogue.options = [...(dialogue.options ?? []).filter(entry => !/^(Goodbye|Not today|Just|Maybe later|Nothing)/.test(entry.label)), option, { label: "Goodbye.", then: () => null }];
  }
  return dialogue;
}
function talkInner(game: Game, npcId: string, everyday = false): Dialogue {
  const player = game.player, def = NPCS[npcId.split(":")[0]], name = def.name;
  // The bars' people: barkeeps with their quests (until they're done), the quiet traders.
  if (!everyday) { const bar = talkBar(game, npcId, name, () => talkInner(game, npcId, true)); if (bar) return bar; }
  const west = talkWest(game, npcId, name); if (west) return west;
  switch (npcId) {
    case "slayer_master:assignment": case "slayer_master": {
      const task = currentTask(game);
      if (task) return chat(name, npcSays(name, `${taskText(game)} Come back when they're done.`, `Points: ${slayerPoints(game)}. Contracts in a row: ${slayerStreak(game)}. Every tenth contract pays five times over.`), [
        { label: "Call it done (two caskets of RF).", then: () => { game.ui.rfAction = { kind: "slayer-complete", caskets: 2, text: `The Warden marks your contract done for two Rare Caskets' worth of simulated RF: the streak and the points are yours as if you'd finished it (${taskText(game)}).` }; return null; } },
        { label: "Give me a different one (one casket of RF).", then: () => { game.ui.rfAction = { kind: "slayer-reroll", caskets: 1, text: "A fresh contract for one Rare Casket's worth of simulated RF; your streak stands." }; return null; } },
        { label: "I'll get on with it.", then: () => null },
      ]);
      if (npcId === "slayer_master") return chat(name, npcSays(name, "Pursuance is knowing what you hunt. How a thing fights, what it fears, where it beds down, which way it went. Know that, and you'll hunt it better than anyone with a bigger sword.",
        "I give contracts and pay in points. And I'll tell you what I know about anything you've met, for a price."), [
        { label: "Give me a contract.", then: () => talk(game, "slayer_master:assignment") },
        { label: "Tell me about a creature.", then: () => talk(game, "slayer_master:research") },
        { label: "I've brought trophies.", then: () => talk(game, "slayer_master:trophies") },
        { label: "What can points buy?", then: () => talk(game, "slayer_master:rewards") },
        { label: "Maybe later.", then: () => null },
      ]);
      if (!eligibleTasks(game).length) return chat(name, npcSays(name, "Come back when you can hold a sword the right way round."));
      assignTask(game);
      return chat(name, npcSays(name, `${taskText(game)} Take a Warden's gem from my shop if you want to check on it.`));
    }
    case "slayer_master:research": {
      // Research: she tells you all she knows of a creature you've met, for points.
      const list = researchable(game).slice(0, 6);
      if (!list.length) return chat(name, npcSays(name, "You know everything I'd tell you about what you've met. Go and meet something worse."));
      return chat(name, npcSays(name, `You have ${slayerPoints(game)} Pursuance points. Which one?`), [
        ...list.map(def => ({ label: `${def.name} (${researchCost(def)} points)`, then: () => research(game, def.id) ? chat(name, npcSays(name, `The ${def.name}. Here's what I know. It's in your journal now.`)) : null })),
        { label: "Never mind.", then: () => null },
      ]);
    }
    case "slayer_master:trophies": {
      // Trophies of marked creatures, for points.
      const have = count(game.player, "hunters_trophy");
      if (!have) return chat(name, npcSays(name, "Trophies come from marked creatures: one in a great many comes back stronger, and wearing it. Bring me what you take from them."));
      take(game.player, "hunters_trophy", have); game.player.questData.slayer_points = slayerPoints(game) + have * TROPHY_POINTS; sound(game, "coins");
      return chat(name, npcSays(name, `${have} trophies. That's ${have * TROPHY_POINTS} points, and a story for every one.`));
    }
    case "slayer_master:rewards": {
      const points = slayerPoints(game);
      return chat(name, npcSays(name, `You have ${points} Pursuance points.`), [
        ...SLAYER_REWARDS.map(reward => ({ label: `${reward.name} (${reward.cost} points)`, then: () => { buySlayerReward(game, reward.id); return null; } })),
        { label: "Nothing for now.", then: () => null },
      ]);
    }
    case "stablemaster": return chat(name, npcSays(name, "Welcome to the Friendhollow stables! Every horse here is fed, groomed and ready to ride. Pay in RF and one's yours: it'll carry you faster than you can run, and never tire."), [
      { label: "Show me the horses.", then: () => { game.ui.shop = "__stable"; return null; } },
      { label: "What does riding do?", then: () => chat(name, npcSays(name, "A horse gallops two tiles for every one you'd walk, and doesn't use your run energy. Unicorns go faster still. And each has a gift: a warhorse keeps you steady, a palomino helps you learn. Ride from the saddle button by your run orb.")) },
      { label: "Just looking.", then: () => null },
    ]);
    case "rare_trader": return chat(name, npcSays(name, "Rare Caskets, and bundles to go with them. Every bundle buys caskets with simulated $RAREFRIENDS, and I add something useful on top.",
      "There's one of me in Friendhollow, Emberforge, the Oasis, Frostpeak and on Pike's Pier."), [
      { label: "Show me the Rare Market.", then: () => { game.ui.shop = "__market"; return null; } },
      { label: "Show me the caskets.", then: () => { game.ui.shop = "__caskets"; return null; } },
      { label: "Just looking.", then: () => null },
    ]);
    case "archmage": {
      if (!data(game, "archmage_gift")) return chat(name, npcSays(name, "A new face! Every Friend who climbs my stairs deserves a start in magic.",
        "Robes, a staff, and enough sigils to learn your first spells. The stones downstairs are sigil stones: press them at an altar and you'll never buy a sigil again."), undefined, () => {
        player.questData.archmage_gift = 1;
        for (const id of ["scholar_hat", "scholar_robe", "scholar_skirt", "staff"]) giveOrDrop(game, id);
        for (const [id, n] of [["breeze_sigil", 150], ["thought_sigil", 150], ["tide_sigil", 60], ["stone_sigil", 60], ["ember_sigil", 60], ["path_sigil", 3]] as const) giveOrDrop(game, id, n);
        message(game, "Archmage Solenne gives you scholar's robes, a staff and a pouch of sigils.", "quest"); sound(game, "quest");
      });
      if (stage(game, "mages_satchel") === 1 || (stage(game, "mages_satchel") === 0 && level(game, "magic") >= 30 && game.rng() < 2)) {
        const satchel = () => fetchQuest(game, name, "mages_satchel", {
          offer: ["You've noticed my bag. Purple, gold stars, and it has never once run out. Every mage should have one.", "Bring me 3 leather for the bag, 60 star sigils to stitch the stars, and 20 thought sigils so it learns what a spell wants of it. I'll sew it on the spot."],
          accept: "Good. Mind the star sigils: Frostpeak's altar presses them.", progress: "Three leather, sixty star sigils, twenty thought sigils. The bag can wait; it's patient. So am I.",
          have: () => count(player, "leather") >= 3 && count(player, "star_sigil") >= 60 && count(player, "thought_sigil") >= 20,
          take: () => { take(player, "leather", 3); take(player, "star_sigil", 60); take(player, "thought_sigil", 20); },
          done: ["There. A sigil satchel: wear it on your back or keep it in your pack. Fill it with every sigil you own; your spells will reach into it before they reach into your pockets."],
          reward: () => { giveOrDrop(game, "sigil_satchel"); addXp(game, "magic", 2000, { raw: true }); },
        });
        if (stage(game, "mages_satchel") === 1) return satchel();
        return chat(name, npcSays(name, "How goes the magic?"), [
          { label: "That bag of yours never runs out.", then: satchel },
          { label: "Tell me about Sigilcraft.", then: () => chat(name, npcSays(name, "Mine sigil stones on the ground floor. Take them to an altar. Higher levels press more sigils from each stone.")) },
          { label: "Goodbye.", then: () => null },
        ]);
      }
      return chat(name, npcSays(name, "How goes the magic?"), [
        { label: "Tell me about Sigilcraft.", then: () => chat(name, npcSays(name, "Mine sigil stones on the ground floor. Take them to an altar: Breeze by the farms, Thought in Whisperwood, Tide on the lake shore, Stone in the Ashen Hills, Ember at the forge…",
          "…Shade in the Murkmire, Star on Frostpeak, Storm in the dunes, Bloom in the ruins, Path at the Oasis, and Hollow deep underground. Higher levels press more sigils from each stone.")) },
        { label: "What should I cast?", then: () => chat(name, npcSays(name, "Darts first, then Lances. A staff of your element saves you those sigils: Pell sells breeze, tide, stone and ember staffs downstairs.")) },
        { label: "Goodbye.", then: () => null },
      ]);
    }
    case "apprentice": return chat(name, npcSays(name, "Sigils, staffs and robes, cheaper than anywhere in the Realm. The Archmage insists.",
      "Carrying stones to the altars? Take a sigil stone box: it holds a hundred and twenty, and the altar empties it for you."), [
      { label: "Let me see.", then: () => { game.ui.shop = "wizards"; return null; } }, { label: "Later.", then: () => null }]);
    case "drake_hunter": return chat(name, npcSays(name, "Drakes up the pass, and Old Cinder asleep in the crater. Never go without a Wyrmward shield: King Hollis gives them to anyone who asks nicely.",
      "Drake bones are the best a priest can bury, and Tessa-trained crafters turn drakehide into archer's armour. Bring food. Lots."));
    case "bone_collector": return chat(name, npcSays(name, "Bones, hides, drakehides. I pay better than the general store. Don't ask what I do with them."), [
      { label: "Trade.", then: () => { game.ui.shop = "bones"; return null; } }, { label: "I won't ask.", then: () => null }]);
    case "cape_keeper": {
      const mastered = (Object.keys(player.xp) as (keyof typeof player.xp)[]).filter(skill => player.xp[skill] >= 13_034_431);
      if (!mastered.length) return chat(name, npcSays(name, "Every skill has a cape, and every cape has one price: 99,000 coins, and level 99. Come back when you've mastered something.",
        "Master two skills and I'll trim every cape you buy. Master them all and there's something special."));
      return chat(name, npcSays(name, `A master of ${mastered.length === 1 ? "a skill" : `${mastered.length} skills`}! Pick your cape: 99,000 coins each${mastered.length > 1 ? ", trimmed" : ""}.`), [
        { label: "Let me see the capes.", then: () => { game.ui.shop = "capes"; return null; } },
        { label: "Not today.", then: () => null },
      ]);
    }
    case "bowyer": return chat(name, npcSays(name, "Any bow fires any arrow, but you need the Ranged level for the arrowheads. Arrows come from your pack, and most can be picked up again.",
      "Rapid shoots faster, Longrange reaches further and trains Defence too. Crossbows fire bolts instead, and leave a hand free for a shield. Hides for archers are on the shelf.", "War bows? Only Hazel strings those, out in Fernwick, west through Whisperwood."), [
      { label: "Let me trade.", then: () => { game.ui.shop = "archery"; return null; } },
      { label: "Thanks.", then: () => null },
    ]);
    case "innkeeper": return chat(name, npcSays(name, (["Welcome to the Sleepy Friend! Bread, cake and a hot meal.", "The King eats here, you know. Once. He liked the cake.", "Night's coming. Best be indoors or by a lamp."] as const)[Math.floor(game.rng() * 3)]), [
      { label: "What's on the menu?", then: () => { game.ui.shop = "inn"; return null; } },
      { label: "Just passing through.", then: () => null },
    ]);
    case "guide": {
      const family = FAMILY_NAMES[player.familyId], perk = FAMILY_PERKS[player.familyId];
      const tips = (): Dialogue => chat(name, npcSays(name,
        "Left-click does the first option. Right-click anything for every option, like Examine.",
        "Hold WASD or the arrows to walk. Toggle Run by the minimap. Scroll to zoom. Press M for the world map.",
        "Chop trees, fish at the lake, mine in the Ashen Hills north of here. Cook your catch on a range or a fire.",
        "Quests are in the quest tab. Cook Mabel and Captain Rook in the castle always need help.",
      ));
      return chat(name, npcSays(name, `Welcome to the Realm, ${family}. Your Friend's family gives you a perk: ${perk.title}. ${perk.text}`), [
        { label: "How do I play?", then: tips },
        { label: "Where should I go first?", then: () => chat(name, npcSays(name,
          "Try the trees around town with your axe, then fish minnows at Glass Lake to the south-east.",
          "Hollow Farms to the west has cows and chickens. Grumblins in Whisperwood are good practice, if you're brave.",
          "The bank is north-west of the fountain. Deposit what you don't need.")) },
        { label: "What are Rare Caskets?", then: () => chat(name, npcSays(name,
          "The Relic keeper in the castle sells Rare Caskets for simulated $RAREFRIENDS.",
          "Each holds a Rare Relic you keep for a bonus or redeem for RF, plus a wardrobe piece for your Friend.")) },
        { label: "Can I get a new starter kit?", then: () => {
          if (has(player, "pewter_axe") || has(player, "tinderbox")) return chat(name, npcSays(name, "You still have your tools. Check your inventory!"));
          for (const id of ["pewter_axe", "pewter_pickaxe", "small_net", "tinderbox"]) giveOrDrop(game, id);
          return chat(name, npcSays(name, "Here you go: an axe, a pickaxe, a net and a tinderbox. Look after them."));
        } },
      ]);
    }
    case "cook": {
      const s = stage(game, "friends_feast");
      if (s === 0) return chat(name, npcSays(name, "Oh dear, oh dear. The Realm Feast is tonight and I've nothing to bake with!"), [
        { label: "What's wrong?", then: () => chat(name, npcSays(name, "I need an egg, a pot of flour and a bucket of milk. Could you fetch them?",
          "Eggs are in the coop at Hollow Farms, west of town. The dairy cow's in the pen there too. Grain grows in the field, and Miller Dunn will tell you about the mill."), [
          { label: "I'll get them.", then: () => { player.quests.friends_feast = 1; message(game, "Quest started: A Friend's Feast.", "quest"); return chat(name, npcSays(name, "Bless you! A pot and a bucket are in the General Store if you need them.")); } },
          { label: "Not right now.", then: () => null },
        ]) },
        { label: "Nothing, bye.", then: () => null },
      ]);
      if (s === 1) {
        const ready = has(player, "egg") && has(player, "pot_of_flour") && has(player, "bucket_of_milk");
        if (!ready) return chat(name, npcSays(name, "Have you got my egg, pot of flour and bucket of milk? Check your quest journal if you've forgotten."));
        return chat(name, [...playerSays("I have everything!"), ...npcSays(name, "Wonderful! The Feast is saved. Take this, and my secrets of the range.")], undefined, () => {
          take(player, "egg"); take(player, "pot_of_flour"); take(player, "bucket_of_milk"); give(player, "pot"); give(player, "bucket");
          addXp(game, "cooking", 1500, { raw: true }); giveOrDrop(game, "coins", 300); giveOrDrop(game, "cake", 2);
          completeQuest(game, "friends_feast");
        });
      }
      return chat(name, npcSays(name, "Everyone's still talking about the Feast! Use my range whenever you like."));
    }
    case "captain": {
      const s = stage(game, "grumblin_trouble");
      if (s === 0) return chat(name, npcSays(name, "Grumblins. Grumbling. All night, from Whisperwood. My guards can't sleep."), [
        { label: "Can I help?", then: () => { player.quests.grumblin_trouble = 1; player.questData.grumblins = 0; message(game, "Quest started: Grumblin Trouble.", "quest");
          return chat(name, npcSays(name, "Defeat six of them. Their camp is in Whisperwood, west past the farms. Take a sword from Emberforge if you have one, or at least that dagger.")); } },
        { label: "Sounds like your problem.", then: () => null },
      ]);
      if (s === 1) {
        if (data(game, "grumblins") < 6) return chat(name, npcSays(name, `Only ${data(game, "grumblins")} so far. I still hear grumbling.`));
        return chat(name, npcSays(name, "Silence at last! Take this sabre. You've earned it."), undefined, () => {
          giveOrDrop(game, "blackiron_sabre"); addXp(game, "attack", 1200, { raw: true }); addXp(game, "strength", 1200, { raw: true }); giveOrDrop(game, "coins", 200);
          completeQuest(game, "grumblin_trouble");
        });
      }
      return chat(name, npcSays(name, "The Hall sleeps well thanks to you."));
    }
    case "smith": {
      const s = stage(game, "cold_forge");
      if (s === 0) return chat(name, npcSays(name, "The forge went cold when the ember was stolen. A forge needs metal to remember how to burn."), [
        { label: "What can I bring?", then: () => { player.quests.cold_forge = 1; message(game, "Quest started: The Cold Forge.", "quest");
          return chat(name, npcSays(name, "Three pewter bars and two blackiron bars. Smelt them at my furnace. It still works if you coax it.")); } },
        { label: "Good luck with that.", then: () => null },
      ]);
      if (s === 1) {
        if (count(player, "pewter_bar") < 3 || count(player, "blackiron_bar") < 2) return chat(name, npcSays(name, "Three pewter bars and two blackiron bars. The furnace is right there."));
        return chat(name, npcSays(name, "Listen to that… the forge remembers! Here, an ashsteel pickaxe and some inkcoal to go with it."), undefined, () => {
          take(player, "pewter_bar", 3); take(player, "blackiron_bar", 2); giveOrDrop(game, "ashsteel_pickaxe"); giveOrDrop(game, "inkcoal", 10); giveOrDrop(game, "forge_ember");
          addXp(game, "smithing", 2500, { raw: true }); addXp(game, "mining", 1200, { raw: true });
          completeQuest(game, "cold_forge");
        });
      }
      return chat(name, npcSays(name, "Use my anvils any time. Hammer in your pack, bars in your hand."));
    }
    case "mender": return chat(name, npcSays(name, "Hurt? Sit. I mend what the Realm breaks, and I keep the Heartguard: red for the blood, white for the bandage.",
      "A piece for every ten Hitpoints levels, boots at 10 to the blade at 90. Each one you wear adds a hitpoint and quickens your healing; wear all nine and food goes further."), [
      { label: "Show me the Heartguard.", then: () => { game.ui.shop = "mender"; return null; } },
      { label: "How do I raise Hitpoints?", then: () => chat(name, npcSays(name, "Every blow you land, every arrow, every spell: a third of that experience is Hitpoints. Fight, and eat when you must.")) },
      { label: "Just looking.", then: () => null },
    ]);
    case "priest": {
      const s = stage(game, "hollow_whispers");
      if (s === 0) return chat(name, npcSays(name, "Rattle rattle. Forgive me, old habit. I hear whispers at night, from the Murkmire crypt."), [
        { label: "I'll look into it.", then: () => { player.quests.hollow_whispers = 1; message(game, "Quest started: Hollow Whispers.", "quest");
          return chat(name, npcSays(name, "The crypt is south-west, past the farms, in the swamp. The skeletons there were Friends once. Be kind, and be quick.")); } },
        { label: "How do I train Faith?", then: () => chat(name, npcSays(name, "Bury bones, or offer them on an altar for twice the blessing. Large bones and ink bones are worth more. Pray at my altar to restore your faith.", "The Order of the Dawn, east of Highcairn, can teach you more.")) },
        { label: "No thanks.", then: () => null },
      ]);
      if (s < 3) return chat(name, npcSays(name, "The whispers go on. The crypt is in Murkmire, south-west."));
      if (s === 3) return chat(name, npcSays(name, "Silence! You did it. Wear this. The Old Friend watches over those who wear it."), undefined, () => {
        giveOrDrop(game, "friends_charm"); addXp(game, "prayer", 2500, { raw: true }); giveOrDrop(game, "large_bones", 5);
        completeQuest(game, "hollow_whispers");
      });
      return chat(name, npcSays(name, "May your bones rest easy, when the time comes. Not soon, I hope."));
    }
    case "glimmer": {
      const s = stage(game, "lost_glimmer"), k = stage(game, "hollow_king");
      if (s === 0) return chat(name, npcSays(name, "Hmmm. Hmmmmm. My Glimmer is gone. Shattered. Three shards, scattered to the corners."), [
        { label: "I'll find the shards.", then: () => { player.quests.lost_glimmer = 1; message(game, "Quest started: The Lost Glimmer.", "quest");
          return chat(name, npcSays(name, "One went to the loudest Grumblin. One sank into something in the Murkmire mud. One fell down the well, here in town.")); } },
        { label: "Who are you?", then: () => chat(name, npcSays(name, "I'm Friend #7730. I was hovering here before the fountain. Before the town, even.")) },
      ]);
      if (s === 1) {
        if (count(player, "glimmer_shard") < 3) return chat(name, npcSays(name, `You have ${count(player, "glimmer_shard")} of 3 shards. The grumbler, the mud, the well.`));
        return chat(name, npcSays(name, "Ahhh. It hums again. Take this staff. And this: the Realm remembers you now."), undefined, () => {
          take(player, "glimmer_shard", 3); giveOrDrop(game, "breeze_staff"); giveOrDrop(game, "thought_sigil", 100); giveOrDrop(game, "path_sigil", 5);
          addXp(game, "magic", 2500, { raw: true });
          completeQuest(game, "lost_glimmer");
        });
      }
      if (k === 0) {
        if (!questDone(game, "hollow_whispers")) return chat(name, npcSays(name, "The Glimmer shows me the crypt. It's still whispering. Help Brother Ossic, then come back."));
        return chat(name, npcSays(name, "Now the Glimmer shows me the deepest place. The Hollow King is waking in the Hollow Depths, under the Mossy Ruins."), [
          { label: "I'll end him.", then: () => { player.quests.hollow_king = 1; message(game, "Quest started: The Hollow King.", "quest");
            return chat(name, npcSays(name, "The Hollow gate will open for you now. Bring food. Lots. And pray. The Hollow Rift is south, past the ruins.")); } },
          { label: "Maybe later.", then: () => null },
        ]);
      }
      if (k === 1) return chat(name, npcSays(name, "The Hollow King is waiting. Rift in the Mossy Ruins, south. Bring food."));
      if (k === 2 && has(player, "hollow_crown")) return chat(name, npcSays(name, "His crown. Weightless, like I said. Wear this one instead. It's heavier, in the good way."), undefined, () => {
        take(player, "hollow_crown"); giveOrDrop(game, "realm_crown"); giveOrDrop(game, "hollow_cape"); giveOrDrop(game, "coins", 10_000);
        for (const skill of ["attack", "strength", "defence", "hitpoints", "magic"] as const) addXp(game, skill, 5000, { raw: true });
        completeQuest(game, "hollow_king");
      });
      if (k === 2) return chat(name, npcSays(name, "You beat him but lost his crown? Find it. It can't have gone far. It weighs nothing, after all."));
      return chat(name, npcSays(name, "Hover well, hero."));
    }
    case "miller": return chat(name, npcSays(name, "Pick grain from the wheat field, then use it on the hopper. Bring a pot to catch the flour. Easy!"));
    case "hazel": {
      if (stage(game, "hazels_quiver") >= 2 && game.rng() < 0.35) return chat(name, npcSays(name, "My grandmother's quiver. Her mother made the first war bow in Fernwick, from a yew the Whisperwood gave up in a storm. Every bow I string, I string the way she did.", "The castle has one of hers in its armoury. Never been drawn. They don't know what it's for."), [{ label: "I'll let you work.", then: () => null }]);
      const s = stage(game, "hazels_quiver"), ready = has(player, "torn_quiver") && count(player, "leather") >= 2 && count(player, "feather") >= 15 && count(player, "oak_logs") >= 5;
      const owned = has(player, "hazels_quiver") || player.equipment.cape === "hazels_quiver" || player.bank.some(slot => slot.id === "hazels_quiver");
      const quest = s === 0 ? [{ label: "You look troubled.", then: () => chat(name, npcSays(name, "The Grumblins came up from their camp last night and took my grandmother's quiver. It's no ordinary quiver: shoot from it and the arrows fly home.",
        "Their chief will have it. Bring it back, with 2 leather, 15 feathers and 5 oak logs for a new frame, and I'll stitch it whole and it's yours. I've a war bow to string."), [
        { label: "I'll get it back.", then: () => { player.quests.hazels_quiver = 1; message(game, "Quest started: Hazel's Quiver.", "quest"); return chat(name, npcSays(name, "The camp's just south of the village. Mind the chief: he bites.")); } },
        { label: "Not right now.", then: () => null }]) }]
        : s === 1 ? [{ label: ready ? "I have everything for the quiver." : "About your quiver…", then: () => {
          if (!ready) return chat(name, npcSays(name, has(player, "torn_quiver") ? "You found it! I still need 2 leather, 15 feathers and 5 oak logs to mend it." : "The Grumblin chief has it, down at the camp south of here. Then 2 leather, 15 feathers and 5 oak logs."));
          return chat(name, npcSays(name, "My grandmother's quiver! Give me a moment…", "There. New oak frame, fresh leather, and the fletching charm stitched back in. Shoot from it and watch."), undefined, () => {
            take(player, "torn_quiver", 1); take(player, "leather", 2); take(player, "feather", 15); take(player, "oak_logs", 5); giveOrDrop(game, "hazels_quiver");
            addXp(game, "ranged", 1500, { raw: true }); addXp(game, "fletching", 1000, { raw: true }); addXp(game, "crafting", 500, { raw: true });
            completeQuest(game, "hazels_quiver");
          });
        } }]
        : owned ? [] : [{ label: "I lost the quiver.", then: () => chat(name, npcSays(name, "Lost it? Lucky for you I kept the pattern. Here, and try to keep this one."), undefined, () => giveOrDrop(game, "hazels_quiver")) }];
      return chat(name, npcSays(name, "War bows! Nobody else strings them: they take two logs and arms like mine. Slower than a plain bow, but every arrow lands like a hammer, and they reach a tile further.",
      "Crossbows are the other road: limbs from the anvil, a stock from your knife, and a steady hand (Craftwork) to fit them. They fire bolts, not arrows, and leave a hand free for a shield."), [
      ...quest,
      { label: "Show me the war bows.", then: () => { game.ui.shop = "war_bows"; return null; } },
      { label: "Which limbs fit which stock?", then: () => chat(name, npcSays(name, "Pewter on a plain wooden stock. Blackiron and ashsteel on oak. Moonsilver on willow, glimmer on maple, rarite on yew. Carve the stock with a knife on the logs, then use the limbs on it.")) },
      { label: "Thanks.", then: () => null },
    ]);
    }
    case "rowan": return chat(name, npcSays(name, "Welcome to Fernwick, the woodcutters' village. I buy logs for more than anyone in Friendhollow, and sell axes to cut them with.",
      "Oaks and maples all round us, willows by the pond. Bank's in the lodge, so you needn't walk back to town."), [
      { label: "Let's trade.", then: () => { game.ui.shop = "timber"; return null; } },
      { label: "Tell me about Fernwick.", then: () => chat(name, npcSays(name, "Woodcutters, four generations back, since the first axe bit the Whisperwood. Children here learn their trees before their letters: oak by the bark, willow by the lean, yew by the smell of it.", "We say 'measure twice, fell once', and 'never answer the wood'. The Whisperwood whispers. That's not a name.")) },
      { label: "Goodbye.", then: () => null },
    ]);
    case "birch": return chat(name, npcSays(name, (["Swing from the hips, not the shoulders. Trees respect that.", "Plain trees for learning, oaks at fifteen, willows at thirty, maples at forty-five. Yews grow south of the camp, and ashwood only up in Frostpeak.",
      "Grumblins come up from the camp some nights. We keep the fires lit.", "Fletch as you go: a knife on your logs makes shafts, bows, war bows and crossbow stocks."] as const)[Math.floor(game.rng() * 4)]));
    case "grandmaster": {
      const vigil = stage(game, "dawn_vigil"), light = stage(game, "greyhorn_light");
      if (vigil === 0) return chat(name, npcSays(name, "Welcome to Dawnhold. We are the Order of the Dawn: we keep watch against the dead that won't lie still, and we fight with faith as much as steel.",
        "Faith grows by burying the dead with respect, by offering bones at an altar (our chapel's most of all), and by striking true with a blessed weapon."), level(game, "prayer") < 10
        ? [{ label: "Can I join?", then: () => chat(name, npcSays(name, "Come back when your faith is stronger (Faith 10). Bury your bones. Pray."))}, { label: "Goodbye.", then: () => null }]
        : [{ label: "Can I join?", then: () => chat(name, npcSays(name, "Every squire begins with a vigil. Offer bones on our chapel altar, eight of them, and think on those they belonged to. Then come to me."), undefined, () => {
          game.player.quests.dawn_vigil = 1; game.player.questData.vigil_bones = 0; message(game, "Quest started: The Dawn Vigil.", "quest"); }) }, { label: "Not today.", then: () => null }]);
      if (vigil === 1) {
        if (data(game, "vigil_bones") < VIGIL_BONES) return chat(name, npcSays(name, `The vigil isn't kept yet. Offer bones on the chapel altar: ${Math.max(0, VIGIL_BONES - data(game, "vigil_bones"))} more.`));
        return chat(name, npcSays(name, "Sister Maren says the candles flared for you. Kneel.", "I name you a squire of the Order of the Dawn. Take this sword, and let Quartermaster Bram arm you further."), undefined, () => {
          giveOrDrop(game, "dawnsteel_sword"); giveOrDrop(game, BONE_BAG); addXp(game, "prayer", 1500, { raw: true });
          completeQuest(game, "dawn_vigil");
        });
      }
      if (light === 0) return chat(name, npcSays(name, "Squire. Our relic, the Dawnstone, broke in the Greyhorn mine when the golems woke, and they took its shards into themselves. We could use a braver arm than mine these days."), level(game, "prayer") < 30
        ? [{ label: "I'll bring it back.", then: () => chat(name, npcSays(name, "Your faith isn't ready for that mine yet (Faith 30). Offer bones. Fight with a blessed blade."))}, { label: "Goodbye.", then: () => null }]
        : [{ label: "I'll bring it back.", then: () => chat(name, npcSays(name, "Three shards. Break the golems, bring the shards to our altar and pray over them. Then bring me the stone."), undefined, () => {
          game.player.quests.greyhorn_light = 1; message(game, "Quest started: Light in the Greyhorn.", "quest"); }) }, { label: "Not yet.", then: () => null }]);
      if (light === 1) return chat(name, npcSays(name, `Three shards from the golems of the Greyhorn mine, then the chapel altar. You carry ${count(game.player, "dawnstone_shard")}.`));
      if (light === 2) return chat(name, npcSays(name, has(game.player, "dawnstone") ? "The Dawnstone! Whole again, and warm as morning. Kneel, squire, and rise a knight." : "The stone? Bring it here."), undefined, () => {
        if (!has(game.player, "dawnstone")) return;
        take(game.player, "dawnstone"); giveOrDrop(game, "dawn_cape"); addXp(game, "prayer", 5000, { raw: true }); addXp(game, "defence", 2000, { raw: true });
        completeQuest(game, "greyhorn_light");
      });
      const last = stage(game, "dawn_against_hollow");
      if (last === 0 && questDone(game, "restless_crypt") && questDone(game, "hollow_king")) return chat(name, npcSays(name, "Knight. The Hollow King is gone, but his sentinels still keep his gate in the Depths, and while it stands, the dead will keep rising.",
        `Destroy ${SENTINELS} of them with a blessed weapon, and bring me three Hollow essence to seal the gate with. Then you'll wear the Order's gold.`), level(game, "prayer") < 60
        ? [{ label: "I'll seal it.", then: () => chat(name, npcSays(name, "Not yet. That gate would swallow a faith weaker than 60."))}, { label: "Goodbye.", then: () => null }]
        : [{ label: "I'll seal it.", then: () => chat(name, npcSays(name, "Go with the Dawn."), undefined, () => { game.player.quests.dawn_against_hollow = 1; game.player.questData.sentinels = 0; message(game, "Quest started: Dawn Against the Hollow.", "quest"); }) },
          { label: "Not yet.", then: () => null }]);
      if (last === 1) {
        const ready = data(game, "sentinels") >= SENTINELS && count(game.player, "hollow_essence") >= 3;
        if (!ready) return chat(name, npcSays(name, `${Math.max(0, SENTINELS - data(game, "sentinels"))} sentinels still stand, and I need ${Math.max(0, 3 - count(game.player, "hollow_essence"))} more Hollow essence for the seal.`));
        return chat(name, npcSays(name, "The essence, and the sentinels fallen. Sister Maren and I will seal the gate at dawn.", "Kneel. Rise a Knight-Paladin of the Dawn, in the Order's gold."), undefined, () => {
          take(game.player, "hollow_essence", 3); giveOrDrop(game, "dawnplate_cuirass"); addXp(game, "prayer", 15000, { raw: true }); addXp(game, "defence", 5000, { raw: true });
          completeQuest(game, "dawn_against_hollow");
        });
      }
      const owned = has(game.player, "dawn_cape") || game.player.equipment.cape === "dawn_cape" || game.player.bank.some(slot => slot.id === "dawn_cape");
      return chat(name, npcSays(name, "The dead are restless in the crypts and the Hollow, knight. Our weapons bite them harder. Keep your faith strong."),
        owned ? undefined : [{ label: "I lost my cape.", then: () => chat(name, npcSays(name, "Here. White and gold, and try to keep it clean."), undefined, () => giveOrDrop(game, "dawn_cape")) }, { label: "Goodbye.", then: () => null }]);
    }
    case "chaplain": {
      const road = stage(game, "pilgrims_road"), crypt = stage(game, "restless_crypt"), p = game.player;
      const lesson = { label: "How do I grow in faith?", then: () => chat(name, npcSays(name, "Bury bones where you find them, or better, offer them here on the chapel altar: they count three times over.",
        "Pray at any altar to restore your faith. And a blessed weapon teaches faith with every true blow, a little at a time.")) };
      const bye = { label: "Goodbye.", then: () => null };
      // Squires who kept the vigil carry the Order's ossuary bag; one who has lost it (or kept the vigil before there were any) gets another.
      if (questDone(game, "dawn_vigil") && !ownsBoneBag(p)) return chat(name, npcSays(name, "A squire of the Dawn, carrying the dead loose in your pack? Take this: an ossuary bag, blessed for the vigil.",
        "It holds sixty bones of any kind and catches the ones you pick up. Use it on an altar and every bone inside is offered at once."), undefined, () => {
        giveOrDrop(game, BONE_BAG); message(game, "Sister Maren gives you an ossuary bag.", "quest"); sound(game, "quest");
      });
      if (road === 0 && questDone(game, "dawn_vigil")) return chat(name, npcSays(name, "Every knight of the Dawn walks the Pilgrim's Road once: the three old altars of the Realm, and the five wayward chapels the Order raised in the far places, one prayer at each."), level(game, "prayer") < 35
        ? [{ label: "I'll walk it.", then: () => chat(name, npcSays(name, "Not yet. The road is long for a young faith (Faith 35)."))}, lesson, bye]
        : [{ label: "I'll walk it.", then: () => chat(name, npcSays(name, "The chapel in Friendhollow, the mountain shrine here in Highcairn, and the old crypt altar in Murkmire. Then the wayward chapels: one out in the Westmarch, one on the Drakespine among the dragons, one in the Ironreach snows, one in The Wilds, and the great ruined one in the Deadwood. Kneel at each, then come back to me."), undefined, () => {
          p.quests.pilgrims_road = 1; message(game, "Quest started: The Pilgrim's Road.", "quest"); }) }, lesson, bye]);
      if (road === 1) {
        if (!PILGRIM_ALTARS.every(([key]) => data(game, key))) return chat(name, npcSays(name, `Still ${PILGRIM_ALTARS.filter(([key]) => !data(game, key)).map(([, altar]) => altar.toLowerCase()).join(", ")} to pray at. The road waits.`));
        return chat(name, npcSays(name, "You've the look of someone who's walked a long way to kneel. Good. These are yours: gold for the legs and feet that carried you."), undefined, () => {
          giveOrDrop(game, "dawnplate_greaves"); giveOrDrop(game, "dawnplate_boots"); addXp(game, "prayer", 9000, { raw: true }); addXp(game, "agility", 2500, { raw: true });
          completeQuest(game, "pilgrims_road");
        });
      }
      if (crypt === 0 && questDone(game, "pilgrims_road") && questDone(game, "greyhorn_light")) return chat(name, npcSays(name, "The candles for the Murkmire dead gutter every night. The crypt's skeletons are rising again, and ordinary steel only knocks them down for a while."),
        level(game, "prayer") < 45
          ? [{ label: "I'll lay them to rest.", then: () => chat(name, npcSays(name, "Your faith must be stronger first (Faith 45)."))}, lesson, bye]
          : [{ label: "I'll lay them to rest.", then: () => chat(name, npcSays(name, `Take a blessed weapon to the crypt and lay ${CRYPT_REST} of them to rest. Only a faith weapon's blow keeps them down.`), undefined, () => {
            p.quests.restless_crypt = 1; p.questData.crypt_rest = 0; message(game, "Quest started: The Restless Crypt.", "quest"); }) }, lesson, bye]);
      if (crypt === 1) {
        if (data(game, "crypt_rest") < CRYPT_REST) return chat(name, npcSays(name, `${Math.max(0, CRYPT_REST - data(game, "crypt_rest"))} more to lay to rest, with a faith weapon in your hand.`));
        return chat(name, npcSays(name, "The candles burn steady again. You've done the dead a kindness. Wear these: the Order's helm and gauntlets, and its sun on your shield."), undefined, () => {
          giveOrDrop(game, "dawnplate_helm"); giveOrDrop(game, "dawnplate_shield"); giveOrDrop(game, "dawnplate_gauntlets"); addXp(game, "prayer", 7000, { raw: true });
          completeQuest(game, "restless_crypt");
        });
      }
      return chat(name, npcSays(name, "Faith is trained like any other strength. Offer your bones, pray, and strike true."), [lesson, bye]);
    }
    case "quartermaster": return chat(name, npcSays(name, questDone(game, "dawn_vigil") ? `Blessed steel and chaplains' staffs, and the Order's own armour: an acolyte's vestments for anyone of Faith 10, the Vigil's mail at Defence and Faith 30${questDone(game, "greyhorn_light") ? "" : " once the Dawnstone's home"}, and Dawnplate for those who've earned it.` : "The armoury is for the Order's own. Keep the Dawn Vigil first."),
      questDone(game, "dawn_vigil") ? [{ label: "Show me.", then: () => { game.ui.shop = "armoury"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "dawn_knight": return chat(name, npcSays(name, (["Dawn comes. It always does.", "The golems in the Greyhorn mine hold something of ours.", "A blessed blade cuts the dead like wet paper.", "Offer your bones in the chapel. Sister Maren will light a candle."] as const)[Math.floor(game.rng() * 4)]));
    case "clothier": return chat(name, npcSays(name, "Real clothes for real adventurers! Shirts and belted tunics, trousers and skirts, and dresses that sweep the floor. Wear them under a cape, or on their own."), [
      { label: "Show me.", then: () => { game.ui.shop = "clothier"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "tailor": return chat(name, npcSays(name, "Capes in every colour, stripes, chevrons, quarters and stars, and hats to go with them: wizard's points, feathered caps, wide brims. Try something on!"), [
      { label: "Show me.", then: () => { game.ui.shop = "tailor"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "heft": return chat(name, npcSays(name, "Two hands, one swing, no argument. Greatswords, battleaxes and war hammers: slower than a sword, and they hit like a falling tree.",
      "No room for a shield, mind. Anvils make them too, three bars apiece, if you'd rather forge your own."), [
      { label: "Show me.", then: () => { game.ui.shop = "heft"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "mountain_guide": return chat(name, npcSays(name, (["Welcome to Highcairn, the town above the dunes. The road north-west climbs to the Frostpeak camp; the one west drops to the Oasis.",
      "The Greyhorn mine's up the scree to the north-east: glimmer and rarite, if your pick's up to it. Wolves and yetis like the snow up there.",
      "Greyhorn Tarn's south of town. Bring a rod and some feathers; the char are fat this time of year.", "Gloom hounds hunt the southern slopes after dark. Don't go down there light."] as const)[Math.floor(game.rng() * 4)]));
    case "miner": return chat(name, npcSays(name, "Pewter anyone can mine. Blackiron's further in. Inkcoal at the south end. There's moonsilver and a gem rock at the north edge, if you're good.",
      "Hauling inkcoal? Get yourself a satchel for your back. Holds a hundred and twenty, fills as you swing, and the furnace takes from it. I sell 'em, or stitch your own from three leather."), [
      { label: "Let's trade.", then: () => { game.ui.shop = "mine_supplies"; return null; } },
      { label: "Thanks.", then: () => null },
    ]);
    case "banker": return chat(name, npcSays(name, "Good day. Would you like to access your bank account?"), [
      { label: "Yes please.", then: () => { game.ui.bank = true; return null; } },
      { label: "No thanks.", then: () => null },
    ]);
    case "emporium": return chat(name, npcSays(name, "Rare Caskets, one simulated RF each. Every casket holds a Rare Relic and a wardrobe piece for your Friend.", "Keep a relic for its bonus, or redeem it for its RF value. Your wardrobe stays either way."), [
      { label: "Show me the caskets.", then: () => { emit(game, { type: "sound", name: "click", tick: game.tick }); game.ui.shop = "__caskets"; return null; } },
      { label: "Maybe later.", then: () => null },
    ]);
    case "agility": return chat(name, npcSays(name, "Five obstacles, in order, then again! Every lap pays a Wayfarer's mark, and I trade marks for gear that keeps you moving.",
      `You've ${count(game.player, WAYFARER_MARK)} mark${count(game.player, WAYFARER_MARK) === 1 ? "" : "s"}.`), [
      { label: "What does Wayfaring do?", then: () => chat(name, npcSays(name, "Run energy comes back faster and drains slower the better you get, you slip less on the hard courses, and shortcuts open up: the Murkmire stones at 20.",
        `There are three courses: this one, the ${COURSES.dunes.name} by the Oasis (level ${COURSES.dunes.level}) and the ${COURSES.frostpeak.name} up north (level ${COURSES.frostpeak.level}). Harder courses pay more marks.`)) },
      { label: "Trade marks.", then: () => talk(game, "agility:rewards") },
      { label: "Just stretching.", then: () => null },
    ]);
    case "agility:rewards": return chat(name, npcSays(name, `${count(game.player, WAYFARER_MARK)} mark${count(game.player, WAYFARER_MARK) === 1 ? "" : "s"} to spend.`), [
      ...WAYFARER_REWARDS.map(reward => ({ label: `${reward.name} (${reward.cost} mark${reward.cost > 1 ? "s" : ""})`, then: () => { buyWayfarerReward(game, reward.id); return null; } })),
      { label: "Nothing for now.", then: () => null },
    ]);
    case "witch": return chat(name, npcSays(name, "Heh heh. The stepping stones to the north need Wayfaring 20. The crypt's the other way. Mind the lurkers, dearie."));
    case "maiden_matriarch": return fetchQuest(game, name, "maidens_truce", {
      offer: ["Stop there. The Maidens hold the east of the wood, and we hold it against everyone: the dead, the Order, the Ring's bravos, you. I'll talk, because nobody else here will.", "Prove you fight the dead and not the living. Put ten of the Deadwood's dead down in the east of the wood, bring twelve grave dust for our hearth and four crypt bones for the shrine. Then there's a truce, and Wren's market is yours."],
      accept: "Ten of the dead, twelve dust, four crypt bones. My spearwomen will let you pass while you're at it. Don't make me regret it.", progress: "Ten of the dead in the east, twelve grave dust, four crypt bones. The truce waits on you.",
      have: () => data(game, "mt_dead") >= 10 && count(player, "grave_dust") >= 12 && count(player, "crypt_bones") >= 4, take: () => { take(player, "grave_dust", 12); take(player, "crypt_bones", 4); },
      done: ["The hearth burns the dust, the shrine takes the bones, and the Maidens keep a truce with you. Spears down, all of you.", "Wear this. It says you're one of ours, as far as anyone out here is concerned. Wren will sell you what the wood gives up."],
      reward: () => { giveOrDrop(game, "maiden_veil"); addXp(game, "prayer", 4000, { raw: true }); addXp(game, "slayer", 2000, { raw: true }); },
    });
    case "maiden_trader": return chat(name, npcSays(name, questDone(game, "maidens_truce") ? "Rarite from the Vault's dead, essence from the Hollow, shards, scales, cores, dust, keys to every locked door we've found. The wood gives it up; we sell it." : "Not to you. Not yet. The matriarch decides who we trade with."));
    case "maidens_villager": return chat(name, npcSays(name, questDone(game, "maidens_truce") ? "Truce-keeper. Mind the dead past the fence; they don't keep it." : "Keep walking. The matriarch said you could pass, not stay."));
    case "ringmaster": {
      if (game.arena) return chat(name, npcSays(name, "A match is on. Finish it, or walk out of the Ring to give it up."));
      const offer = (match: { id: string; name: string; level: number; coins: number; marks: number }) => ({ label: `${match.name} (level ${match.level}: pays ${match.coins.toLocaleString()} coins and ${match.marks} bloodmarks; ${entryFee(match.coins).toLocaleString()} to enter)`, then: () => { startMatch(game, match.id); return null; } });
      const chooseFoes = (): Dialogue => chat(name, npcSays(name, "Name the kind, then the creature. The purse goes by its level, and the gate costs a quarter of the purse."), [
        ...FOE_GROUPS.map(group => ({ label: group.name, then: () => chat(name, npcSays(name, `${group.name}. Which?`), [
          ...group.foes.map(foe => customMatch(foe)!).map(offer),
          { label: "Back.", then: () => chooseFoes() },
        ]) })),
        { label: "Back.", then: () => talkInner(game, "ringmaster") },
      ]);
      return chat(name, npcSays(name, "Welcome to the Rare Friends Ring. A great Friend built it, long ago, so the best fighters in the land could meet; the magic in these stones stands the fallen back up in the lobby. Name your match: the gate costs a quarter of the purse, and the purse and the bloodmarks are yours when the last creature falls. Anyone on the concourse can watch."), [
        ...MATCHES.map(offer),
        { label: "I'll choose my own foes.", then: () => chooseFoes() },
        { label: "Tell me about Friend Fights.", then: () => chat(name, npcSays(name, "Two Friends in the courtyard, and nobody dies: that's a Friend Fight. Right-click a Friend in the Ring to challenge them. Every win pays two laurels, and the Champions' Hall takes nothing else.")) },
        ...((player.stats.matches ?? 0) >= 3 || stage(game, "ringmasters_signet") > 0 ? [{ label: "About your signet.", then: () => fetchQuest(game, name, "ringmasters_signet", {
          offer: ["Three matches won. You keep coming back; most don't. I stamp a signet for fighters like you: a ring that carries you here three times a day, and lends the hand that wears it some of the pit's strength.", "Thirty bloodmarks for the iron and the stamping."],
          accept: "Thirty marks, and the signet's yours.", progress: "Thirty bloodmarks, and three matches won. The signet waits.",
          have: () => (player.stats.matches ?? 0) >= 3 && count(player, "bloodmark") >= 30, take: () => take(player, "bloodmark", 30),
          done: ["Stamped and warm. Rub it anywhere in the Realm and the Ring's magic brings you to the lobby; three times a day, and the day turns at midnight.", "Wear it on your hand, and swing harder for it."],
          reward: () => { giveOrDrop(game, "ringmasters_signet"); addXp(game, "strength", 2000, { raw: true }); },
        }) }] : []),
        { label: "Not today.", then: () => null },
      ]);
    }
    case "diamond_commander": case "ink_commander": case "sol_commander": case "hood_commander": case "ember_commander": {
      const order = ORDERS[npcId.split("_")[0] as keyof typeof ORDERS];
      // Meeting the Order's leader opens its content: its cards, its card looks. Persisted.
      player.questData[`met_${order.id}`] = 1;
      if (level(game, "prayer") < 20 && stage(game, `oath_${order.id}`) === 0) return chat(name, npcSays(name, `${order.godText}`, "Grow in faith first (Faith 20), and we'll talk of oaths."));
      return fetchQuest(game, name, `oath_${order.id}`, {
        offer: [order.godText, `To swear the ${order.short} Oath, kneel at our altar, and bring ${order.oath.text}.`],
        accept: `Kneel at the altar, and bring what the oath asks. The quartermaster sells to the sworn.`, progress: `The altar, and ${order.oath.text}. The oath waits.`,
        have: () => data(game, `prayed_${order.id}`) >= 1 && count(player, order.oath.item) >= order.oath.n, take: () => take(player, order.oath.item, order.oath.n),
        done: [`Sworn. You are of the ${order.name} now, and ${order.godName} knows your name.`, `Wear our cape, and buy what you can carry. ${order.effect}`],
        reward: () => { giveOrDrop(game, `${order.id}_cape`); addXp(game, "prayer", 3000, { raw: true }); },
      });
    }
    case "diamond_quartermaster": case "ink_quartermaster": case "sol_quartermaster": case "hood_quartermaster": case "ember_quartermaster": { const order = ORDERS[npcId.split("_")[0] as keyof typeof ORDERS]; return chat(name, npcSays(name, questDone(game, `oath_${order.id}`) ? `Oathbound, Knight and Paladin: helm, cuirass, greaves, gauntlets, boots, the kite and the aegis, the mace, the greatmace and the staff, all blessed at our altar. ${order.effect}` : `The ${order.name} arms its own. Swear the oath with the commander and I'll open the racks.`)); }
    case "diamond_guard": case "ink_guard": case "sol_guard": case "hood_guard": case "ember_guard": { const order = ORDERS[npcId.split("_")[0] as keyof typeof ORDERS]; return chat(name, npcSays(name, `${order.godName}, keep you. The hall is open to those who come in peace; the oath is for those who stay.`)); }
    case "ring_apothecary": return chat(name, npcSays(name, "Tonics, potions and something to eat between matches. Drink before you go in, not after you come out."));
    case "ring_chaplain": return chat(name, npcSays(name, "The Ringmaker fought by faith, they say. Faith potions, sigils for the holy spells, the Acolyte's vestments, maces and the aegis: all here."));
    case "ring_sigilist": return chat(name, npcSays(name, "Sigils for every element, and the elemental staffs. Mages win more matches than you'd think; the creatures can't dodge."));
    case "ring_fletcher": return chat(name, npcSays(name, "Bows and arrows, and the hunter's leathers. The archers in the Vault's Dead match are the only ones who'll shoot back."));
    case "ring_armourer": return chat(name, npcSays(name, "Pewter to glimmer, helm to boots, for coin. The Quartermaster across the way sells the Ring's own, for bloodmarks."));
    case "ring_weaponsmith": return chat(name, npcSays(name, "Daggers, swords and sabres for the quick; greatswords, battleaxes and war hammers for the strong. Pewter to glimmer, every one of them honed.", "Maces and flails too, from Dawnhold. The chaplain blesses them; I only sharpen."));
    case "ring_quartermaster": return chat(name, npcSays(name, "Bloodmarks. Nothing else. Pitfighter for the new, ringsteel for the proven, Wildfur for the ones who fight hardest when they're nearly done. Skull masks for everyone."));
    case "ring_champion": return chat(name, npcSays(name, "Laurels, won from other Friends in the courtyard. The crown, the cape, the gauntlets and the gilded mask: the Hall sells them for nothing else."));
    case "fisher":
      if (stage(game, "deepglass_heart") > 0 || combatLevel(player) >= 30) return fetchQuest(game, name, "deepglass_heart", {
        offer: ["Glass Lake's gone cloudy on the east shore. Never done that. There's a crack in the rock over there that wasn't there in spring, and it glows of a night.", "Something's in under the lake. Go down and see. Crack six of those glass crabs for me, bring me three shards of whatever's growing down there, and if the lake's got a heart, still it."],
        accept: "East shore, by the dark grass. Mind the bats.", progress: "Six crabs, three shards, and the thing at the bottom. The lake's still cloudy.",
        have: () => data(game, "dg_crabs") >= 6 && count(player, "crystal_shard") >= 3 && data(game, "dg_golem") >= 1, take: () => take(player, "crystal_shard", 3),
        done: ["Clear as glass again. Look at that.", "Here. I strung one of your shards. The lake looks after its own; now it'll look after you."],
        reward: () => { giveOrDrop(game, "glass_charm"); give(player, "coins", 800); addXp(game, "fishing", 3000, { raw: true }); addXp(game, "attack", 2500, { raw: true }); },
      });
      return chat(name, npcSays(name, "Cages for inkcrabs, harpoons for sailfish, off the end of the pier. Inksharks in the deep bit, if you've the skill. And there's a deep spot up on the Frostpeak tarn."));
    case "tanner": return chat(name, npcSays(name, "I'll tan cowhides into leather for 2 coins each. Then use a needle and thread on the leather to craft armour."), [
      { label: "Tan my hides.", then: () => { tanHides(game); return null; } },
      { label: "Trade.", then: () => { game.ui.shop = "crafting"; return null; } },
      { label: "Bye.", then: () => null },
    ]);
    case "villager": return chat(name, npcSays(name, (["Nice day for it.", "Have you been up the castle stairs? The King receives visitors.", "They say there's a king under the ruins. A hollow one.", "I'd buy a Rare Casket if I had any RF.", "Warden Thistle's always looking for Slayers. Market Street, south of the fountain.", "Wren's bows are the best in the Realm. Ask anyone. Ask Wren."] as const)[Math.floor(game.rng() * 6)]));
    case "guard": return chat(name, npcSays(name, "Move along."));
    case "royal_guard": return chat(name, npcSays(name, (["The King is receiving visitors. Mind your manners.", "The view from the roof? Best in the Realm. Stairs in the north-east tower.", "No running in the throne room."] as const)[Math.floor(game.rng() * 3)]));
    case "king": {
      const talk: Dialogue["options"] = [
        { label: "Who are you?", then: () => chat(name, npcSays(name, "Hollis, King of Hollowmere, by the grace of the First Friend and a very close vote. Friendhollow's the town; Hollowmere's the kingdom, from the coast to Westwatch. Nobody calls it that but the clerks and the soldiers.", "This was a hall, once. Then it grew towers. Then it grew me.")) },
        { label: "Tell me about the Realm.", then: () => chat(name, npcSays(name, "North: the Ashen Hills and the Emberforge. East: the Oasis and Glass Lake. South: the Mossy Ruins, and under them...",
          questDone(game, "hollow_king") ? "Nothing, now. You saw to that." : "Something hollow that wants a throne. Old Glimmer, by the fountain, knows more than I do.")) },
        { label: "Can I help the kingdom?", then: () => chat(name, npcSays(name, QUESTS.every(quest => questDone(game, quest.id)) ? "You already have, in every way I can think of. Rest a while." :
          "My cook is always short of something, my captain can't sleep for the Grumblins, and Brother Ossic hears whispers. Start with them.")) },
        { label: "I'm going after dragons.", then: () => {
          if (has(player, "wyrmward_shield") || player.equipment.shield === "wyrmward_shield") return chat(name, npcSays(name, "You already carry one of my shields. Keep it between you and the fire."));
          return chat(name, npcSays(name, "Dragons! Then take this. A Wyrmward shield: it turns their breath to a warm breeze. Mostly."), undefined, () => { giveOrDrop(game, "wyrmward_shield"); message(game, "King Hollis hands you a Wyrmward shield.", "quest"); });
        } },
        { label: "What is Raria?", then: () => chat(name, npcSays(name, "I wish I knew. My grandfather's maps show nothing past the Drakespine but drakes. My captain's map shows a city. Nobody saw them build it, nobody saw them march in, and their soldiers were dug in before we knew their name.",
          "The castle was built facing west. Against something. The masons' book says only 'against the return'. I used to think that was poetry.", questDone(game, "west_watch") ? "You've walked out there. You've seen it. Tell me: does it look new to you?" : "Captain Ashby by the square wants someone to walk west and look. I'd take it as a kindness.")) },
        ...(questDone(game, "known_hall") && (stage(game, "the_remembered") > 0 || presenceLevel(player) >= 60) ? [{ label: stage(game, "the_remembered") === 0 ? "They say the Realm forgets." : "About being remembered…", then: () => theRemembered(game, name) }] : []),
        { label: "Goodbye, Your Majesty.", then: () => null },
      ];
      if (!data(game, "royal_audience")) return chat(name, npcSays(name, "A visitor! Welcome to Friendhollow Castle. Here: every Friend on the road should have a little coin."), undefined, () => {
        player.questData.royal_audience = 1; giveOrDrop(game, "coins", 250); message(game, "King Hollis gives you 250 coins.");
      });
      if (questDone(game, "hollow_king")) return chat(name, npcSays(name, "The hero of the Hollow Depths, in my throne room! Sit anywhere. Not there, that's the Queen's."), talk);
      return chat(name, npcSays(name, "Welcome back, friend. What can the crown do for you?"), talk);
    }
    // ---------- The wider world's villages ----------
    case "gravesend_keeper": return fetchQuest(game, name, "gravesend_lanterns", {
      offer: ["The Deadwood gives its dead back, and we put them down again. That's Gravesend. The lanterns keep the worst of it off, when they're lit.", "Put eight of the Deadwood's skeletons down for me, and bring five bones to bless. The lanterns burn on bone-oil."],
      accept: "Go careful. They're slow, but there are a lot of them.", progress: "Eight skeletons, and five bones for the oil. The lanterns are waiting.",
      have: () => data(game, "gs_skeletons") >= 8 && count(game.player, "bones") >= 5, take: () => take(game.player, "bones", 5),
      done: ["The oil's pressed, the lanterns are lit. Gravesend sleeps a little easier.", "Take this. It's what we wear for the ones we lose. You've earned the right."],
      reward: () => { giveOrDrop(game, "mourners_hood"); give(game.player, "coins", 400); addXp(game, "prayer", 2000, { raw: true }); addXp(game, "attack", 1500, { raw: true }); },
    });
    case "saltmarrow_harbour": return fetchQuest(game, name, "saltmarrow_tithe", {
      offer: ["Every season Saltmarrow gives the sea back a tithe of what it gave us. Keeps the luck in. This season the Gullwing went down with the tithe aboard.", "Catch me five carp, raw, from any water you like. The sea isn't fussy."],
      accept: "Five raw carp. The Millpond on the mainland has them, or the river here.", progress: "Five raw carp, and I'll tip them off the end of the dock myself.",
      have: () => count(game.player, "raw_carp") >= 5, take: () => take(game.player, "raw_carp", 5),
      done: ["There. Into the sea they go, and Saltmarrow's luck holds another season.", "Have a sou'wester. You'll want it: it rains here more than it doesn't."],
      reward: () => { giveOrDrop(game, "souwester"); give(game.player, "coins", 500); addXp(game, "fishing", 2500, { raw: true }); addXp(game, "cooking", 1500, { raw: true }); },
    });
    case "hollyhock_apothecary": return fetchQuest(game, name, "hollyhock_errand", {
      offer: ["Welcome to Hollyhock, dear. Everything that grows in the Realm grows here, with enough coaxing.", "I need bone meal for the beds, six bones' worth, and four oak logs for new drying racks. Do that and I'll show you where Apothecary begins."],
      accept: "Six bones, four oak logs. The racks won't build themselves, more's the pity.", progress: "Six bones and four oak logs, when you have them.",
      have: () => count(game.player, "bones") >= 6 && count(game.player, "oak_logs") >= 4, take: () => { take(game.player, "bones", 6); take(game.player, "oak_logs", 4); },
      done: ["Lovely. The racks are up and the beds are fed.", "Your first lesson: pick what grows in the gardens here, and bring it to my bench. Everything else follows from that. And wear this, you'll want the brim."],
      reward: () => { giveOrDrop(game, "herbalists_hat"); give(game.player, "coins", 300); addXp(game, "apothecary", 1500, { raw: true }); addXp(game, "woodcutting", 1000, { raw: true }); },
    });
    case "dyemoor_dyer": return fetchQuest(game, name, "dyemoor_dye", {
      offer: ["Indigo from the moor, madder from the banks, and every colour between. Dyemoor dresses the Realm, whether the Realm knows it or not.", "I'm after a green nobody has made. Four wool to dye, and two rough sagestones ground for the colour. Bring them and the first cloak is yours."],
      accept: "Four wool, two rough sagestones. Mind, rough: polished ones have had the colour cut out of them.", progress: "Four wool and two rough sagestones. The vat's warm.",
      have: () => count(game.player, "wool") >= 4 && count(game.player, "rough_sagestone") >= 2, take: () => { take(game.player, "wool", 4); take(game.player, "rough_sagestone", 2); },
      done: ["Look at that. Look at it! That's a green with the moor in it.", "The first cloak out of the vat is yours, as promised. Wear it where people can see."],
      reward: () => { giveOrDrop(game, "dyemoor_cloak"); give(game.player, "coins", 400); addXp(game, "crafting", 2000, { raw: true }); },
    });
    case "tallgrass_huntmaster":
      if (questDone(game, "tallgrass_tracks") && (stage(game, "howling_vault") > 0 || combatLevel(player) >= 70)) return fetchQuest(game, name, "howling_vault", {
        offer: ["The ring of stones. I told everyone the hole in the middle was always there and the grass grew over it. It wasn't. It opened this spring, and nothing with four legs has gone near the stones since.", "There are steps going down. I went as far as the first gallery. The dead down there have bows, and armour, and the thing at the end of the gallery has a door with a lock. This key was on the first one I put down. Thin them, twelve at least, and put their lord down for good."],
        accept: "Twelve of them, and the lord. Take the key; you'll want a few more before you're done, the knights carry them.", progress: "Twelve of the vault dead and their lord. The howling hasn't stopped.",
        have: () => data(game, "hb_dead") >= 12 && data(game, "hb_lord") >= 1, take: () => {},
        done: ["It stopped. The howling. The deer came back the same night, right up to the stones.", "I've nothing of theirs to give you that you won't have taken yourself. Have this, and the thanks of every living thing in The Wilds."],
        reward: () => { give(player, "coins", 6000); addXp(game, "attack", 8000, { raw: true }); addXp(game, "slayer", 4000, { raw: true }); },
        onAccept: () => giveOrDrop(game, "vault_key"),
      });
      return fetchQuest(game, name, "tallgrass_tracks", {
      offer: ["Tallgrass hunts The Wilds and The Wilds hunt back. This season the boars have torn up every trail and the wolves follow the boars.", "Thin them for me: six boars and three wolves, out in The Wilds east of here."],
      accept: "Six boars, three wolves. Watch the grass; it watches you.", progress: "Six boars and three wolves. I can hear the ones you haven't got yet.",
      have: () => data(game, "tg_boars") >= 6 && data(game, "tg_wolves") >= 3, take: () => {},
      done: ["The trails are open again. You move well for someone from the mainland.", "A hunter wears a pelt. This one's yours."],
      reward: () => { giveOrDrop(game, "pelt_cape"); give(game.player, "coins", 600); addXp(game, "ranged", 3000, { raw: true }); addXp(game, "strength", 2000, { raw: true }); },
    });
    case "cragmaw_foreman": return fetchQuest(game, name, "cragmaw_shaft", {
      offer: ["Cragmaw's the richest rock in the Realm and the deep mine's the richest in Cragmaw. Three days ago it stopped sending ore up. Something's walking about down there.", "Go down the shaft behind the camp, put five of the stone golems back to rubble, and bring me three blackiron ore to prove the seam still runs."],
      accept: "Five golems, three blackiron ore. Take a pickaxe; the ore won't jump into your pack.", progress: "Five golems down and three blackiron ore up. Then we talk.",
      have: () => data(game, "cm_golems") >= 5 && count(game.player, "blackiron_ore") >= 3, take: () => take(game.player, "blackiron_ore", 3),
      done: ["The seam runs. The mine works. Cragmaw owes you.", "Take a greatcoat off the hook. You'll freeze otherwise, and I need you alive to hire again."],
      reward: () => { giveOrDrop(game, "ironreach_greatcoat"); give(game.player, "coins", 800); addXp(game, "mining", 3500, { raw: true }); addXp(game, "smithing", 2000, { raw: true }); },
    });
    case "quillhaven_archivist":
      if (questDone(game, "quillhaven_folio") && questDone(game, "name_worth_knowing") && (stage(game, "known_hall") > 0 || presenceLevel(player) >= 40) && !questDone(game, "known_hall")) return knownHall(game, name);
      if (questDone(game, "quillhaven_folio") && (stage(game, "drowned_archive") > 0 || level(game, "magic") >= 40)) return fetchQuest(game, name, "drowned_archive", {
        offer: ["Shh. Since you're here: the library has three floors, and the bottom one flooded a hundred years ago. The first archivist went down to save the books. He didn't come up. We kept his post open.", "There's a trapdoor in the floor behind you. The readers down there still carry pages; I want six of them. And I want him to let go of his post. Here is the spare key to the sealed reading room; he will be in it."],
        accept: "Six pages, and let him rest. Quietly, if you can.", progress: "Six pages from the drowned readers, and the Archivist Below at peace. The trapdoor is where it was.",
        have: () => count(player, "ink_page") >= 6 && data(game, "da_archivist") >= 1, take: () => take(player, "ink_page", 6),
        done: ["These are… these are the catalogue. He was still keeping the catalogue.", "Take this lamp. It was his. Rub it and learn something; he'd have wanted that."],
        reward: () => { giveOrDrop(game, "insight_lamp"); give(player, "coins", 1500); addXp(game, "magic", 5000, { raw: true }); addXp(game, "sigilcraft", 2000, { raw: true }); },
        onAccept: () => giveOrDrop(game, "archive_key"),
      });
      return fetchQuest(game, name, "quillhaven_folio", {
      offer: ["Shh. This is a library. The Quillhaven folio is the oldest map of the Realm, and I am restoring it, and I have run out of ink.", "We grind sigils for ink here. Five thought sigils and two shade sigils, and the folio can be finished."],
      accept: "Five thought, two shade. Quietly.", progress: "Five thought sigils and two shade sigils. The folio waits.",
      have: () => count(game.player, "thought_sigil") >= 5 && count(game.player, "shade_sigil") >= 2, take: () => { take(game.player, "thought_sigil", 5); take(game.player, "shade_sigil", 2); },
      done: ["There. A map of the Realm before the sea came in: the Deadwood green, the Drakespine whole, Ashfall a city.", "An archivist's robe. You've earned a place at the long table."],
      reward: () => { giveOrDrop(game, "archivist_robe"); give(game.player, "coins", 500); addXp(game, "magic", 3000, { raw: true }); addXp(game, "sigilcraft", 1500, { raw: true }); },
    });
    case "ashfall_trader": return fetchQuest(game, name, "ashfall_embers", {
      offer: ["Past this camp is Ashfall. Dragons' country. Whoever lived there before built in stone, and I want what's left in their ruins.", "The ash drakes hold the passes. Put three of them down and I can get through. I'll pay in something they can't burn."],
      accept: "Three ash drakes, in Ashfall. A Wyrmward shield keeps the fire off, if you have one.", progress: "Three drakes. I'll be here, assuming the ground stays put.",
      have: () => data(game, "af_drakes") >= 3, take: () => {},
      done: ["The pass is open. Thank you. I'll be in the ruins by morning.", "This cloak met a dragon and came back. Mind the crater at the far end: what's under it is older than the drakes."],
      reward: () => { giveOrDrop(game, "scorched_cloak"); give(game.player, "coins", 2000); addXp(game, "attack", 6000, { raw: true }); addXp(game, "defence", 6000, { raw: true }); },
    });
    case "steward": {
      const { home, next, presence, coins } = homeDeed(game);
      const buy = { label: home ? `Upgrade to a ${next!.name.toLowerCase()} (${next!.coins.toLocaleString()} coins, Presence ${next!.presence}).` : `Buy the cottage (${HOME_TIERS[0].coins.toLocaleString()} coins, Presence ${HOME_TIERS[0].presence}).`, then: () => { buyHome(game); return null; } };
      const furnish = { label: "Furnish and decorate.", then: () => { game.ui.home = true; return null; } };
      if (!home) return chat(name, npcSays(name, "Homestead Row. One plot, the one behind me, and a deed with no name on it yet.", `A cottage is ${HOME_TIERS[0].coins.toLocaleString()} coins, and I'll want a name the Realm knows: Presence ${HOME_TIERS[0].presence}. You have Presence ${presence} and ${coins.toLocaleString()} coins.`),
        [buy, { label: "What's a home for?", then: () => chat(name, npcSays(name, "Sleeping. Properly. A bed of your own sends you out well rested, and the XP comes a little quicker for a while.", "Then there's the hearth, the shelves, a bank chest if you're known enough, an altar if you're known better. And the look of the place is yours: walls, floor, roof, garden.")) }, { label: "Not today.", then: () => null }]);
      return chat(name, npcSays(name, `Your ${HOME_TIERS[home.tier - 1].name.toLowerCase()} is behind me. ${next ? `There's room on the plot for a ${next.name.toLowerCase()}.` : "There's no grander house on the Row."}`),
        [...(next ? [buy] : []), furnish, { label: "Not today.", then: () => null }]);
    }
    case "namekeeper": {
      const p = game.player;
      return chat(name, npcSays(name, p.name ? `${p.name}. Friend #${p.friendId}. Both written here, in that order.` : `Friend #${p.friendId}. A number tells me which Friend you are. A name would tell me who you became.`,
        "Every Friend deserves a name. The first is a gift. After that, the register charges for the ink."), [
        { label: p.name ? `Change my Friend's name (${RENAME_COST.toLocaleString()} coins).` : "Name my Friend.", then: () => { game.ui.naming = p.name ? "rename" : "first"; return null; } },
        { label: "What's the difference?", then: () => chat(name, npcSays(name, "The number is the token: it never changes, and it's how the Realm knows you. The name is yours: it's how the Realm remembers you.", `Right now the Realm knows you as ${playerName(p)}.`)) },
        ...(p.name && (stage(game, "name_worth_knowing") > 0 || presenceLevel(p) >= 20) ? [{ label: stage(game, "name_worth_knowing") === 0 ? "Is a name all the register holds?" : "About the register…", then: () => nameWorthKnowing(game, name) }] : []),
        { label: "Not today.", then: () => null },
      ]);
    }
    case "gravesend_clothier": return chat(name, npcSays(name, "Mourning wear. Charcoal, bone-white and lantern purple: the three colours of Gravesend. Everyone here owns one of each."));
    case "gravesend_trader": return chat(name, npcSays(name, "Lanterns, candles, bone-oil and bread. The dark comes early this far north."));
    case "gravesend_villager": return chat(name, npcSays(name, (["My grandmother's in the north plot. She comes to the fence on foggy nights. We wave.", "The old road goes right into the Deadwood. Don't take it past the third lantern.", "Mira says the Catacombs under the ruined chapel go further than anyone's walked.", "You get used to the quiet. It's the quiet stopping you notice."] as const)[Math.floor(game.rng() * 4)]));
    case "saltmarrow_fishmonger": return chat(name, npcSays(name, "Fresh off the boats: sailfish, inkcrab, and inkshark when the deep spots are kind. I buy whatever you land."));
    case "saltmarrow_clothier": return chat(name, npcSays(name, "Oilskins, sou'westers and sea capes. Waxed twice. You'll be dry when the whole Realm's wet."));
    case "saltmarrow_villager": return chat(name, npcSays(name, (["There's a hut at the end of the north dock nobody uses. The trapdoor in it goes down a long way.", "The Pale Isles are out past the bay. Something's buried on the little one.", "Harbourmaster Brine has paid the tithe every season for forty years. Says that's why the storms miss us.", "Deep spots off the dock, if you've a harpoon."] as const)[Math.floor(game.rng() * 4)]));
    case "hollyhock_clothier": return chat(name, npcSays(name, "Hats with a brim, aprons with pockets, and a leaf on everything. Gardening clothes, dear, but pretty."));
    case "hollyhock_villager": return chat(name, npcSays(name, (["Mother Yarrow can tell what a plant is by the smell of the soil it grew in.", "Everything in the vale grows twice as fast. Nobody knows why. Nobody asks.", "The river's the Thistle. It runs down to Dyemoor and turns blue there.", "Mind the spiders in the hedges."] as const)[Math.floor(game.rng() * 4)]));
    case "dyemoor_clothier": return chat(name, npcSays(name, "Frocks, turbans, trousers and cloaks in the moor's own indigo and madder. Nobody in the Realm dresses like Dyemoor. Nobody dares."));
    case "vat_keeper": return chat(name, npcSays(name, (["Madder wine, from a crooked vat, by a crooked woman. Everything here's red, love. Even the wine.", "The board's by the door: bounties from the moor and errands for the guild. Pays in coin, not in colours."] as const)[game.tick % 2]));
    case "freepour_keeper": return chat(name, npcSays(name, (["The Federation says drink should be free. I agree. I also say it should be paid for. We're working it out.", "The board's got work on it: wolves, lurkers, and things the fortress wants brought. Real work. For coin."] as const)[game.tick % 2]));
    case "dyemoor_guildmistress": return chat(name, npcSays(name, "The Dyers' Guild keeps the colours of the Realm. Every red you've ever admired was boiled in our vats. Buy a pot of dye from Master Vell at the Dyeworks and use it on anything of cloth or leather you wear; a pot of lye washes it out again."));
    case "dyemoor_wardrober": return chat(name, npcSays(name, "Gravesend's mourning coats, Saltmarrow's oilskins, the hunters' longcoats, the Quillhaven caps: every village's clothes, on one rail. Dye them how you like afterwards; everyone does."));
    case "dyemoor_loomkeeper": return chat(name, npcSays(name, "Rarian violet, Federation plaid and BarkReach leather, carried over the mountains. Wear the Rarian ones in Raria and they'll still ask for your writ."));
    case "dyemoor_rosekeeper": return chat(name, npcSays(name, "Shirts, tunics, dresses, skirts and trousers, and hats to go with them. Everyday clothes, in the Realm's best colours: ours."));
    case "dyemoor_tailor": return chat(name, npcSays(name, "Thread, wool, silk and capes by the armful. Bring your own needle."));
    case "dyemoor_villager": return chat(name, npcSays(name, (["The river runs blue below the vats. The fish don't mind.", "Vell has been after a new green for eleven years.", "You can see a Dyemoor cloak from the far side of Southshore. That's the point.", "Madder comes from the roots on the riverbank. Indigo from the moor. Everything else is a secret."] as const)[Math.floor(game.rng() * 4)]));
    case "tallgrass_outfitter": return chat(name, npcSays(name, "Bows, arrows, hunter's leathers and hides. Everything in here was tracked, shot or skinned by someone in this camp."));
    case "tallgrass_clothier": return chat(name, npcSays(name, "Hoods, longcoats and pelt capes in grass colours. Stand still in them and the deer walk into you."));
    case "tallgrass_villager": return chat(name, npcSays(name, (["There's a ring of standing stones out in The Wilds. The game won't cross it.", "Thornbacks in the thickets. Don't hit them bare-handed.", "Fenn once tracked a wolf from here to the Ironreach snow and back.", "The river from Ironreach comes down through The Wilds. Good water, bad crossing."] as const)[Math.floor(game.rng() * 4)]));
    case "cragmaw_armourer": return chat(name, npcSays(name, "Glimmer and rarite, every piece a smith can make: helms to greaves, daggers to war hammers. Nobody else works rarite. Nobody else is this far from anywhere.", "The mainland armouries stop at helms and boots in those metals. If you want the plate, you walk to Cragmaw."));
    case "cragmaw_ore": return chat(name, npcSays(name, "Ore in, coin out. Pickaxes, bars and inkcoal if you're buying. I weigh honest and sell dear."));
    case "cragmaw_clothier": return chat(name, npcSays(name, "Fur hoods, greatcoats, quilted trousers and a red cape so we can dig you out of the drifts. Sit by the fire first."));
    case "cragmaw_villager": return chat(name, npcSays(name, (["The deep mine's the richest in the Realm. Also the loudest, lately.", "Snow on the peaks all year. Yetis too.", "Pike came up from the mainland with one pickaxe and a grudge. Now look.", "The road to Quillhaven goes down the whole east side. Two days, if the golems let you."] as const)[Math.floor(game.rng() * 4)]));
    case "quillhaven_scribe": return chat(name, npcSays(name, "Sigils copied fair, books bound, and a box to keep your stones in. The scriptorium buys sigils too."));
    case "quillhaven_clothier": return chat(name, npcSays(name, "Robes, caps and capes for the long table. Ink stains included at no charge."));
    case "quillhaven_villager": return chat(name, npcSays(name, (["The library goes down three floors. The bottom one is below the sea.", "Perrin says the standing stones on the headland are older than the Wizards' Tower.", "I came for a week of reading. That was nine years ago.", "The folio shows a city where Ashfall is. Imagine."] as const)[Math.floor(game.rng() * 4)]));
    default:
      if (def.shop) return chat(name, npcSays(name, "Hello! Care to see my wares?"), [
        { label: "Yes please.", then: () => { game.ui.shop = def.shop!; return null; } },
        { label: "No thanks.", then: () => null },
      ]);
      return chat(name, npcSays(name, "Hello there."));
  }
}

export function tanHides(game: Game) {
  const player = game.player, hides = count(player, "cowhide"), affordable = Math.floor(count(player, "coins") / 2), n = Math.min(hides, affordable);
  if (!hides) { message(game, "You don't have any cowhides to tan."); return; }
  if (!n) { message(game, "You need 2 coins per hide."); return; }
  take(player, "cowhide", n); take(player, "coins", n * 2); give(player, "leather", n);
  message(game, `Tessa tans ${n} cowhide${n > 1 ? "s" : ""} into leather.`); sound(game, "coins");
}
export const examineItem = (id: string) => item(id).examine;
