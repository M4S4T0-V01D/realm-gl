/**
 * Return of Raria: the people of the far west and what they want from you.
 *
 * Hollowmere's soldiers, who don't know where Raria came from. The Federation, who are weird, serious, whimsical,
 * radical and extremely competent, and Fellow Free, First Free of the Federation, who is all of those at once and
 * never acknowledges any of it. BarkReach's loggers, rangers and hunters. And Raria: Queen Rara, Keeper of the Wise
 * Friend's Law; her small kind husband; the Order of Dusk; the Regiment; the offices; the citizens who are always
 * polite. The quests run from Hollowmere's watch to the Regiment's writ to the Law itself, and then, slowly, into the
 * machine.
 */
import { ORDERS } from "./knights.ts";
import { WEST_DX } from "./world.ts";
import { addXp, combatLevel, count, give, giveOrDrop, has, level, message, setLaw, sound, take, type Dialogue, type Game } from "./state.ts";
import { chat, completeQuest, data, fetchQuest, npcSays, questDone, stage, type NpcDef, type QuestDef } from "./content.ts";

const art = (family: number, seed: number) => ({ family, seed });
export const WEST_NPCS: Record<string, NpcDef> = {
  // Hollowmere: the kingdom, named, and worried.
  hollowmere_officer: { id: "hollowmere_officer", name: "Captain Wren Ashby", examine: "Captain of the Hollowmere garrison. Has a map of the west with a hole in it where Raria is.", options: ["Talk-to"], art: art(10, 900) },
  hollowmere_lieutenant: { id: "hollowmere_lieutenant", name: "Lieutenant Dace Harrow", examine: "Commands Westwatch, the kingdom's last post. Hasn't slept properly since the violet banners went up.", options: ["Talk-to"], art: art(10, 901) },
  hollowmere_soldier: { id: "hollowmere_soldier", name: "Hollowmere soldier", examine: "A soldier of the Kingdom of Hollowmere, in the crown's crimson. Walks the road and watches the west.", options: ["Talk-to"], art: art(10, 902) },
  hollowmere_scout: { id: "hollowmere_scout", name: "Hollowmere scout", examine: "A kingdom scout. Has been further west than she'll say.", options: ["Talk-to"], art: art(9, 903) },
  hollowmere_messenger: { id: "hollowmere_messenger", name: "Hollowmere messenger", examine: "Runs dispatches between the castle and Westwatch. Never stops moving.", options: ["Talk-to"], art: art(9, 904) },
  west_watcher: { id: "west_watcher", name: "The Watcher of the Stones", examine: "An old Friend who keeps a statue nobody else knows is there. Has flowers in one hand and a candle in the other.", options: ["Talk-to"], art: art(5, 905) },
  // The Free Friends Federation.
  fellow_free: { id: "fellow_free", name: "Fellow Free, First Free of the Federation", examine: "The leader of the FFF: a wizard with fourteen devices running, a cannon half-built, and a plan. He does not look like any of that is unusual.", options: ["Talk-to"], art: art(10, 910) },
  fff_gatewarden: { id: "fff_gatewarden", name: "Gate-Warden Pip Quarrel", examine: "The Federation's one bureaucrat. Apologises for it. Asks three questions of everyone, and means them.", options: ["Talk-to"], art: art(9, 911) },
  fff_archwizard: { id: "fff_archwizard", name: "Archwizard Mab Ferrule", examine: "Runs the Wizard Tower. Has blown it up twice and rebuilt it better both times.", options: ["Talk-to", "Trade"], shop: "fff_arcanum", art: art(5, 912) },
  fff_ranger_captain: { id: "fff_ranger_captain", name: "Ranger-Captain Hesper Lark", examine: "Commands the Federation's rangers. Knows BarkReach by the sound of it.", options: ["Talk-to"], art: art(9, 913) },
  fff_artificer: { id: "fff_artificer", name: "Artificer Dunmore Bolt", examine: "Head of the Artisan Workshops. Has eleven tools and uses all of them on everything.", options: ["Talk-to", "Trade"], shop: "fff_workshop", art: art(9, 914) },
  fff_armourer: { id: "fff_armourer", name: "Smith Orla Kettle", examine: "Keeps the Federation Armoury and the Enchanted Forge. Her plate dries.", options: ["Talk-to", "Trade"], shop: "fff_armoury", art: art(10, 915) },
  fff_librarian: { id: "fff_librarian", name: "Librarian Wendeline Moth", examine: "Keeps the Library, and the corrections in red ink are hers.", options: ["Talk-to"], art: art(3, 916) },
  fff_outfitter: { id: "fff_outfitter", name: "Tailor Figgis", examine: "Sews Federation clothes. None of the buttons match. All of them work.", options: ["Talk-to", "Trade"], shop: "fff_outfitter", art: art(7, 917) },
  fff_knight_asleep: { id: "fff_knight_asleep", name: "Sir Haddock, asleep", examine: "A knight of the Federation, asleep in a chair in the Great Hall, in full plate, snoring in time with the devices.", options: ["Talk-to"], art: art(10, 918) },
  fff_wizard_arguing: { id: "fff_wizard_arguing", name: "Journeyman Tobbin", examine: "A wizard of the Tower, arguing with a magical artifact that is not a toaster. Losing.", options: ["Talk-to"], art: art(9, 919) },
  fff_ranger: { id: "fff_ranger", name: "FFF ranger", examine: "A Federation ranger in a green cape with FFF across the back. Off picket, mostly.", options: ["Talk-to"], art: art(9, 920) },
  fff_villager: { id: "fff_villager", name: "Freehold citizen", examine: "Somebody who lives at Freehold and answers to nobody, politely.", options: ["Talk-to"], art: art(9, 921) },
  // BarkReach.
  barkreach_foreman: { id: "barkreach_foreman", name: "Foreman Greta Sawyer", examine: "Runs the Heartwood Yard. Can tell a redwood from an ironbark by the sound of the axe.", options: ["Talk-to", "Trade"], shop: "barkreach_lumber", art: art(9, 930) },
  barkreach_bowyer: { id: "barkreach_bowyer", name: "Antler Jory", examine: "BarkReach's bowyer. Tips every arrow with greatstag antler and swears by it.", options: ["Talk-to", "Trade"], shop: "barkreach_fletcher", art: art(4, 931) },
  barkreach_outfitter: { id: "barkreach_outfitter", name: "Hidewife Marn", examine: "Tans, stitches and sells what the wood wears.", options: ["Talk-to", "Trade"], shop: "barkreach_outfitter", art: art(3, 932) },
  barkreach_ranger: { id: "barkreach_ranger", name: "BarkReach ranger", examine: "A ranger of the Antler Lodge. Has seen the Regiment's scouts in the north of the wood, and the Federation's pickets in the west, and likes neither.", options: ["Talk-to"], art: art(9, 933) },
  barkreach_hunter: { id: "barkreach_hunter", name: "BarkReach hunter", examine: "A hunter of the Stag's Rest. Smells of resin and greatstag.", options: ["Talk-to"], art: art(9, 934) },
  barkreach_trader: { id: "barkreach_trader", name: "Wood's End trader", examine: "Keeps the trading post in the fort at Wood's End, where the Federation's road meets the wood. Hears everything twice, and sells most of it.", options: ["Talk-to", "Trade"], shop: "woods_end_post", art: art(0, 935) },
  barkreach_villager: { id: "barkreach_villager", name: "BarkReach logger", examine: "A logger of Sawyer's Rest, with resin to the elbow.", options: ["Talk-to"], art: art(9, 936) },
  // Raria.
  queen_rara: { id: "queen_rara", name: "Her Radiance, Queen Rara", examine: "Her Radiance, Queen of Raria, Keeper of the Wise Friend's Law. Tall, still, and certain. You have the sense of being read.", options: ["Talk-to"], art: art(11, 940) },
  king_pell: { id: "king_pell", name: "King Pell", examine: "The Queen's husband: a small, kind, nervous man with ink on his fingers, who sees everything in the room and says very little about it.", options: ["Talk-to"], art: art(12, 941) },
  dusk_prior: { id: "dusk_prior", name: "Prior Vesperine Caul", examine: "Prior of the Order of Dusk. Speaks quietly, moves quietly, and has not been seen to blink.", options: ["Talk-to"], art: art(10, 942) },
  dusk_quartermaster: { id: "dusk_quartermaster", name: "Dusk quartermaster", examine: "Keeps the Order of Dusk's armoury, in the dark, by touch.", options: ["Talk-to", "Trade"], shop: "dusk_armoury", art: art(10, 943) },
  dusk_guard: { id: "dusk_guard", name: "Dusk knight", examine: "A knight of the Order of Dusk, hooded, at the cemetery. Counting.", options: ["Talk-to"], art: art(10, 944) },
  raria_gate_captain: { id: "raria_gate_captain", name: "Captain Aurelle Vane of the Regiment", examine: "Commands the Regiment's checkpoint on the West Road. Writes writs, and writes down who asks for them.", options: ["Talk-to"], art: art(10, 945) },
  rrr_officer: { id: "rrr_officer", name: "Colonel Severin Marsh", examine: "Colonel of the Rare Realm Regiment, in the barracks. Has a map of the west with Raria filling most of it.", options: ["Talk-to"], art: art(10, 946) },
  rrr_soldier: { id: "rrr_soldier", name: "RRR soldier", examine: "A soldier of the Rare Realm Regiment, in the city, in step with the one across the street.", options: ["Talk-to"], art: art(10, 947) },
  raria_clerk: { id: "raria_clerk", name: "Clerk Ormond Lathe", examine: "Clerk of the Office of Conduct. Registers names. Yours is next.", options: ["Talk-to"], art: art(9, 948) },
  raria_assessor: { id: "raria_assessor", name: "Assessor Linnet Marrow", examine: "Assessor of the Ledger of Names. Knows what every citizen bought, prayed and said last week, and would like to know this week's.", options: ["Talk-to"], art: art(9, 949) },
  raria_chaplain: { id: "raria_chaplain", name: "Chaplain Osric Vell", examine: "Chaplain of the Chapel of the Law. Sells the Wise Friend's vestments and reads the Law aloud, daily, all of it.", options: ["Talk-to", "Trade"], shop: "raria_faith", art: art(2, 950) },
  raria_sigilist: { id: "raria_sigilist", name: "Sigilist Imre Quell", examine: "Keeps the Office of Sigils: law, dusk and crown sigils, pressed under seal.", options: ["Talk-to", "Trade"], shop: "raria_mage", art: art(5, 951) },
  raria_armourer: { id: "raria_armourer", name: "Regimental armourer", examine: "Issues Regiment plate and Rarian steel, to the regulation, to those with a writ.", options: ["Talk-to", "Trade"], shop: "raria_armoury", art: art(10, 952) },
  raria_clothier: { id: "raria_clothier", name: "Sumptuary Officer Delphine Rook", examine: "Decides what Rarians wear, which is violet, and sells it to them.", options: ["Talk-to", "Trade"], shop: "raria_clothier", art: art(3, 953) },
  raria_provisioner: { id: "raria_provisioner", name: "Provisioner of the Crown", examine: "Sells bread, one kind, at one price.", options: ["Talk-to", "Trade"], shop: "raria_general", art: art(0, 954) },
  raria_villager: { id: "raria_villager", name: "Rarian citizen", examine: "A citizen of Raria, in violet, polite, and already walking away.", options: ["Talk-to"], art: art(9, 955) },
  // The far west's towns: Lawgate on the eastern march, the capital's inn, Vesperholm, the Rangers' Hold, Candlemere, Greyford, BarkReach's lodge and village, the Silent Peaks.
  lawgate_governor: { id: "lawgate_governor", name: "Governor Ancel Marrowby", examine: "Governor of Lawgate and Raria's eastern march. Keeps a chair lower than a throne by exactly the regulation height.", options: ["Talk-to"], art: art(10, 960) },
  lawgate_innkeeper: { id: "lawgate_innkeeper", name: "Hester Vane, of the Obedient Hound", examine: "Keeps Lawgate's inn. Pours exactly one measure.", options: ["Talk-to", "Trade"], shop: "bar_hound", art: art(9, 961) },
  raria_innkeeper: { id: "raria_innkeeper", name: "Mother Constance", examine: "Keeps the Seventh Prayer, the capital's inn. Everyone eats what she serves, at the hour she serves it.", options: ["Talk-to", "Trade"], shop: "raria_inn", art: art(3, 962) },
  vesper_abbess: { id: "vesper_abbess", name: "Abbess Ilse Nocturne", examine: "Abbess of Vesperholm and the Order of Dusk's eldest. Rings the last bell herself.", options: ["Talk-to", "Trade"], shop: "vesper_reliquary", art: art(10, 963) },
  ranger_warden: { id: "ranger_warden", name: "Ranger-Warden Sable", examine: "Warden of the Rangers' Hold. A Royal Ranger who is permitted to speak, which she does as little as possible.", options: ["Talk-to"], art: art(9, 964) },
  candlemere_reeve: { id: "candlemere_reeve", name: "Reeve Odo Tallow", examine: "Candlemere's reeve. Collects the Crown's tithe and apologises to nobody for it, except quietly, to his wife.", options: ["Talk-to"], art: art(9, 965) },
  candlemere_trader: { id: "candlemere_trader", name: "Wynne of the Stores", examine: "Keeps the Candlemere stores. Sells one of everything the Law permits.", options: ["Talk-to", "Trade"], shop: "raria_general", art: art(3, 966) },
  crownlands_villager: { id: "crownlands_villager", name: "Crownlands farmer", examine: "A farmer of the Crownlands. Grows what the Crown asks, and some of what it doesn't.", options: ["Talk-to"], art: art(9, 967) },
  greyford_warden: { id: "greyford_warden", name: "Warden Piers Holloway", examine: "Keeps the Ford Inn and the ford itself for the Crown. Has watched the Greyfields from his window for two years.", options: ["Talk-to"], art: art(10, 968) },
  antler_captain: { id: "antler_captain", name: "Ranger-Captain Holt Ashgrove", examine: "Captain of the Antler Lodge. Has walked every path in BarkReach, and one in the Heartwood he won't walk again.", options: ["Talk-to"], art: art(9, 969) },
  barkholm_elder: { id: "barkholm_elder", name: "Elder Mossa Rootwell", examine: "Barkholm's eldest. Older than the Crown's tithe rolls, and says so.", options: ["Talk-to"], art: art(5, 970) },
  peak_hermit: { id: "peak_hermit", name: "The Blind Hermit", examine: "A hermit at the Blind Shrine, blindfolded like the statue. Walks the scree without a stick.", options: ["Talk-to"], art: art(5, 971) },
  raria_citizen_merrow: { id: "raria_citizen_merrow", name: "Tam Merrow", examine: "A Rarian citizen who, the Ledger says, has prayed four times this week instead of seven.", options: ["Talk-to"], art: art(9, 956) },
};

