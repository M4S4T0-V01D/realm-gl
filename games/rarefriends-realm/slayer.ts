/**
 * Pursuance contracts (the skill was Slayer: "slayer" is still its id in saves and code). Warden Thistle hands out
 * contracts on the Realm's creatures, of three kinds: put so many of a creature down (each pays Pursuance XP, more for
 * the dangerous ones), read so many sets of its tracks, or study it until you know how it fights, how it guards itself
 * and what it's weak to. A finished contract pays Pursuance points to spend on her rewards and her research. Some
 * creatures can only be wounded by a pursuer of high enough level. State lives in the player's quest data, so it saves
 * with everything else (a contract from before there were kinds is a kill contract, as it was).
 */
import { MONSTERS, SLAYER_REWARDS, SLAYER_TASKS, type SlayerTask } from "./data.ts";
import { addXp, combatLevel, giveOrDrop, level, message, sound, type Game } from "./state.ts";
import { knows } from "./pursuance.ts";

const data = (game: Game, key: string) => game.player.questData[key] ?? 0;
/** Your current contract, or null. */
export function currentTask(game: Game): SlayerTask | null {
  const index = data(game, "slayer_task") - 1;
  return index >= 0 && data(game, "slayer_left") > 0 ? SLAYER_TASKS[index] ?? null : null;
}
/** What kind of contract it is: put them down, read their tracks, or study them. */
export type ContractKind = "kill" | "track" | "study";
export const contractKind = (game: Game): ContractKind => (["kill", "track", "study"] as const)[data(game, "slayer_kind")] ?? "kill";
export const slayerPoints = (game: Game) => data(game, "slayer_points");
export const slayerStreak = (game: Game) => data(game, "slayer_streak");
export function onTask(game: Game, monsterId: string) { return contractKind(game) === "kill" && !!currentTask(game)?.monsters.some(id => id === monsterId); }
/** The Warden's helm: +15% accuracy and damage against what you're contracted to put down. */
export function slayerBoost(game: Game, monsterId: string) { return game.player.equipment.head === "slayer_helm" && onTask(game, monsterId) ? 1.15 : 1; }
/** Can you wound this creature at your Pursuance level? A message if not. */
export function slayerProblem(game: Game, monsterId: string) {
  const needed = MONSTERS[monsterId]?.slayer ?? 0;
  return level(game, "slayer") < needed ? `You need a Pursuance level of ${needed} to know how to wound this creature.` : null;
}
/** The three things a study contract asks you to know. */
const STUDY = ["temper", "weakness", "defences"] as const;
export const studied = (game: Game, task: SlayerTask) => task.monsters.some(id => STUDY.every(fact => knows(game, id, fact)));
export function taskText(game: Game) {
  const task = currentTask(game), left = data(game, "slayer_left");
  if (!task) return "You don't have a Pursuance contract. The Warden in Friendhollow will give you one.";
  const kind = contractKind(game);
  if (kind === "track") return `Your contract is to read ${task.name} tracks: ${left} to go.`;
  if (kind === "study") return `Your contract is to learn how ${task.name} fight, how they guard themselves and what they're weak to.`;
  return `Your contract is to put down ${task.name}: ${left} to go.`;
}
/** Contracts you can be given: your combat level is high enough, and your Pursuance level for the creature. */
export function eligibleTasks(game: Game) {
  const combat = combatLevel(game.player), skill = level(game, "slayer");
  return SLAYER_TASKS.filter(task => combat >= task.min && skill >= ("slayer" in task ? task.slayer : 1)).sort((a, b) => a.min - b.min);
}
/**
 * A new contract. Mostly the old kind (put so many down); from Pursuance 10, one in four is to read their tracks
 * instead; from 20, one in five is to study a creature you don't yet know well. Returns false if you already have one.
 */
