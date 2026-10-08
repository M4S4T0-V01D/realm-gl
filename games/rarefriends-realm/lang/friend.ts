// Everything your Friend says (friendlines.ts and the memories in friend.ts), in every language, by family. friend.ts
// looks the line up before the names go in: {name} is a creature or a place, {skill} a skill, {region} where you are
// (all translated where the game knows them), {friend} a player's Friend's name and {n} a number (left as they are).
// Columns as in table.ts.
import type { Row } from "./table.ts";
import { SKELETON, MASK, FAMILY } from "./friend1.ts";
import { CELLULAR, ASYMMETRY, HOVERER } from "./friend2.ts";
import { COLOSSUS, SPARKLING, HOLLOW } from "./friend3.ts";
import { PLAIN, SKILLS, CHATTER } from "./friend4.ts";

export const FRIEND: Readonly<Record<string, Row>> = { ...PLAIN, ...SKILLS, ...CHATTER, ...SKELETON, ...MASK, ...FAMILY, ...CELLULAR, ...ASYMMETRY, ...HOVERER, ...COLOSSUS, ...SPARKLING, ...HOLLOW };