const KNOWS_FFF = (game: Game) => questDone(game, "fff_truce");
const KNOWS_RARIA = (game: Game) => questDone(game, "rrr_truce");
export const WEST_QUESTS: readonly QuestDef[] = [
  {
    id: "west_watch", name: "The Western Watch", points: 2, difficulty: "Intermediate", start: "Talk to Captain Wren Ashby of the Hollowmere garrison, by the Friendhollow square, with a combat level of 40 or so.",
    requirements: ["Combat 40 recommended"], rewards: ["2 Quest Points", "Hollowmere cape", "3,000 Attack XP", "2,000 Presence XP"],
    journal: game => {
      const s = stage(game, "west_watch");
      if (s === 0) return ["Captain Ashby of the Hollowmere garrison wants someone who isn't a soldier to walk west and come back with a straight answer about what's out there."];
      if (s === 1) return ["Walk the West Road past Westmarch's end and report: the kingdom's post at Westwatch, whatever holds the road beyond it, and the deserters in the Stone Field.",
        `${data(game, "ww_post") ? "✓" : "•"} Report to Lieutenant Harrow at Westwatch`, `${data(game, "ww_seen") ? "✓" : "•"} Find out who holds the road beyond Westwatch`, `${data(game, "ww_deserters") >= 4 ? "✓" : "•"} Deserters put down in the Stone Field: ${Math.min(4, data(game, "ww_deserters"))}/4`];
      return ["I told Captain Ashby what stands in Deep Westmarch: a kingdom called Raria, entrenched, with a Regiment on the road. She didn't like it. Nobody at the castle knows where they came from. QUEST COMPLETE!"];
    },
  },
  {
    id: "rrr_truce", name: "Papers of Passage", points: 2, difficulty: "Intermediate", start: "Talk to Captain Aurelle Vane at the Regiment's checkpoint on the West Road, in Deep Westmarch.",
    requirements: ["Combat 45 recommended"], rewards: ["2 Quest Points", "A writ of passage: the Regiment stands down while you carry it", "Book of the Law", "2,000 Faith XP", "Raria's gates, shops and offices open to you"],
    journal: game => {
      const s = stage(game, "rrr_truce");
      if (s === 0) return ["The Rare Realm Regiment holds the West Road at a checkpoint of stakes, and attacks anyone without a writ. Their captain writes writs."];
      if (s === 1) return ["Captain Vane stamped me a writ of passage (the Regiment honours the writ, not me: lose it and they won't), and gave me a sealed dispatch for the Office of Conduct in Raria. Present both at the Office, north of the palace.",
        `${has(game.player, "writ_of_passage") ? "✓" : "•"} Carry the writ of passage`, `${has(game.player, "sealed_dispatch") ? "✓" : "•"} Carry the sealed dispatch`, "• Present them to Clerk Lathe at the Office of Conduct"];
      return ["I'm registered in Raria: a name in the Ledger, a writ in my pack, and the Regiment stands down for me. Clerk Lathe says Her Radiance receives new names. QUEST COMPLETE!"];
    },
  },
  {
    id: "wise_friends_law", name: "The Wise Friend's Law", points: 3, difficulty: "Intermediate", start: "Talk to Clerk Ormond Lathe at the Office of Conduct in Raria, after Papers of Passage.",
    requirements: ["Papers of Passage"], rewards: ["3 Quest Points", "Rarian mantle", "4,000 Faith XP", "The Wise Friend's Law: Raria's Magic and Faith open to you, from Prior Caul", "The Order of Dusk's oath opens to you"],
    journal: game => {
      const s = stage(game, "wise_friends_law");
      if (s === 0) return ["Clerk Lathe says a registered name is received by Her Radiance, and taught the Law. He makes it sound like a kindness."];
      if (s === 1) return ["To be received in Raria: an audience with Queen Rara and the King in the palace, a prayer at the Wise Friend's altar in the Chapel of the Law, and a word with Prior Caul of the Order of Dusk. Then back to the clerk.",
        `${data(game, "wfl_queen") ? "✓" : "•"} Received by Her Radiance`, `${data(game, "wfl_king") ? "✓" : "•"} Spoken with the King`, `${data(game, "wfl_prayed") ? "✓" : "•"} Prayed at the Wise Friend's altar`, `${data(game, "wfl_prior") ? "✓" : "•"} Spoken with Prior Caul`];
      return ["I've been received. The Queen is certain, the King is kind, the Law is long, and the Prior will swap my Magic and Faith for Raria's whenever I ask. I'm not sure when I agreed to any of it. QUEST COMPLETE!"];
    },
  },
  {
    id: "cog_ledger", name: "The Ledger of Names", points: 2, difficulty: "Intermediate", start: "Talk to Assessor Linnet Marrow at the Office of Conduct, after The Wise Friend's Law.",
    requirements: ["The Wise Friend's Law"], rewards: ["2 Quest Points", "3,000 Magic XP", "20 law sigils", "The Assessor's thanks, or a citizen's"],
    journal: game => {
      const s = stage(game, "cog_ledger"), p = game.player;
      if (s === 0) return ["Assessor Marrow has dispatches for the chaplain, the colonel and the sigilist, and a citizen she'd like looked into. It's paperwork. It's only paperwork."];
      if (s === 1) return ["Carry the Office's sealed dispatches to Chaplain Vell, Colonel Marsh and Sigilist Quell, then look into the citizen Tam Merrow, who has prayed four times this week instead of seven, and report what I find.",
        `${data(game, "lg_chaplain") ? "✓" : "•"} Dispatch to the chaplain`, `${data(game, "lg_colonel") ? "✓" : "•"} Dispatch to the colonel`, `${data(game, "lg_sigilist") ? "✓" : "•"} Dispatch to the sigilist`, `${data(game, "lg_merrow") ? "✓" : "•"} Tam Merrow looked into${data(game, "lg_merrow") === 2 ? " (I said I found nothing)" : data(game, "lg_merrow") === 1 ? " (I'll report him)" : ""}`,
        `${has(p, "citizens_ledger") ? "✓" : "•"} Carry the ledger page`];
      return [data(game, "lg_merrow") === 2 ? "I told the Assessor there was nothing to find about Tam Merrow. She wrote that down too. He gave me something for it. QUEST COMPLETE!" : "I reported Tam Merrow. The Assessor was pleased, and he isn't at the market any more. I'm in the Ledger as 'reliable'. QUEST COMPLETE!"];
    },
  },
  {
    id: "cog_reliquary", name: "What the Dusk Lost", points: 3, difficulty: "Long", start: "Talk to Prior Vesperine Caul at the Hall of the Order of Dusk, after The Wise Friend's Law.",
    requirements: ["The Wise Friend's Law", "Combat 55 recommended"], rewards: ["3 Quest Points", "Dusk lantern (a belt lamp: +4 Faith, +2 Defence)", "5,000 Faith XP", "3,000 Pursuance XP"],
    journal: game => {
      const s = stage(game, "cog_reliquary");
      if (s === 0) return ["The Order of Dusk lost a reliquary in Deep Westmarch when the first fighting was. The Prior wants it back unopened, and says it twice."];
      if (s === 1) return ["The reliquary went west with the Regiment and east with the deserters: one of them has it, in the Stone Field or at Old Westwatch. Take it from them and bring it to the Prior unopened.",
        `${has(game.player, "dusk_reliquary") ? "✓" : "•"} The Dusk reliquary, unopened`];
      return ["I gave the Prior the reliquary. She didn't open it either. She gave me a lantern whose light doesn't flicker and said the dead keep further from it. QUEST COMPLETE!"];
    },
  },
  {
    id: "cog_federation", name: "Eyes on the Federation", points: 3, difficulty: "Long", start: "Talk to Colonel Severin Marsh at the Regimental Barracks in Raria, after The Ledger of Names.",
    requirements: ["The Ledger of Names"], rewards: ["3 Quest Points", "RRR banner", "6,000 coins", "4,000 Ranged XP"],
    journal: game => {
      const s = stage(game, "cog_federation");
      if (s === 0) return ["Colonel Marsh wants the Federation counted: its devices, its cannon, its people. Someone who can walk into the FFF Fortress. Me, apparently."];
      if (s === 1) return ["Go to the Great Hall of the FFF Fortress in the Free Marches, count what's running in it, and bring the tally to the Colonel.",
        `${data(game, "ef_counted") ? "✓" : "•"} The Great Hall counted (stand in it)`, `${has(game.player, "federation_tally") ? "✓" : "•"} Carry the tally to Colonel Marsh`];
      return ["I handed the Colonel a tally of the Federation. He read it and said 'fourteen', and nothing else, for a long time. I'm a cog now; I can feel the teeth. QUEST COMPLETE!"];
    },
  },
  {
    id: "fff_truce", name: "The Gate Question", points: 2, difficulty: "Intermediate", start: "Talk to Gate-Warden Pip Quarrel at the gate of the FFF Fortress, in the Free Marches.",
    requirements: ["Combat 45 recommended"], rewards: ["2 Quest Points", "FFF artisan's cape", "2,000 Craftwork XP", "The Federation knows your name: its shops open, and its pickets stand down"],
    journal: game => {
      const s = stage(game, "fff_truce"), p = game.player;
      if (s === 0) return ["The Free Friends Federation keeps to itself behind a palisade in the Free Marches. The Gate-Warden asks everyone three questions and is sorry about it."];
      if (s === 1) return ["I answered the Gate-Warden's questions (the right answers were the honest ones). Now he wants three oddities for the Library, which is how the Federation says 'welcome': a greatstag antler from BarkReach, five storm sigils, and ten pine logs.",
        `${count(p, "stag_antler") >= 1 ? "✓" : "•"} Greatstag antler: ${Math.min(1, count(p, "stag_antler"))}/1`, `${count(p, "storm_sigil") >= 5 ? "✓" : "•"} Storm sigils: ${Math.min(5, count(p, "storm_sigil"))}/5`, `${count(p, "pine_logs") >= 10 ? "✓" : "•"} Pine logs: ${Math.min(10, count(p, "pine_logs"))}/10`];
      return ["The Federation knows my name. The Gate-Warden wrote it on a card, which is the only card the Federation keeps. The shops are open and the pickets wave. QUEST COMPLETE!"];
    },
  },
  {
    id: "fff_cannon", name: "Fortunately, We Built a Solution", points: 3, difficulty: "Long", start: "Talk to Fellow Free in the Great Hall of the FFF Fortress, after The Gate Question.",
    requirements: ["The Gate Question", "Smithing 40", "Combat 60 recommended"], rewards: ["3 Quest Points", "FFF elite cape", "8,000 Magic XP", "5,000 Smithing XP"],
    journal: game => {
      const s = stage(game, "fff_cannon"), p = game.player;
      if (s === 0) return ["Raria has brought an army into the Federation's forest. Fellow Free finds this inconvenient. Fortunately, the Federation has built a solution. It needs a cradle."];
      if (s === 1) return ["Bring Artificer Bolt what the cannon's cradle needs: three moonsilver bars, ten inkcoal, eight storm sigils and two ironbark logs. Then bring the cradle to Fellow Free.",
        `${count(p, "moonsilver_bar") >= 3 ? "✓" : "•"} Moonsilver bars: ${Math.min(3, count(p, "moonsilver_bar"))}/3`, `${count(p, "inkcoal") >= 10 ? "✓" : "•"} Inkcoal: ${Math.min(10, count(p, "inkcoal"))}/10`, `${count(p, "storm_sigil") >= 8 ? "✓" : "•"} Storm sigils: ${Math.min(8, count(p, "storm_sigil"))}/8`, `${count(p, "ironbark_logs") >= 2 ? "✓" : "•"} Ironbark logs: ${Math.min(2, count(p, "ironbark_logs"))}/2`,
        `${has(p, "cannon_cradle") ? "✓" : "•"} The cradle, from the artificer, to Fellow Free`];
      if (s === 2) return ["BOOM. The cannon fired at the Regiment's Spine Watch and the tower is gone. Fellow Free wants what it started finished: a Regiment captain put down, anywhere I find one.",
        `${data(game, "fc_captain") >= 1 ? "✓" : "•"} A Regiment captain put down`];
      return ["The captain is down and the Federation's cannon has a name now (it's 'Solution'). Fellow Free gave me the Federation's own cape, and said the thing was never about the cannon. I think it was about the cannon. QUEST COMPLETE!"];
    },
  },
  {
    id: "fff_toaster", name: "The Toaster Argument", points: 1, difficulty: "Novice", start: "Talk to Journeyman Tobbin in the Great Hall of the FFF Fortress, after The Gate Question.",
    requirements: ["The Gate Question"], rewards: ["1 Quest Point", "FFF tinker's ring", "2,000 Cooking XP"],
    journal: game => {
      const s = stage(game, "fff_toaster"), p = game.player;
      if (s === 0) return ["A wizard in the Great Hall is arguing with a magical artifact that is not a toaster. The artifact is winning."];
      if (s === 1) return ["The artifact wants five loaves of bread. It will not say why. Tobbin says if it gets the bread it will tell him what it knows, and it says it knows something.",
        `${count(p, "bread") >= 5 ? "✓" : "•"} Bread: ${Math.min(5, count(p, "bread"))}/5`];
      if (s === 2) return ["The artifact ate the bread and said there is a Regiment dispatch case under Sir Haddock's chair, and a spy in the fortress. Wake Sir Haddock.", `${data(game, "ft_knight") ? "✓" : "•"} Sir Haddock woken`];
      return [data(game, "ft_spy") ? "The dispatch case was under the chair. The artifact says the spy was me. Tobbin says the Federation knew, and counted me counting. Nobody minded. QUEST COMPLETE!" : "The dispatch case was under the chair: a Regiment scout left it, and the rangers have him. The artifact wants more bread. QUEST COMPLETE!"];
    },
  },
  {
    id: "fff_rangers", name: "Whispers in BarkReach", points: 2, difficulty: "Intermediate", start: "Talk to Ranger-Captain Hesper Lark in the Ranger Yard of the FFF Fortress, after The Gate Question.",
    requirements: ["The Gate Question", "Ranged 50 recommended"], rewards: ["2 Quest Points", "FFF ranger's hood", "5,000 Ranged XP", "100 broadhead arrows"],
    journal: game => {
      const s = stage(game, "fff_rangers"), p = game.player;
      if (s === 0) return ["The Regiment's scouts are in BarkReach. The Ranger-Captain would like them not to be, and would like antler for the rangers' bows while I'm there."];
      if (s === 1) return ["Put down eight Regiment scouts in BarkReach and Deep Westmarch, and bring four greatstag antlers to the Ranger-Captain.",
        `${data(game, "fr_scouts") >= 8 ? "✓" : "•"} Regiment scouts put down: ${Math.min(8, data(game, "fr_scouts"))}/8`, `${count(p, "stag_antler") >= 4 ? "✓" : "•"} Greatstag antlers: ${Math.min(4, count(p, "stag_antler"))}/4`];
      return ["The scouts are out of the wood, for now. The Ranger-Captain gave me a ranger's hood and a hundred antler-tipped arrows, and said the wood was quieter. It was. QUEST COMPLETE!"];
    },
  },
  {
    id: "fff_sabotage", name: "Powder and Paper", points: 3, difficulty: "Long", start: "Talk to Archwizard Mab Ferrule in the Wizard Tower of the FFF Fortress, after Fortunately, We Built a Solution.",
    requirements: ["Fortunately, We Built a Solution", "Combat 65 recommended"], rewards: ["3 Quest Points", "FFF spellbook", "6,000 Magic XP", "3,000 Thieving XP"],
    journal: game => {
      const s = stage(game, "fff_sabotage"), p = game.player;
      if (s === 0) return ["The Archwizard wants the Regiment's camp positions, which are in a dispatch, which is in a captain's case, and wants their footmen thinned while I'm at it."];
      if (s === 1) return ["Take a Regiment dispatch from a Regiment captain (the Spine camp, the Spine Watch, or wherever one stands), put down six footmen, and bring the dispatch to the Archwizard.",
        `${has(p, "rrr_dispatch") ? "✓" : "•"} A Regiment dispatch`, `${data(game, "fs_footmen") >= 6 ? "✓" : "•"} Regiment footmen put down: ${Math.min(6, data(game, "fs_footmen"))}/6`];
      return ["The Archwizard read the dispatch and moved three pins on the red-string map. The Regiment's camps are where the Federation can see them now. She gave me a spellbook with her own corrections in it. QUEST COMPLETE!"];
    },
  },
  {
    id: "candlemere_tithe", name: "The Candlemere Tithe", points: 2, difficulty: "Intermediate", start: "Talk to Reeve Odo Tallow in Candlemere, in the Crownlands, after Papers of Passage.",
    requirements: ["Papers of Passage"], rewards: ["2 Quest Points", "10 crown sigils", "5,000 coins", "3,000 Cooking XP", "The reeve's gratitude, which is entered in the Ledger"],
    journal: game => {
      const s = stage(game, "candlemere_tithe"), p = game.player;
      if (s === 0) return ["The Crown's tithe from Candlemere is short, and the reeve answers for it. He'd take help, from someone who isn't from Candlemere."];
      if (s === 1) return ["The reeve needs the tithe made up before the Assessor's clerk comes: grain, eggs and meat, which the farms couldn't spare.",
        `${count(p, "grain") >= 15 ? "✓" : "•"} Grain: ${Math.min(15, count(p, "grain"))}/15`, `${count(p, "egg") >= 5 ? "✓" : "•"} Eggs: ${Math.min(5, count(p, "egg"))}/5`, `${count(p, "cooked_meat") >= 5 ? "✓" : "•"} Cooked meat: ${Math.min(5, count(p, "cooked_meat"))}/5`];
      return ["The tithe is made up and the reeve is in the Ledger as 'reliable', which he says is the best thing a Rarian can be, and doesn't look happy about. QUEST COMPLETE!"];
    },
  },
  {
    id: "heartwood_elder", name: "The Ironbark Elder", points: 3, difficulty: "Long", start: "Talk to Ranger-Captain Holt Ashgrove at the Antler Lodge in BarkReach, with a combat level of 85 or so.",
    requirements: ["Combat 85 recommended"], rewards: ["3 Quest Points", "Ironbark war bow", "8,000 Ranged XP", "4,000 Woodcutting XP"],
    journal: game => {
      const s = stage(game, "heartwood_elder");
      if (s === 0) return ["The Antler Lodge's captain won't walk one path in the Heartwood. At its end is the oldest ironbark in the wood, and it walks."];
      if (s === 1) return ["The Ironbark Elder walks the deepest Heartwood, and every lurker in BarkReach grows from its fallen bark. The captain wants it brought down and its heartwood brought back.",
        `${data(game, "he_elder") >= 1 ? "✓" : "•"} The Ironbark Elder brought down`, `${has(game.player, "heartwood") ? "✓" : "•"} Its heartwood, to the captain`];
      return ["The Elder is down. The captain cut a war bow from its heart and gave it me, and went to look at the path he wouldn't walk. QUEST COMPLETE!"];
    },
  },
  {
    id: "barkreach_heartwood", name: "Heartwood", points: 2, difficulty: "Intermediate", start: "Talk to Foreman Greta Sawyer at the Heartwood Yard in Sawyer's Rest, BarkReach, with Woodcutting 68.",
    requirements: ["Woodcutting 68"], rewards: ["2 Quest Points", "Woodsman's bow", "6,000 Woodcutting XP", "3,000 Fletching XP"],
    journal: game => {
      const s = stage(game, "barkreach_heartwood"), p = game.player;
      if (s === 0) return ["The Heartwood Yard wants ironbark, and the heart of an old one, which the bark lurkers grow round. Foreman Sawyer will pay in a bow."];
      if (s === 1) return ["Cut ten ironbark logs in BarkReach, and take the heartwood from a bark lurker (they grow in the old ironbarks). Bring both to the foreman.",
        `${count(p, "ironbark_logs") >= 10 ? "✓" : "•"} Ironbark logs: ${Math.min(10, count(p, "ironbark_logs"))}/10`, `${has(p, "heartwood") ? "✓" : "•"} Ironbark heartwood, from a bark lurker`];
      return ["The foreman split the heartwood and gave me a bow made from the last one. She says the yard will buy every log I cut. QUEST COMPLETE!"];
    },
  },
];