export function assignTask(game: Game, force = false): boolean {
  if (currentTask(game) && !force) return false;
  const options = eligibleTasks(game), pool = options.slice(-6), task = pool[Math.floor(game.rng() * pool.length)] ?? SLAYER_TASKS[0];
  const [low, high] = task.amount, longer = longTasks(game) ? 1.5 : 1, amount = Math.round((low + Math.floor(game.rng() * (high - low + 1))) * longer);
  const skill = level(game, "slayer"), roll = game.rng();
  const kind: ContractKind = skill >= 20 && roll < 0.2 && !studied(game, task) ? "study" : skill >= 10 && roll >= 0.2 && roll < 0.45 ? "track" : "kill";
  const count = kind === "kill" ? amount : kind === "track" ? Math.max(3, Math.round(amount / 5)) : 1;
  game.player.questData.slayer_task = SLAYER_TASKS.indexOf(task) + 1; game.player.questData.slayer_left = count; game.player.questData.slayer_kind = ["kill", "track", "study"].indexOf(kind);
  message(game, kind === "track" ? `Your new Pursuance contract: read ${count} sets of ${task.name} tracks.` : kind === "study" ? `Your new Pursuance contract: learn how ${task.name} fight, how they guard themselves and what they're weak to.` : `Your new Pursuance contract: put down ${count} ${task.name}.`, "quest");
  return true;
}
/** Longer contracts (a Warden reward you can switch on and off): half as long again, half as many points again. */
export const longTasks = (game: Game) => data(game, "slayer_long") > 0;
/** The Warden's bracers: +10% Pursuance XP for creatures you're contracted to put down. */
export const slayerXpBoost = (game: Game) => game.player.equipment.hands === "warden_bracers" ? 1.1 : 1;
/** Called for every kill: XP and progress when you're contracted to put them down. */
export function slayerKill(game: Game, monsterId: string) {
  if (!onTask(game, monsterId)) return;
  const def = MONSTERS[monsterId], player = game.player;
  addXp(game, "slayer", (def.slayerXp ?? def.hp) * slayerXpBoost(game));
  const left = data(game, "slayer_left") - 1;
  player.questData.slayer_left = left;
  if (left > 0) { if (left % 10 === 0 || left <= 3) message(game, `You're doing well: ${left} left on your contract.`); return; }
  finishTask(game);
}
/** You read a set of tracks: progress on a track contract (with XP as if you'd put one down, a little less). */
export function contractTrackRead(game: Game, monsterId: string) {
  const task = currentTask(game);
  if (contractKind(game) !== "track" || !task?.monsters.some(id => id === monsterId)) return;
  const def = MONSTERS[monsterId];
  addXp(game, "slayer", (def.slayerXp ?? def.hp) * 1.5 * slayerXpBoost(game));
  const left = data(game, "slayer_left") - 1;
  game.player.questData.slayer_left = left;
  if (left > 0) { message(game, `You're doing well: ${left} left on your contract.`); return; }
  finishTask(game);
}
/** You learnt something: a study contract is done when you know all three of its creature. */
export function contractLearnt(game: Game) {
  const task = currentTask(game);
  if (contractKind(game) === "study" && task && studied(game, task)) finishTask(game);
}
/** On a track contract, the creatures whose tracks you're after (the tracks round you lean their way). */
export function contractQuarry(game: Game): readonly string[] | null {
  const task = currentTask(game);
  return task && contractKind(game) === "track" ? task.monsters : null;
}
/** The contract is done: a point of streak, Pursuance points (five times over every tenth), and the Warden's regard. */
export function finishTask(game: Game) {
  const player = game.player, streak = slayerStreak(game) + 1, points = Math.round((streak % 10 === 0 ? 50 : 10) * (longTasks(game) ? 1.5 : 1));
  player.questData.slayer_left = 0; player.questData.slayer_streak = streak; player.questData.slayer_points = slayerPoints(game) + points;
  message(game, `You've completed your Pursuance contract (${streak} in a row) and earned ${points} Pursuance points. Return to the Warden for another.`, "quest");
  sound(game, "quest");
}
/** Simulated RF at the Warden's: buy the contract done (it still counts for the streak), or a different one. */
export function completeTaskForRf(game: Game) { if (!currentTask(game)) return false; finishTask(game); return true; }
export function rerollTaskForRf(game: Game) { if (!currentTask(game)) return false; game.player.questData.slayer_streak = Math.max(0, slayerStreak(game)); return assignTask(game, true); }
/** Spend Pursuance points. */
export function buySlayerReward(game: Game, id: string) {
  const reward = SLAYER_REWARDS.find(entry => entry.id === id);
  if (!reward) return false;
  if (id === "long" && longTasks(game)) { game.player.questData.slayer_long = 0; message(game, "Your contracts are back to their usual length."); return true; }
  if (slayerPoints(game) < reward.cost) { message(game, `You need ${reward.cost} Pursuance points for that. You have ${slayerPoints(game)}.`, "warn"); return false; }
  if (id === "skip") {
    if (!currentTask(game)) { message(game, "You don't have a contract to cancel.", "warn"); return false; }
    game.player.questData.slayer_points = slayerPoints(game) - reward.cost; assignTask(game, true);
    return true;
  }
  if (id === "long") {
    game.player.questData.slayer_points = slayerPoints(game) - reward.cost; game.player.questData.slayer_long = 1;
    message(game, "The Warden nods. Your contracts will run half as long again, and pay half as many points again."); sound(game, "coins");
    return true;
  }
  game.player.questData.slayer_points = slayerPoints(game) - reward.cost;
  giveOrDrop(game, id); message(game, `The Warden hands you: ${reward.name}.`); sound(game, "coins");
  return true;
}
export function addSlayerPoints(game: Game, points: number) { game.player.questData.slayer_points = slayerPoints(game) + points; }