// ---------- Hooks: kills, altars, standing in the right place, shops ----------
/** Kills the west's quests count, and the things the dead carry while you're looking for them. */
export function onWestKill(game: Game, monsterId: string) {
  const player = game.player;
  const tally = (quest: string, key: string, goal: number, done: string, atStage = 1) => {
    if (stage(game, quest) !== atStage) return;
    const n = player.questData[key] = (player.questData[key] ?? 0) + 1;
    if (n === goal) { message(game, done, "quest"); sound(game, "quest"); }
  };
  const carry = (quest: string, itemId: string, text: string) => { if (stage(game, quest) === 1 && !has(player, itemId)) { giveOrDrop(game, itemId); message(game, text, "quest"); sound(game, "quest"); } };
  if (monsterId === "deserter") { tally("west_watch", "ww_deserters", 4, "Four deserters down. Captain Ashby will want the rest of it from my own mouth."); carry("cog_reliquary", "dusk_reliquary", "In the deserter's pack: a small violet box, locked, that hums when you hold it still. The Dusk's reliquary."); }
  if (monsterId === "rrr_captain") { tally("fff_cannon", "fc_captain", 1, "The captain is down. Fellow Free will call that finished.", 2); carry("fff_sabotage", "rrr_dispatch", "The captain's case holds a Regiment dispatch: camp positions, in a careful hand. The Archwizard wants it."); }
  if (monsterId === "rrr_scout") tally("fff_rangers", "fr_scouts", 8, "Eight Regiment scouts out of the wood. The Ranger-Captain wanted antler besides.");
  if (monsterId === "rrr_footman") tally("fff_sabotage", "fs_footmen", 6, "Six footmen. The Archwizard wanted the dispatch too.");
  if (monsterId === "ironbark_treant") tally("heartwood_elder", "he_elder", 1, "The Ironbark Elder comes down like a felled tower. Its heartwood is yours; the captain will want it.");
  if (monsterId === "bark_lurker") carry("barkreach_heartwood", "heartwood", "The lurker comes apart round a grey heart of ironbark, cut out whole. The foreman wanted this.");
}
/** Praying at the Wise Friend's altar in the Chapel of the Law. */
export function onWestAltar(game: Game, altar: { name: string; text?: string }) {
  if (altar.text === "wise" && stage(game, "wise_friends_law") === 1 && !data(game, "wfl_prayed")) { game.player.questData.wfl_prayed = 1; message(game, "You kneel at the Wise Friend's altar. The chaplain reads the first line of the Law over you. It is long.", "quest"); sound(game, "quest"); }
}
/** Standing in the Great Hall of the Federation with the Colonel's tally to make. */
export function onWestTick(game: Game) {
  const p = game.player;
  if (stage(game, "cog_federation") === 1 && !data(game, "ef_counted") && p.x >= 31 + WEST_DX && p.x <= 49 + WEST_DX && p.y >= 392 && p.y <= 402) {
    p.questData.ef_counted = 1; giveOrDrop(game, "federation_tally"); message(game, "You count what's running in the Great Hall. Fourteen devices, one cannon, one knight asleep, one chicken. You write it down. Nobody stops you, which is its own answer.", "quest"); sound(game, "quest");
  }
}
/** Why a shop of the west won't sell to you, or null. */
export function westShopProblem(game: Game, shopId: string): string | null {
  if (shopId.startsWith("fff_") && !KNOWS_FFF(game)) return "The Federation trades with people it knows. The Gate-Warden decides who it knows.";
  if (shopId.startsWith("raria_") && !KNOWS_RARIA(game)) return "The Office of Conduct hasn't registered you. Nothing in Raria is sold to a name that isn't in the Ledger.";
  if (shopId === "dusk_armoury" && !questDone(game, "oath_dusk")) return "The Dusk's quartermaster sells to the sworn. Prior Caul hears oaths.";
  if (shopId === "vesper_reliquary" && !KNOWS_RARIA(game)) return "The abbey's reliquary serves names in the Ledger. The Office of Conduct in Raria registers them.";
  return null;
}
/** The Regiment honours the writ, not you: its truce holds while you carry one, and for good once you're in the Ledger. */
export const westTruce = (game: Game, faction: string) => faction === "rrr" && stage(game, "rrr_truce") >= 1 && has(game.player, "writ_of_passage");

// ---------- Dialogue ----------
const pick = (game: Game, lines: readonly string[]) => lines[Math.floor(game.rng() * lines.length)];
const met = (game: Game, key: string) => { if (!data(game, key)) { game.player.questData[key] = 1; } };
export function talkWest(game: Game, npcId: string, name: string): Dialogue | null {
  const player = game.player;
  switch (npcId) {
    // ---------- Hollowmere ----------
    case "hollowmere_officer": {
      if (combat(game) < 40 && stage(game, "west_watch") === 0) return chat(name, npcSays(name, "The Kingdom of Hollowmere's garrison, at your service, which is more than I can say for the west. Come back when you can hold a sword (combat 40) and I'll have work for you."));
      return fetchQuest(game, name, "west_watch", {
        offer: ["You're not a soldier. Good. I've sent soldiers west and got soldiers' answers: 'a camp', 'a checkpoint', 'banners, violet'. I want someone to walk the West Road past Westwatch and tell me what's actually there.",
          "Report to Lieutenant Harrow at Westwatch. Find out who holds the road past him; don't take anyone's papers. And the Stone Field's full of our own deserters: put four of them down on the way, so the rest know the kingdom still counts."],
        accept: "Westwatch, the road, the deserters. Come back and tell me plainly.", progress: "Westwatch, the road beyond it, four deserters. Then tell me plainly.",
        have: () => data(game, "ww_post") >= 1 && data(game, "ww_seen") >= 1 && data(game, "ww_deserters") >= 4, take: () => {},
        done: ["A kingdom. Called Raria. With a Regiment, a checkpoint, and a city behind the Drakespine that was not there in spring.", "I've been to the castle's maps. There is no Raria on any of them, and the oldest is older than the castle. Nobody crossed the Spine. Nobody remembers them arriving. They were simply there, entrenched, before anyone knew their name.", "Take this. The crown's cape, for a report nobody at the castle wanted. Keep your eyes open out there. Something is happening, and we're the last to know."],
        reward: () => { giveOrDrop(game, "hollowmere_cape"); addXp(game, "attack", 3000, { raw: true }); addXp(game, "presence", 2000, { raw: true }); },
      });
    }
    case "hollowmere_lieutenant": {
      if (stage(game, "west_watch") === 1 && !data(game, "ww_post")) { player.questData.ww_post = 1; return chat(name, npcSays(name, "Ashby sent you? Good. Here's my report, since nobody reads the written one: there's a kingdom west of here. Raria. The Regiment holds the road from the checkpoint on; they'll stamp you a writ if you ask nicely, and write your name down if you don't.", "They didn't come over the Spine, they didn't come by sea, and they didn't come up the road. They were simply there. I've men who swear the violet banners were up before the Stone Field, and the Stone Field was the first fighting."), undefined, () => { message(game, "Lieutenant Harrow's report is in your head. Now the road beyond him.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, pick(game, ["Westwatch. The last post of the Kingdom of Hollowmere, and the first place anyone said 'Raria' out loud. I'd like to be the last place too, but the Regiment's got other ideas.", "Three things I know about Raria: their soldiers march in step, their banners are violet, and they were here before we were. I don't like the third one.", "The Federation's south, past the picket line. Lunatics, every one, and the only people out here I'd trust with a sword at my back. Don't tell them I said so.", "Don't take papers from the Regiment. Or do; I can't stop you. Just know they'll have your name after, and they keep names."])));
    }
    case "hollowmere_soldier": return chat(name, npcSays(name, pick(game, ["Hollowmere soldier, on patrol. The crown's road runs to Westwatch and no further. Past that it's the Regiment's, they say, and they say it with halberds.", "Raria wasn't there before. I walked that road as a boy and there was nothing past the Drakespine but drakes.", "They say Raria crossed the mountains. They say Raria was hidden. They say Raria's been there for centuries. I say nobody saw them come, and I was on the wall.", "The captain's got a map with a hole in it. She's not the only one.", "If you see anyone in violet, you walk the other way and you tell the captain. That's the whole order. That's the whole kingdom's order."])));
    case "hollowmere_scout": return chat(name, npcSays(name, pick(game, ["I've been further west than Westwatch. I've been to the gate. They've got a city, a real one, walls and a palace and a chapel with a spire, and every street swept. Nobody builds that in a season.", "Their rangers don't move. You walk past one and it hasn't moved when you walk back. I didn't walk back the same way.", "The Federation's got a cannon. I don't know what it fires. I don't think they do either, and I think that's the point.", "Somebody in Raria told me the Wise Friend 'returned'. Returned from where? She just smiled."])));
    case "hollowmere_messenger": return chat(name, npcSays(name, pick(game, ["Can't stop! Dispatches for Westwatch. Something about violet banners. It's always something about violet banners now.", "The castle sends three riders a day west now and gets three reports back saying the same thing: 'still there'.", "If you're going west, the Federation's road forks south past the picket. Don't take the Regiment's road without a writ. Don't take a writ without thinking about it. Can't stop!"])));
    case "west_watcher": {
      met(game, "met_watcher");
      return chat(name, npcSays(name, pick(game, ["You found the hollow. Good. Sit. The statue's older than Raria, whatever Raria says: my grandmother brought flowers here, and hers, and the blindfold was on it then. Raria says the Wise Friend 'returned'. I say it never left; it's the kingdom that came back.", "Came back from where? Ask the stones. The watch-stones on the Westmarch road fell westward. The ones in the Stone Field fell westward. Something pushed, from the west, a long time ago. The castle was built against it. And now there's a kingdom there again, and nobody remembers it leaving.", "The Regiment doesn't know this place. The Federation doesn't either, though their librarian's close. Keep it so. The flowers are for whoever the Wise Friend was before Raria told it what to be."])), [
        { label: "Who are you?", then: () => chat(name, npcSays(name, "Nobody in anyone's Ledger. I watch the stones. Somebody has to, and the kingdom that should have been watching them forgot how.")) },
        { label: "I'll keep it quiet.", then: () => null },
      ]);
    }
    // ---------- The Free Friends Federation ----------
    case "fff_gatewarden": {
      if (stage(game, "fff_truce") === 0) {
        const q3 = (): Dialogue => chat(name, npcSays(name, "Third question. If the Federation asked you to do something ridiculous, and it was also the right thing, would you do it?"), [
          { label: "Yes. Obviously.", then: () => chat(name, npcSays(name, "Correct. Everything we do is ridiculous and most of it is right.", "The Federation says welcome by asking for oddities for the Library. Three: a greatstag antler from BarkReach, five storm sigils, and ten pine logs. The librarian will explain the logs. Nobody else can."), [
            { label: "I'll do it.", then: () => chat(name, npcSays(name, "Antler, five storm sigils, ten pine logs. Then the Federation knows your name, and I write it on a card, and that's the only card we keep."), undefined, () => { player.quests.fff_truce = 1; message(game, "Quest started: The Gate Question.", "quest"); sound(game, "quest"); }) },
            { label: "Not today.", then: () => null },
          ]) },
          { label: "Only if it made sense.", then: () => chat(name, npcSays(name, "Then it wouldn't be ridiculous. Try again."), [{ label: "Ask me again.", then: () => q3() }]) },
          { label: "No.", then: () => chat(name, npcSays(name, "Honest. Wrong, but honest. Try again."), [{ label: "Ask me again.", then: () => q3() }]) },
        ]);
        const q2 = (): Dialogue => chat(name, npcSays(name, "Second question. Who do you answer to?"), [
          { label: "Myself.", then: () => chat(name, npcSays(name, "Correct. Everyone here does, and somehow the fortress still stands."), [{ label: "Next question.", then: () => q3() }]) },
          { label: "The Kingdom of Hollowmere.", then: () => chat(name, npcSays(name, "A kingdom. Mm. We don't hold it against you; we hold it against the kingdom. Try again, and this time tell me who you'd answer to if the kingdom wasn't asking."), [{ label: "Ask me again.", then: () => q2() }]) },
          { label: "Her Radiance, Queen of Raria.", then: () => chat(name, npcSays(name, "Then you are at the wrong gate, and I say that with great politeness and a hand near a wand. Try again."), [{ label: "Ask me again.", then: () => q2() }]) },
        ]);
        return chat(name, npcSays(name, "Welcome to the FFF Fortress. I'm the Gate-Warden, which makes me the Federation's only bureaucrat, and I apologise for it. Three questions, and then you're either in or you're not. First question: why are you here?"), [
          { label: "To see what the Federation is.", then: () => chat(name, npcSays(name, "Honest. Good: honest's the right answer to all three."), [{ label: "Next question.", then: () => q2() }]) },
          { label: "To buy things.", then: () => chat(name, npcSays(name, "Also honest. The shops are through the gate, and the gate's through me."), [{ label: "Next question.", then: () => q2() }]) },
          { label: "Raria sent me.", then: () => chat(name, npcSays(name, "That's honest too, and I'm writing it down, and I'm still letting you answer the next one. We count everyone. Even people counting us."), [{ label: "Next question.", then: () => q2() }]) },
        ]);
      }
      return fetchQuest(game, name, "fff_truce", {
        offer: [""], accept: "", progress: "Antler, five storm sigils, ten pine logs, for the Library. Then I write the card.",
        have: () => count(player, "stag_antler") >= 1 && count(player, "storm_sigil") >= 5 && count(player, "pine_logs") >= 10, take: () => { take(player, "stag_antler", 1); take(player, "storm_sigil", 5); take(player, "pine_logs", 10); },
        done: ["Antler, sigils, logs. The librarian will be pleased, or whatever she does instead.", "The Federation knows your name now. I've written it on the card. The shops are yours, the pickets will wave, and Fellow Free's in the Great Hall if you want to meet him; everyone does, once, and then they stop being sure what they saw.", "Here: the artisans' cape. It says FFF on it. Everything does."],
        reward: () => { giveOrDrop(game, "fff_cape_artisan"); addXp(game, "crafting", 2000, { raw: true }); },
      });
    }
    case "fellow_free": {
      met(game, "met_fff");
      if (!KNOWS_FFF(game)) return chat(name, npcSays(name, "You've come through the gate without the Gate-Warden's card. Inconvenient. He'll be along; he is always along.", "Raria has brought an army into our forest. This is inconvenient. Fortunately, we have built a solution. You may look at it. Do not stand in front of it."));
      const cannon = stage(game, "fff_cannon");
      if (cannon === 0) return chat(name, npcSays(name, "Raria has brought an army into our forest.", "This is inconvenient.", "Fortunately, we have built a solution."), [
        { label: "The cannon?", then: () => chat(name, npcSays(name, "The cannon. It needs a cradle, and the cradle needs what Artificer Bolt says it needs: three moonsilver bars, ten inkcoal, eight storm sigils, two ironbark logs. Bring him those, bring me the cradle, and we'll show the Regiment what the Federation does with a problem."), level(game, "smithing") < 40
          ? [{ label: "I'll do it.", then: () => chat(name, npcSays(name, "The cradle needs a smith's hands as well as mine (Smithing 40). Come back with them.")) }, { label: "Not today.", then: () => null }]
          : [{ label: "I'll do it.", then: () => chat(name, npcSays(name, "Moonsilver, inkcoal, storm, ironbark. The artificer. Then me. Then: BOOM."), undefined, () => { player.quests.fff_cannon = 1; message(game, "Quest started: Fortunately, We Built a Solution.", "quest"); sound(game, "quest"); }) }, { label: "Not today.", then: () => null }]) },
        { label: "What is the Federation, exactly?", then: () => chat(name, npcSays(name, "Wizards, knights, rangers and artisans who decided that nobody was going to tell them what to do, and then built a fortress, a cannon, fourteen devices and a bank with no fees to prove it. We keep to ourselves. We are very good at it.", "The Queen has mistaken freedom for a disease. We have mistaken nothing. The chicken is an admiral; that is a separate matter.")) },
        { label: "About the Queen.", then: () => chat(name, npcSays(name, "Her Radiance thinks we are a disease. I think she is a very tall woman who has read one book and believes it. Both of us are armed. Only one of us built a cannon.", "I do not hate Raria. I find it inconvenient. There is a difference, and the difference is about nine feet of copper.")) },
      ]);
      if (cannon === 1) {
        if (!has(player, "cannon_cradle")) return chat(name, npcSays(name, "The artificer has the list. Moonsilver, inkcoal, storm sigils, ironbark. He will give you the cradle. I will give the cradle a purpose."));
        return chat(name, npcSays(name, "The cradle. Good. Hold this end. No, that end. Now step back.", "BOOM.", "The Regiment's Spine Watch no longer has a tower. It has a captain, still. Finish what the cannon started: put a Regiment captain down, anywhere you find one, and come back."), undefined, () => {
          take(player, "cannon_cradle", 1); player.quests.fff_cannon = 2; player.questData.fc_captain = 0; message(game, "The Federation's cannon fires. The Spine Watch's tower is gone. A Regiment captain, now.", "quest"); sound(game, "quest");
        });
      }
      if (cannon === 2) {
        if (data(game, "fc_captain") < 1) return chat(name, npcSays(name, "A captain. Any captain. The Regiment has several, and they stand in the open, which is the first thing a Federation knight learns not to do."));
        return chat(name, npcSays(name, "The captain is down. The cannon has a name now. It is 'Solution'. The artisans voted.", "This was never about the cannon. It was about whether the Federation would stand with someone who stood with it. You did. Take the Federation's own cape; there are eleven of them, and now twelve.", "The Queen will hear of this. Good. Let her read it in the Ledger."), undefined, () => {
          giveOrDrop(game, "fff_cape_elite"); addXp(game, "magic", 8000, { raw: true }); addXp(game, "smithing", 5000, { raw: true }); completeQuest(game, "fff_cannon");
        });
      }
      return chat(name, npcSays(name, pick(game, ["Fourteen devices. All running. One of them is for later; I have not decided when.", "The Queen has mistaken freedom for a disease. We have a cure. It is copper and nine feet long and the artisans have named it.", "Hollowmere does not know where Raria came from. Neither do we, and we have a library. Wendeline says the map is wrong. Wendeline says that about every map, and she has been right about every map.", "Sir Haddock is asleep. Sir Haddock has been asleep since the cannon's first test. He is fine. He is the only one who is."])), [
        { label: "About the Queen.", then: () => chat(name, npcSays(name, "She believes the Law. Completely. That is what makes her dangerous: not malice, certainty. I am certain of nothing except the cannon, and I check the cannon daily.")) },
        { label: "Goodbye.", then: () => null },
      ]);
    }
    case "fff_archwizard": {
      met(game, "met_fff");
      if (!KNOWS_FFF(game)) return chat(name, npcSays(name, "The Tower doesn't sell to strangers. The Gate-Warden decides who's a stranger; I decide what explodes."));
      if (questDone(game, "fff_cannon") && stage(game, "fff_sabotage") === 0) return fetchQuest(game, name, "fff_sabotage", {
        offer: ["The cannon fired. Now I want to know where to point it. The Regiment's camp positions are in a dispatch, the dispatch is in a captain's case, and the captain is in the open.", "Take me a dispatch, and thin their footmen on the way: six of them. Powder and paper. Then the red-string map gets three more pins."],
        accept: "A dispatch from a captain, six footmen. The map's waiting.", progress: "A captain's dispatch, six footmen. Powder and paper.",
        have: () => has(player, "rrr_dispatch") && data(game, "fs_footmen") >= 6, take: () => take(player, "rrr_dispatch", 1),
        done: ["Camp positions. In a careful hand. They're all careful.", "Three pins moved. The Regiment is where the Federation can see it now, which is where the Federation likes things.", "Take this: my spellbook. The corrections in red are mine. Most of the originals are wrong."],
        reward: () => { giveOrDrop(game, "fff_spellbook"); addXp(game, "magic", 6000, { raw: true }); addXp(game, "thieving", 3000, { raw: true }); },
      });
      if (stage(game, "fff_sabotage") === 1) return fetchQuest(game, name, "fff_sabotage", { offer: [""], accept: "", progress: "A captain's dispatch, six footmen. Powder and paper.", have: () => has(player, "rrr_dispatch") && data(game, "fs_footmen") >= 6, take: () => take(player, "rrr_dispatch", 1),
        done: ["Camp positions. In a careful hand. They're all careful.", "Three pins moved. The Regiment is where the Federation can see it now.", "Take this: my spellbook. The corrections in red are mine."], reward: () => { giveOrDrop(game, "fff_spellbook"); addXp(game, "magic", 6000, { raw: true }); addXp(game, "thieving", 3000, { raw: true }); } });
      return chat(name, npcSays(name, pick(game, ["Robes, reinforced, because Federation wizards stand in the front line out of principle. Wands, staffs, a spellbook you hold like a shield. Sigils of every kind the Realm presses.", "Rarian magic is a rite with a staff in it. Ours is an argument with a crystal in it. Theirs is prettier. Ours is louder.", "I've blown this tower up twice. Both times it came back taller. Raria's chapel has a spire. Mine has a reason."])), [
        { label: "Show me.", then: () => { game.ui.shop = "fff_arcanum"; return null; } }, { label: "Maybe later.", then: () => null }]);
    }
    case "fff_artificer": {
      if (!KNOWS_FFF(game)) return chat(name, npcSays(name, "Workshops are through the gate and the gate's through Pip. I've got eleven tools and none of them are for strangers."));
      if (stage(game, "fff_cannon") === 1 && !has(player, "cannon_cradle") && !data(game, "fc_cradle")) {
        if (count(player, "moonsilver_bar") >= 3 && count(player, "inkcoal") >= 10 && count(player, "storm_sigil") >= 8 && count(player, "ironbark_logs") >= 2) return chat(name, npcSays(name, "Moonsilver, inkcoal, storm, ironbark. Give them here. Hold this. Hold that. Mind the bit that's hot, which is all of it.", "There. A cradle. It's warm; it wants a barrel. Fellow Free has the barrel. Fellow Free has everything."), undefined, () => {
          take(player, "moonsilver_bar", 3); take(player, "inkcoal", 10); take(player, "storm_sigil", 8); take(player, "ironbark_logs", 2); giveOrDrop(game, "cannon_cradle"); player.questData.fc_cradle = 1; message(game, "The artificer builds the cannon's cradle. Take it to Fellow Free.", "quest"); sound(game, "quest");
        });
        return chat(name, npcSays(name, "The cradle wants three moonsilver bars, ten inkcoal, eight storm sigils and two ironbark logs. The logs are the hard part; the ironbarks are in BarkReach and they don't like axes."));
      }
      return chat(name, npcSays(name, pick(game, ["Tools, materials, limbs and stocks, bars, inkcoal, antler. If the Federation can make it, I sell what it's made of.", "Eleven tools. This one's a hammer. This one's also a hammer, but it argues.", "The Regiment's armour is all the same. All of it. Every rivet. I couldn't do that if you paid me, and nobody pays me."])), [
        { label: "Show me.", then: () => { game.ui.shop = "fff_workshop"; return null; } }, { label: "Maybe later.", then: () => null }]);
    }
    case "fff_armourer": return chat(name, npcSays(name, KNOWS_FFF(game) ? pick(game, ["Federation steel, copper-washed, verdigris at the joints. Swords, greatswords, glaives, maces, two kinds of shield, plate that dries. And the rangers' leathers, the longbow and the repeater, which only jams on Tuesdays.", "Warcaster plate for wizards who want to be hit. Skirmisher's jerkin for rangers who want to hit back. The arcane bow for people who can't decide, which is most of us."]) : "Armoury's for the Federation's own. Pip at the gate decides who that is."), KNOWS_FFF(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "fff_armoury"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "fff_librarian": {
      met(game, "met_fff");
      return chat(name, npcSays(name, pick(game, ["The Library. Half the margins are mine. The pine logs are for the shelves; nobody believes that, and it's true.", "Every map of the west is wrong. I don't mean out of date. I mean the oldest ones have a blank where Raria is, with a line of script round it that nobody can read, and the newest have a city there with a palace in the middle. Nothing in between. No years of building. Nothing.", "Raria says the Wise Friend 'returned'. The Old Friend's chapels say the Wise Friend is the Old Friend with a blindfold on. There's a statue in BarkReach that says both of them are wrong. I haven't told the rangers about it.", "The Queen has read one book. I've read all of them. We disagree about which of us that makes dangerous."])));
    }
    case "fff_ranger_captain": {
      if (!KNOWS_FFF(game)) return chat(name, npcSays(name, "The yard's for rangers. The gate's for Pip. You're for neither, yet."));
      return fetchQuest(game, name, "fff_rangers", {
        offer: ["The Regiment's scouts are in BarkReach. Eight of them, by my count, and I count. I'd like them out of the wood, and I'd like antler for the rangers' bows while you're there: four greatstag antlers.", "Rangers, not knights: nothing loud. Put them down one at a time and the wood won't notice. Neither will Raria, until it counts."],
        accept: "Eight scouts, four antlers. The wood will be quieter.", progress: "Eight scouts out of the wood, four antlers. Quietly.",
        have: () => data(game, "fr_scouts") >= 8 && count(player, "stag_antler") >= 4, take: () => take(player, "stag_antler", 4),
        done: ["Eight. Quietly. Good.", "The wood's quieter. It won't last; the Regiment counts too. Take a ranger's hood, and a hundred of the hunters' antler arrows; the Federation's broadheads are better, but these came from the wood you cleared."],
        reward: () => { giveOrDrop(game, "fff_ranger_hood"); give(player, "broadhead_arrow", 100); addXp(game, "ranged", 5000, { raw: true }); },
      });
    }
    case "fff_wizard_arguing": {
      if (!KNOWS_FFF(game)) return chat(name, npcSays(name, "No, listen, you're NOT a toaster, I know, I'm AGREEING with you. Sorry, who are you? Pip hasn't sent anyone up."));
      const s = stage(game, "fff_toaster");
      if (s === 0) return fetchQuest(game, name, "fff_toaster", {
        offer: ["It is not a toaster. I know it is not a toaster. It knows it is not a toaster. It wants bread anyway, five loaves, and it says if it gets the bread it will tell me what it knows, and it says it knows something, and it's been right before, which is the worst part.", "Could you get the bread? I can't leave. If I leave it wins the argument."],
        accept: "Five loaves. Thank you. It's humming smugly already.", progress: "Five loaves. It can hear you not having them.",
        have: () => count(player, "bread") >= 5, take: () => take(player, "bread", 5),
        done: ["Bread. Thank you. Here, not-toaster, five loaves, as discussed. ...It's eaten them. It's... it says there's a Regiment dispatch case under Sir Haddock's chair. It says there's a spy in the fortress.", "Sir Haddock's asleep. He's always asleep. Could you wake him? It won't be me. It's never me."],
        reward: () => { player.quests.fff_toaster = 2; },
      });
      if (s === 1) return fetchQuest(game, name, "fff_toaster", { offer: [""], accept: "", progress: "Five loaves. It can hear you not having them.", have: () => count(player, "bread") >= 5, take: () => take(player, "bread", 5),
        done: ["Bread. Thank you. ...It's eaten them. It says there's a Regiment dispatch case under Sir Haddock's chair, and a spy in the fortress.", "Sir Haddock's asleep. Could you wake him?"], reward: () => { player.quests.fff_toaster = 2; } });
      if (s === 2) {
        if (!data(game, "ft_knight")) return chat(name, npcSays(name, "Sir Haddock. The chair. The case is under it. I'm not going; I'd lose."));
        const spy = questDone(game, "cog_federation") || stage(game, "cog_federation") >= 1;
        return chat(name, npcSays(name, spy ? "The case was there. The artifact says the spy was you. You counted us for Raria." : "The case was there. A Regiment scout left it; the rangers have him now, and he's very sorry.",
          spy ? "...We knew. We counted you counting. Nobody minded; it's the Federation. The artifact would like more bread, and I'd like you to have this ring, because you brought the bread when nobody else would." : "The artifact would like more bread. I'd like you to have this ring, because you brought the bread when nobody else would."), undefined, () => {
          if (spy) player.questData.ft_spy = 1; giveOrDrop(game, "fff_tinker_ring"); addXp(game, "cooking", 2000, { raw: true }); completeQuest(game, "fff_toaster");
        });
      }
      return chat(name, npcSays(name, pick(game, ["It's still not a toaster. We've agreed on that. We're arguing about whether it's a kettle now.", "It wants more bread. It always wants more bread. It's been right about everything, which is unbearable."])));
    }
    case "fff_knight_asleep": {
      if (stage(game, "fff_toaster") === 2 && !data(game, "ft_knight")) { player.questData.ft_knight = 1; return chat(name, npcSays(name, "...mm? The cannon? Has it fired? Oh. Under the chair? ...there is a case under the chair. It's not mine. It's got an eye on it.", "Tell Tobbin. I'm going back to... no, I'm up. I'm up. Was I up?"), undefined, () => { message(game, "Sir Haddock is awake, briefly. The case was under the chair. Tell Tobbin.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, pick(game, ["...zzz... not the glaive... the OTHER glaive...", "...zzz... fourteen devices... I counted... fifteen if you count the chicken...", "...mm. Is it Tuesday? The repeater jams on Tuesdays. ...zzz..."])));
    }
    case "fff_ranger": return chat(name, npcSays(name, KNOWS_FFF(game) ? pick(game, ["Federation ranger, off picket. The Regiment's scouts are in the wood. We're in the wood too. The wood's getting crowded.", "The cape says FFF. Everyone asks what it stands for. Free Friends Federation. Then they ask what that means, and the answer's the cape.", "BarkReach rangers are good. Better than us at the wood, not as good at the arguing. We trade antler for sigils and insults for insults."]) : pick(game, ["The Federation's south. The Regiment's north. You're in the middle, with a ranger's arrow pointed politely at your boot.", "We shoot what shoots first. We've never had to say it twice."])));
    case "fff_villager": return chat(name, npcSays(name, pick(game, ["Freehold. Nobody's village. The bank's free, the fire's free. The Federation's weird, and I say that with love, and a wrench.", "Fellow Free fixed my roof. With a device. The device is still on the roof. It's fine. It sings at night.", "The Queen says we're a disease. My cousin went to Raria for the bread. One kind, one price. He came back for the arguing.", "Raria wasn't there before. Everyone says it. Everyone says it like it explains something.", "Admiral Peck outranks Sir Haddock. Nobody's explained that either."])));
    // ---------- BarkReach ----------
    case "barkreach_foreman": {
      if (level(game, "woodcutting") < 68 && stage(game, "barkreach_heartwood") === 0) return chat(name, npcSays(name, "The Heartwood Yard. Redwood's 52 and ironbark's 68 to cut, and the yard buys every log. Come back with an axe that can bite ironbark (Woodcutting 68) and I'll have real work."), [
        { label: "Let's trade.", then: () => { game.ui.shop = "barkreach_lumber"; return null; } }, { label: "Thanks.", then: () => null }]);
      return fetchQuest(game, name, "barkreach_heartwood", {
        offer: ["Ironbark. The yard wants ten logs of it, and the heart of an old one: the grey heartwood, cut out whole. The lurkers grow in the old ironbarks; the heartwood's inside one of them, and you'll have to take it apart to get it.", "Bring both and I'll pay in a bow. Antler Jory made it from the last heartwood we had."],
        accept: "Ten ironbark logs, and the heartwood from a lurker. The bow's waiting.", progress: "Ten ironbark logs, and the heartwood. Mind the stumps that aren't.",
        have: () => count(player, "ironbark_logs") >= 10 && has(player, "heartwood"), take: () => { take(player, "ironbark_logs", 10); take(player, "heartwood", 1); },
        done: ["Ironbark, and the heart of one. Grey as the Regiment's plate and twice as hard.", "The bow's yours. Redwood, antler-nocked. The yard'll buy every log you cut, and there's more wood west than the Regiment knows."],
        reward: () => { giveOrDrop(game, "woodsmans_bow"); addXp(game, "woodcutting", 6000, { raw: true }); addXp(game, "fletching", 3000, { raw: true }); },
      });
    }
    case "barkreach_bowyer": return chat(name, npcSays(name, pick(game, ["Redwood bows, ironbark bows, war bows of both, and the hunters' broadheads, antler-tipped. Antler's the thing: a greatstag's, from the Stag's Rest.", "Ironbark bows need a heartwood nock or they split. I've one heartwood left. Don't ask.", "The Federation's longbow is three woods and a copper strip. Clever. Mine's one wood and the wood's right."])), [
      { label: "Show me.", then: () => { game.ui.shop = "barkreach_fletcher"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "barkreach_outfitter": return chat(name, npcSays(name, "Caps, jerkins, breeches and boots for the wood, in redwood-dyed leather. Hides bought, scraped or not."), [
      { label: "Show me.", then: () => { game.ui.shop = "barkreach_outfitter"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "barkreach_ranger": return chat(name, npcSays(name, pick(game, ["Antler Lodge ranger. The Regiment's scouts are in the north of the wood, counting trees. The Federation's pickets are in the west, counting the Regiment. I count greatstags.", "There's a glade in the east of the wood with cliffs all round and one way in. Hunters say there's a statue in it. Hunters say a lot of things.", "The Regiment says the wood's Raria's. The Federation says the wood's nobody's. The wood says nothing and grows ironbark through both their arguments.", "Lurkers look like stumps until they don't. We burn the real stumps so we can tell."])));
    case "barkreach_hunter": return chat(name, npcSays(name, pick(game, ["Greatstags. As tall at the shoulder as you are at the crown. Antler for the bowyer, hide for Marn, haunch for the fire. They don't go quietly.", "Saw a Royal Ranger in the wood once. Violet, silver, didn't move. I walked round it. It hadn't moved when I came back an hour later. I don't hunt that side now.", "The Stag's Rest. Fire's always lit, and the Thistle Vale's an hour south if you want a bed."])));
    case "barkreach_trader": return chat(name, npcSays(name, pick(game, [
      "Wood's End. A fort, a store, a fire and a gate, and the only roof between the Federation and Sawyer's Rest. Logs and hides bought; food, arrows, string and tools sold.","Wood's End. Everything that comes down the wood road comes past me, and everything that comes up the vale road too. The Regiment's been down once. They bought nothing and wrote everything down.", "Hollyhock's south, the Federation's road is west, and the wood's north. Three kinds of trouble, and I sell rope to all of them.", "Hear things twice here. Heard 'Raria wasn't there before' about forty times. Heard 'Raria was always there' once, from a Rarian, who smiled."])), [{ label: "Show me.", then: () => { game.ui.shop = "woods_end_post"; return null; } }, { label: "Maybe later.", then: () => null }]);
    case "barkreach_villager": return chat(name, npcSays(name, pick(game, ["Resin to the elbow and a stump to sit on. That's BarkReach.", "Ironbark bounces an axe. You need the knack, or a moonsilver edge, or both.", "The Federation's road goes west from here. Weird lot. Fixed our saw with a device. The saw sings now.", "Regiment scouts in the north wood. Counting trees. Who counts trees?"])));
    // ---------- Raria ----------
    case "raria_gate_captain": {
      if (stage(game, "west_watch") === 1 && !data(game, "ww_seen")) { player.questData.ww_seen = 1; message(game, "So that's who holds the road: the Rare Realm Regiment, for the Kingdom of Raria. Captain Ashby will want to hear it.", "quest"); sound(game, "quest"); }
      return fetchQuest(game, name, "rrr_truce", {
        offer: ["Halt. The road north is the Kingdom of Raria's, by the Wise Friend's Law and the Regiment's halberds. You have no writ. I write writs.", "Present yourself: your Friend's number, your name if you have one. I stamp a writ of passage, and the Regiment honours it, as long as you carry it. And you carry a sealed dispatch for the Office of Conduct in the city, north of the palace, because nothing enters Raria without a purpose."],
        accept: "Stamped. The writ, and the dispatch. The Regiment honours the writ, not you: lose it and they won't. Present both at the Office of Conduct.", progress: "The writ and the dispatch, to the Office of Conduct, north of the palace. The Regiment stands down while you carry the writ.",
        have: () => false, take: () => {}, done: [], reward: () => {},
        onAccept: () => { giveOrDrop(game, "writ_of_passage"); giveOrDrop(game, "sealed_dispatch"); },
      });
    }
    case "raria_clerk": {
      if (stage(game, "rrr_truce") === 1) {
        if (!has(player, "writ_of_passage") || !has(player, "sealed_dispatch")) return chat(name, npcSays(name, "The Office of Conduct. You are not in the Ledger. Present a writ of passage and the dispatch the checkpoint gave you, and you will be."));
        return chat(name, npcSays(name, "A writ. A dispatch. Thank you. The dispatch is about you; most of them are.", "You are registered. Your name is in the Ledger of Names, under 'Visitors, Westmarch, by the Regiment's writ'. Keep the writ; the Regiment honours it, and it is yours now. The shops of the city will sell to a registered name.", "Her Radiance receives new names. It is a kindness. Take the Book of the Law; everyone has one."), undefined, () => {
          take(player, "sealed_dispatch", 1); giveOrDrop(game, "law_book"); addXp(game, "prayer", 2000, { raw: true }); completeQuest(game, "rrr_truce");
        });
      }
      if (questDone(game, "rrr_truce")) return fetchQuest(game, name, "wise_friends_law", {
        offer: ["A registered name is received by Her Radiance and taught the Law. It is a kindness, and it is expected.", "An audience in the palace: the Queen, and the King. A prayer at the Wise Friend's altar in the Chapel of the Law. A word with Prior Caul of the Order of Dusk, who keeps the last hour of the day. Then return to me, and I will write 'received'."],
        accept: "The palace, the chapel, the Prior. Then me.", progress: "Her Radiance, the King, the altar, the Prior. Then 'received'.",
        have: () => data(game, "wfl_queen") >= 1 && data(game, "wfl_king") >= 1 && data(game, "wfl_prayed") >= 1 && data(game, "wfl_prior") >= 1, take: () => {},
        done: ["Received. I have written it. You may wear the mantle of a received name; the Sumptuary Office sends them to me for exactly this.", "The Prior will keep the Law for you whenever you ask: Raria's Magic and Faith in place of the old. It is not required. It is expected. Those are different words, and the Law has both."],
        reward: () => { giveOrDrop(game, "rarian_mantle"); addXp(game, "prayer", 4000, { raw: true }); },
      });
      return chat(name, npcSays(name, "The Office of Conduct. Names are registered here, and kept. Yours is not here yet. The Regiment's checkpoint on the West Road writes writs; present one, with the dispatch, and it will be."));
    }
    case "queen_rara": {
      met(game, "met_raria");
      if (!KNOWS_RARIA(game)) return chat(name, npcSays(name, "You are in Her Radiance's palace without a name in the Ledger. The Rangers have noted it. Go to the Office of Conduct, and be registered, and then you may be received."));
      if (stage(game, "wise_friends_law") === 1 && !data(game, "wfl_queen")) { player.questData.wfl_queen = 1; return chat(name, npcSays(name, "A new name. Welcome to Raria. I am Rara, Queen of Raria, Keeper of the Wise Friend's Law, and you are received.", "You will have heard that Raria was not here before. It was. It is the kingdom that was not. The Wise Friend's Law is older than Hollowmere's castle, and the castle was built facing it. We have returned to what is ours, and we are patient about the rest.", "The Free Friends Federation is a disease. I say it without heat: a disease is not wicked, it is simply wrong, and it spreads. We will cure it. You will help, in time; everyone received does, in time.", "Pray at the Wise Friend's altar. Speak with my husband; he is kind, and kindness is a law too. Speak with the Prior. Then you will understand what you have been given."), undefined, () => { message(game, "Received by Her Radiance. You are not sure you were asked.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, pick(game, ["The Law is kept here. You are keeping it, whether or not you have read it. That is its kindness.", "The Federation builds a cannon and calls it freedom. We build a city and call it the Law. One of us will still be standing in a hundred years, and it will not be the one with the chicken.", "Hollowmere asks where Raria came from. Hollowmere should ask what its castle faces, and why. The answer is the same.", "I am not cruel. I am certain. Those who confuse the two have never been certain of anything."])), [
        { label: "Where did Raria come from?", then: () => chat(name, npcSays(name, "Raria did not come. Raria returned. The Wise Friend closed its eyes so as never to see the Law broken, and opened them when it was kept again. That is the whole of it, and it is enough.", "You want a map with a year on it. There is no such map. There never was.")) },
        { label: "About the Federation.", then: () => chat(name, npcSays(name, "Fellow Free is a clever man who has mistaken freedom for a virtue. It is a condition. A city cannot be built on it, which is why he has built a fortress, and a fortress is a wall with the Law missing from inside it.", "He will say I have mistaken freedom for a disease. I have not mistaken anything.")) },
        { label: "Your Radiance.", then: () => null },
      ]);
    }
    case "king_pell": {
      met(game, "met_raria");
      if (stage(game, "wise_friends_law") === 1 && !data(game, "wfl_king")) { player.questData.wfl_king = 1; return chat(name, npcSays(name, "Oh! Hello. You're the new name. I'm Pell. King Pell, I suppose, but Pell. She's... she's very good at this, you know. Better than I am. I mostly read.", "The Law is long. I've read all of it, twice; the second time was to see if it said anything different, and it didn't. It's not cruel. It's just... complete. There isn't anywhere in it to stand that isn't already a place.", "Be careful of the Prior. No. Be careful of being careful; the Rangers notice that too. Just... go to the chapel. It's beautiful. It really is. That's the hardest part."), undefined, () => { message(game, "The King is kind, and nervous, and sees everything in the room.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, pick(game, ["Hello again. I'm not supposed to say that. I'm supposed to say 'the Crown receives you'. Hello again.", "She asks where Hollowmere thinks we came from, and laughs. I ask where we came from, and she says 'home'. I was born here, I think. I think I was.", "The Federation sent a letter once. It was addressed to 'the nice one'. I kept it. Don't tell her. She knows.", "The Rangers are very good. I've never once seen one move. I've never once not known where one was."])));
    }
    case "dusk_prior": {
      met(game, "met_dusk");
      const order = ORDERS.dusk;
      if (stage(game, "wise_friends_law") === 1 && !data(game, "wfl_prior")) { player.questData.wfl_prior = 1; return chat(name, npcSays(name, "The last hour of the day is the Order's. The rest are the Law's. You are received, I hear. Then hear this.", "The Wise Friend closed its eyes. The Order of Dusk keeps them closed: we keep what the Law forbids us to see from being seen. That is a vow, and a mercy, and a knife.", "When you are ready, I will keep the Law for you: your Magic and your Faith as Raria keeps them, edicts and rites in place of darts and prayers. The old book stays; it is only closed. Ask, and it is done; ask again, and it is undone. The Law is patient."), undefined, () => { message(game, "The Prior will keep the Law for you whenever you ask. Clerk Lathe will write 'received'.", "quest"); sound(game, "quest"); }); }
      const options: NonNullable<Dialogue["options"]> = [];
      if (questDone(game, "wise_friends_law")) {
        options.push(player.rarian
          ? { label: "Return to the Old Friend's book.", then: () => { setLaw(game, false); return chat(name, npcSays(name, "Undone. The old book opens; the Law closes its eyes. It will open them again when you ask. It always does.")); } }
          : { label: "Keep the Wise Friend's Law.", then: () => { setLaw(game, true); return chat(name, npcSays(name, "Done. Your Magic is edicts and judgements and vigils now, your Faith is the commandments and the rites. The old book is closed, not burnt. Look at them; you will see Raria in them, and Raria will see you.")); } });
        if (stage(game, "cog_reliquary") === 0 || stage(game, "cog_reliquary") === 1) options.push({ label: "About what the Dusk lost.", then: () => fetchQuest(game, name, "cog_reliquary", {
          offer: ["When the first fighting was, in the Stone Field, the Order lost a reliquary: a small violet box, locked. It went east with Hollowmere's deserters. I want it back unopened.", "Unopened. The deserters have it in the Stone Field or at Old Westwatch. Take it from them. Do not open it."],
          accept: "Unopened. I will know.", progress: "The reliquary, from the deserters, unopened. I will know.",
          have: () => has(player, "dusk_reliquary"), take: () => take(player, "dusk_reliquary", 1),
          done: ["Unopened. Good. You have kept a vow you did not take, which is the beginning of the Law.", "This is the Dusk's lantern: its light does not flicker, and the dead keep further from it than from a torch. Wear it at your belt. The Order keeps the last hour; now so do you."],
          reward: () => { giveOrDrop(game, "dusk_lantern"); addXp(game, "prayer", 5000, { raw: true }); addXp(game, "slayer", 3000, { raw: true }); },
        }) });
        if (level(game, "prayer") >= 20) options.push({ label: "About the Order's oath.", then: () => fetchQuest(game, name, "oath_dusk", {
          offer: [order.godText, `To swear the Dusk's oath, kneel at our altar in the last hour (any hour will do), and bring ${order.oath.text}.`],
          accept: "Kneel, and bring the sigils. The quartermaster sells to the sworn, in the dark, by touch.", progress: `The altar, and ${order.oath.text}. The oath waits, as the Order does.`,
          have: () => data(game, "prayed_dusk") >= 1 && count(player, order.oath.item) >= order.oath.n, take: () => take(player, order.oath.item, order.oath.n),
          done: ["Sworn. You are of the Order of Dusk, and the Wise Friend has closed its eyes on your name.", `Wear the Dusk's cape. The quartermaster has the rest. ${order.effect}`],
          reward: () => { giveOrDrop(game, "dusk_cape"); addXp(game, "prayer", 3000, { raw: true }); },
        }) });
      } else options.push({ label: "What is the Order of Dusk?", then: () => chat(name, npcSays(name, order.godText, "Be received first. The Law has an order to it; so do we.")) });
      options.push({ label: "Goodbye.", then: () => null });
      return chat(name, npcSays(name, pick(game, ["The last hour of the day is ours. The rest are the Law's.", "We keep what the Law forbids us to see from being seen. It is a vow, a mercy, and a knife.", "The Federation keeps nothing closed. That is why it is loud, and why it will not last."])), options);
    }
    case "dusk_quartermaster": return chat(name, npcSays(name, questDone(game, "oath_dusk") ? "Cowls, vestments, skirts, wraps, sandals; a pavise and an aegis; the censer-mace, the great censer and the crook. Novice, Vesper, Nocturne. By touch; the dark is the Order's." : "The Dusk's armoury is for the sworn. The Prior hears oaths; I hear nothing."), questDone(game, "oath_dusk") ? [
      { label: "Show me.", then: () => { game.ui.shop = "dusk_armoury"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "dusk_guard": return chat(name, npcSays(name, pick(game, ["Every grave the same. Every name in the Ledger. We count them at dusk. The count has never been wrong.", "The Order keeps the last hour. Do not be in the cemetery in it.", "The Wise Friend closed its eyes. We keep them closed. Ask the Prior what that means; I only keep it."])));
    case "rrr_officer": {
      if (!KNOWS_RARIA(game)) return chat(name, npcSays(name, "The Regimental Barracks. You are not in the Ledger. The Office of Conduct, then the Regiment, in that order; the Law has an order."));
      if (questDone(game, "cog_ledger")) return fetchQuest(game, name, "cog_federation", {
        offer: ["The Assessor says you are reliable. The Regiment uses reliable. The Federation is a wall with the Law missing from inside it, and I want to know what is inside: its devices, its cannon, its people. Counted.", "You can walk into the FFF Fortress; they let anyone in who answers three questions, which is their whole weakness. Stand in the Great Hall, count what is running, and bring me the tally."],
        accept: "The Great Hall. Count. Bring me the number.", progress: "Stand in the Federation's Great Hall and count. Then the number, to me.",
        have: () => has(player, "federation_tally"), take: () => take(player, "federation_tally", 1),
        done: ["Fourteen.", "...Fourteen. And a cannon. And a chicken; I will not record the chicken.", "You have been useful to the Regiment. Wear its banner; the Ledger will say 'used', which is the Regiment's word for 'trusted'. Here is the Crown's coin for it. It is a great deal of coin. That is also in the Ledger."],
        reward: () => { giveOrDrop(game, "rrr_banner"); give(player, "coins", 6000); addXp(game, "ranged", 4000, { raw: true }); },
      });
      if (stage(game, "cog_ledger") === 1 && has(player, "sealed_dispatch") && !data(game, "lg_colonel")) { player.questData.lg_colonel = 1; take(player, "sealed_dispatch", 1); return chat(name, npcSays(name, "A dispatch from the Office. Camp rotations. Thank you; you are reliable, the Assessor says, and the Regiment will remember it."), undefined, () => { message(game, "The colonel takes his dispatch.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, pick(game, ["The Rare Realm Regiment. Professional, organised, armed, and ready, which the Federation is not, whatever it has built.", "Our camps hold Deep Westmarch to the Stone Field. Hollowmere holds Westwatch. The Federation holds a wall and an opinion.", "Every soldier the same. Every shield the same. The Law in every pommel. That is not uniformity; that is certainty, worn.", "The map on that wall has Raria on most of it. The Federation's map has red string. One of us is right about what a map is for."])));
    }
    case "rrr_soldier": return chat(name, npcSays(name, KNOWS_RARIA(game) ? pick(game, ["Regiment. In step. Walk on the path; the Rangers prefer it.", "The Federation's cannon fired once. The Spine Watch has no tower. The Regiment has three more.", "The Law says carry, not draw. We carry. You will notice we never have to draw.", "Hollowmere asks where we came from. We came from here. Ask the stones."]) : pick(game, ["You have no writ. The checkpoint on the West Road writes writs. I am not the checkpoint, and I am counting the steps between us.", "The Law says carry, not draw. The checkpoint says writ, or halberd."])));
    case "raria_assessor": {
      if (!questDone(game, "wise_friends_law")) return chat(name, npcSays(name, "The Ledger of Names. Every citizen's comings, goings, prayers and purchases. Yours is a short page so far. It will grow."));
      if (stage(game, "cog_ledger") === 0) return fetchQuest(game, name, "cog_ledger", {
        offer: ["You are received, which means you are useful. Three sealed dispatches: for Chaplain Vell, Colonel Marsh and Sigilist Quell. Carry them. And a citizen: Tam Merrow, at the market, who has prayed four times this week instead of seven. Look into him, and report what you find.", "It is only paperwork. Everything is."],
        accept: "The dispatches, then Merrow, then me. Here is a page of the Ledger, to add to.", progress: "The chaplain, the colonel, the sigilist. Then Tam Merrow. Then the page, to me.",
        have: () => data(game, "lg_chaplain") >= 1 && data(game, "lg_colonel") >= 1 && data(game, "lg_sigilist") >= 1 && data(game, "lg_merrow") >= 1 && has(player, "citizens_ledger"), take: () => take(player, "citizens_ledger", 1),
        done: [data(game, "lg_merrow") === 2 ? "Nothing to find. I have written that down. I have also written down that you found nothing, which is a different entry." : "Reported. Thank you. He will not be at the market. The Law is kind: it only asks seven.", "You are in the Ledger as 'reliable'. The Colonel reads that column. Here are law sigils, for the edicts you will learn; the Office presses them."],
        reward: () => { give(player, "law_sigil", 20); addXp(game, "magic", 3000, { raw: true }); },
        onAccept: () => { give(player, "sealed_dispatch", 3); giveOrDrop(game, "citizens_ledger"); },
      });
      return fetchQuest(game, name, "cog_ledger", { offer: [""], accept: "", progress: "The chaplain, the colonel, the sigilist. Then Tam Merrow. Then the page, to me.",
        have: () => data(game, "lg_chaplain") >= 1 && data(game, "lg_colonel") >= 1 && data(game, "lg_sigilist") >= 1 && data(game, "lg_merrow") >= 1 && has(player, "citizens_ledger"), take: () => take(player, "citizens_ledger", 1),
        done: [data(game, "lg_merrow") === 2 ? "Nothing to find. I have written that down. I have also written down that you found nothing." : "Reported. He will not be at the market. The Law is kind: it only asks seven.", "You are in the Ledger as 'reliable'. Here are law sigils; the Office presses them."],
        reward: () => { give(player, "law_sigil", 20); addXp(game, "magic", 3000, { raw: true }); } });
    }
    case "raria_citizen_merrow": {
      if (stage(game, "cog_ledger") === 1 && !data(game, "lg_merrow")) return chat(name, npcSays(name, "...You're from the Office. I can tell; you're looking at my hands. Four times. I know. My daughter was ill, and the chapel is across the city, and the Law says seven, and I know.", "What will you tell the Assessor?"), [
        { label: "The truth. Four times.", then: () => chat(name, npcSays(name, "...Yes. That's the Law. I understand. I do."), undefined, () => { player.questData.lg_merrow = 1; message(game, "You'll report Tam Merrow. The Ledger will say 'reliable'.", "quest"); sound(game, "quest"); }) },
        { label: "That I found nothing.", then: () => chat(name, npcSays(name, "...Thank you. I won't say it twice; they notice twice. Here: it was my mother's. It isn't in any ledger. Nothing of hers is, any more."), undefined, () => { player.questData.lg_merrow = 2; player.questData.card_unwritten = 1; give(player, "crown_sigil", 2); message(game, "You'll tell the Assessor there was nothing to find. Tam Merrow gives you two crown sigils his mother kept, and a name that isn't written anywhere.", "quest"); sound(game, "quest"); }) },
      ]);
      return chat(name, npcSays(name, data(game, "lg_merrow") === 2 ? "Seven, this week. Thank you. Don't come back; they notice." : data(game, "lg_merrow") === 1 ? "..." : "Bread, one kind, one price. Seven prayers, one chapel. It's a good city. Everyone says."));
    }
    case "raria_chaplain": {
      if (stage(game, "cog_ledger") === 1 && has(player, "sealed_dispatch") && !data(game, "lg_chaplain")) { player.questData.lg_chaplain = 1; take(player, "sealed_dispatch", 1); return chat(name, npcSays(name, "From the Office? The week's attendances. Thank you. Four, Merrow... the Law is kind, it only asks seven."), undefined, () => { message(game, "The chaplain takes his dispatch.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, KNOWS_RARIA(game) ? pick(game, ["The Chapel of the Law. The Wise Friend's vestments, the pavise, the mace, the banners, and law sigils for the rites. The Law is read aloud daily; you may stay for it. It is long.", "The Old Friend's chapels say the Wise Friend is the Old Friend with a blindfold. We say the Old Friend is the Wise Friend with its eyes open, which is worse."]) : "The chapel receives registered names. The Office of Conduct registers them."), KNOWS_RARIA(game) ? [
        { label: "Show me.", then: () => { game.ui.shop = "raria_faith"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    }
    case "raria_sigilist": {
      if (stage(game, "cog_ledger") === 1 && has(player, "sealed_dispatch") && !data(game, "lg_sigilist")) { player.questData.lg_sigilist = 1; take(player, "sealed_dispatch", 1); return chat(name, npcSays(name, "The Office's sigil allocations. Thank you. Everything is counted, even the sigils; especially the sigils."), undefined, () => { message(game, "The sigilist takes her dispatch.", "quest"); sound(game, "quest"); }); }
      return chat(name, npcSays(name, KNOWS_RARIA(game) ? "Law sigils, pressed at the Law altar; dusk sigils, at the Dusk's; crown sigils, at the Crown's, under seal. The Rarian staff, and the frame to wear sigils between the shoulders. The rest of the Realm's sigils too; the Law uses what works." : "The Office of Sigils sells to registered names."), KNOWS_RARIA(game) ? [
        { label: "Show me.", then: () => { game.ui.shop = "raria_mage"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    }
    case "raria_armourer": return chat(name, npcSays(name, KNOWS_RARIA(game) ? "Regiment plate, to the regulation, and Rarian steel, blessed before issue: swords, the greatsword, spear and halberd, the dagger, the crossbow and the bow, and the Regiment's own banner for the back. Every piece the same as the last. That is the point." : "Regimental stores issue to the Ledger. You are not in it."), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "raria_armoury"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "raria_clothier": return chat(name, npcSays(name, KNOWS_RARIA(game) ? "The Sumptuary Office. Violet, silver at the edge: veil, tabard, skirts, slippers, mantle. Other colours are confiscated at the gate. You may keep yours; you are a visitor. For now." : "The Sumptuary Office dresses registered names."), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "raria_clothier"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "raria_provisioner": return chat(name, npcSays(name, KNOWS_RARIA(game) ? "Bread. One kind. One price. Also pots, buckets, rope, a knife, and the other things the Law permits a kitchen." : "The Provisioner serves the Ledger."), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "raria_general"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "raria_villager": return chat(name, npcSays(name, pick(game, ["Good day. The Law be kept. Excuse me.", "Seven prayers, one chapel, one kind of bread. It's a good city. Everyone says so, and everyone's right, and I have to go.", "Raria has always been here. Her Radiance says so. The stones say so. I was born here. I think.", "There's a Ranger behind that pillar. There's always a Ranger behind that pillar. It's a comfort.", "The Federation? A disease, Her Radiance says. My brother went to look. He hasn't come back. He writes. He sounds well. I don't read the letters twice.", "The Wise Friend closed its eyes so as never to see the Law broken. I don't break it. I don't think about it. Those are the same thing, the chaplain says."])));
    // ---------- The far west's towns ----------
    case "lawgate_governor": return chat(name, npcSays(name, pick(game, ["Lawgate. The eastern march. Beyond that wall is the Spine, and beyond the Spine is Hollowmere, who keep asking where we came from as though we owe them an answer.",
      "How far does Raria go? West to the sea. North to the Silent Peaks. South to BarkReach's wood, which pays its tithe in arguments. Eleven days by cart along the Crown Road, less by the Summons, which the Law teaches.",
      "Hollowmere sends scouts. I send them home with a writ and a map. They never believe the map.", "The Crown Road is safe. The Crown is safe. The Greyfields are the Regiment's concern, and the Federation's, and nobody's in particular."])), [
      { label: "Where did Raria come from?", then: () => chat(name, npcSays(name, "From Raria. Where else? My grandfather governed this march, and his. Hollowmere's maps are short a kingdom; that is a fault in the maps.", "...The oldest roll in my office has Lawgate on it and a blank where Hollowmere should be. I keep it in a drawer. I don't know why I keep it in a drawer.")) },
      { label: "Goodbye.", then: () => null }]);
    case "lawgate_innkeeper": case "raria_innkeeper": return chat(name, npcSays(name, KNOWS_RARIA(game) ? pick(game, ["One measure. One loaf. One bed, made at the hour. Welcome.", "Bread, cake, chicken, meat, milk, eggs. All inspected. All good.", "The Seventh Prayer is the last of the day. We close after it. Everyone does."]) : "The inn serves names in the Ledger. Register at the Office of Conduct in the capital, or the Governor will."), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "raria_inn"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "vesper_abbess": return chat(name, npcSays(name, pick(game, ["Vesperholm rings the last bell of the day for all Raria. When it rings, the Order keeps what the Law forbids to be seen. The wraiths in the wood are what was seen anyway.",
      "The Prior keeps the Law in the city. I keep it here, where it is quieter, and where the wood keeps things too.", "The Blind Shrine in the Silent Peaks is older than this abbey, older than the Law as we write it. We do not go there. The hermit does.",
      "Sigils, vestments, the Book and its scroll case: the abbey's reliquary serves the received."])), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "vesper_reliquary"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "ranger_warden": return chat(name, npcSays(name, pick(game, ["...", "You found the Hold. That was the test. You may leave now; that is the next one.", "We guard the royal family. All of it. Everywhere. That includes the places you are standing.", "Do not draw on a Ranger. It is not forbidden. It is simply never done twice."])));
    case "candlemere_reeve": {
      if (!KNOWS_RARIA(game) && stage(game, "candlemere_tithe") === 0) return chat(name, npcSays(name, "You're not in the Ledger. I can't take help from a name that isn't written; the Assessor would ask whose it was. The Office of Conduct in the capital, first."));
      return fetchQuest(game, name, "candlemere_tithe", {
        offer: ["The tithe is short. Three farms couldn't make it up after the frost, and the Assessor's clerk comes at the turn of the month, and the reeve answers for the tithe. That's me.", "Fifteen grain, five eggs, five cooked meat. You're not from Candlemere; nobody will ask whose farm it came from."],
        accept: "Fifteen grain, five eggs, five cooked meat. Before the clerk.", progress: "Fifteen grain, five eggs, five cooked meat. The clerk comes at the turn of the month.",
        have: () => count(player, "grain") >= 15 && count(player, "egg") >= 5 && count(player, "cooked_meat") >= 5, take: () => { take(player, "grain", 15); take(player, "egg", 5); take(player, "cooked_meat", 5); },
        done: ["Made up. The roll balances. The clerk will write 'Candlemere: reliable', and Candlemere will be.", "Take these: crown sigils from the tithe chest, and coin. The Ledger will have your name next to mine. I'm sorry about that. I'm grateful about the rest."],
        reward: () => { give(player, "crown_sigil", 10); give(player, "coins", 5000); addXp(game, "cooking", 3000, { raw: true }); },
      });
    }
    case "candlemere_trader": return chat(name, npcSays(name, KNOWS_RARIA(game) ? "One of everything the Law permits a kitchen: bread, pots, buckets, a knife. Fishing on the lake is permitted, with thanks." : "The stores serve the Ledger. You'll want the capital's Office of Conduct."), KNOWS_RARIA(game) ? [
      { label: "Show me.", then: () => { game.ui.shop = "raria_general"; return null; } }, { label: "Maybe later.", then: () => null }] : undefined);
    case "crownlands_villager": return chat(name, npcSays(name, pick(game, ["The Crownlands feed the capital. The capital feeds the Law. The Law feeds us, the chaplain says, though it's mostly bread.",
      "My family's farmed this field since before the Law was written down. The Law says that's not possible. I don't argue with the Law; I farm.", "Hollowmere? East, past Lawgate and the Spine. They say we appeared. We say they never looked.",
      "The Federation's people came through once with a device that milked the cows. The Regiment took the device. The cows miss it."])));
    case "greyford_warden": return chat(name, npcSays(name, pick(game, ["From my window: the Greyfields, Fort Ordinance to the east, the Federation's camp past it, and the dead between them who haven't stopped. Two years of that.",
      "The South Road crosses the Vesper here and goes on into BarkReach. The wood pays its tithe in arguments; the Regiment collects in patrols.", "The Federation fight like lunatics and build like saints. The Regiment fight like a clock. Neither of them is losing. That's the trouble.",
      "Fort Ordinance asks for a writ. The Federation asks three questions. The revenants ask nothing at all."])));
    case "antler_captain": {
      if (combat(game) < 85 && stage(game, "heartwood_elder") === 0) return chat(name, npcSays(name, "There's a path in the Heartwood I won't walk again. At the end of it is the oldest ironbark in the wood, and it walks. Come back when you could walk it with me (combat 85 or so)."));
      return fetchQuest(game, name, "heartwood_elder", {
        offer: ["There's a path in the Heartwood I won't walk again. At its end is the Ironbark Elder: the oldest tree in BarkReach, and it walks. Every lurker in the wood grew from its fallen bark.", "Bring it down and bring me its heartwood. I'll cut you a bow the Regiment would trade a captain for."],
        accept: "The deepest Heartwood, west, past the Hush. Fire bites it; nothing else much does.", progress: "The Elder, and its heartwood. West, past the Hush.",
        have: () => data(game, "he_elder") >= 1 && has(player, "heartwood"), take: () => take(player, "heartwood", 1),
        done: ["The Elder's heart. Grey as stone and warm as bread.", "Here: a war bow from it. The lurkers will thin now. I'll go and look at that path."],
        reward: () => { giveOrDrop(game, "ironbark_war_bow"); addXp(game, "ranged", 8000, { raw: true }); addXp(game, "woodcutting", 4000, { raw: true }); },
      });
    }
    case "barkholm_elder": return chat(name, npcSays(name, pick(game, ["Barkholm. The wood's own village. The Crown has asked for a tithe here twice. The wood answered both times: the first collector got lost for a month, the second got lost for good.",
      "Raria says it was always here. So does the wood. They don't mean the same thing.", "There's a statue in the Heartwood, sunk to the chest, blindfolded. My grandmother's grandmother left it flowers. It was old then.",
      "The Federation sends rangers through. Polite. Strange. They fixed our saw with a device and now it sings."])));
    case "peak_hermit": return chat(name, npcSays(name, pick(game, ["You climbed. Sit. The statue is blindfolded; look closer, under the cloth. The eyes are carved open.",
      "Raria says the Wise Friend closed its eyes so as never to see the Law broken. The mountain says it was carved with them open, and somebody came later with a blindfold.",
      "Hollowmere asks where Raria came from. Raria asks nothing at all. I ask who closed the eyes, and when, and what they were looking at.",
      "The watchers in the peaks walk when no one looks. They're carved like the statue. I think they're looking for whoever put the blindfold on."])));
    default: return null;
  }
}
const combat = (game: Game) => combatLevel(game.player);
