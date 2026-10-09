// The parts of the Realm translated in one table, every language side by side: item names, the skill guides and recipe
// book, the tips, what people say and the quests, the soundtrack's names, the achievements and panels, and the update log. One row per English text (a whole phrase,
// or a template with {placeholders}, where {n}, {n2}… stand for numbers only), then its translations in TABLE_LANGUAGES'
// order. See i18n.ts.
import { NAMES } from "./names.ts";
import { GUIDE } from "./guide.ts";
import { TIPS } from "./tips.ts";
import { DIALOGUE } from "./dialogue.ts";
import { TRACKS } from "./tracks.ts";
import { PANELS } from "./panels.ts";
import { UPDATE_LOG } from "./updates.ts";
import { PURSUANCE } from "./pursuance.ts";

export const TABLE_LANGUAGES = ["ja", "ko", "zh-CN", "zh-TW", "vi", "id", "th", "tr", "es", "pt-BR", "ru", "uk"] as const;
export type Row = readonly [ja: string, ko: string, zhCN: string, zhTW: string, vi: string, id: string, th: string, tr: string, es: string, ptBR: string, ru: string, uk: string];
// The soundtrack and the panels' words first, so a title or a name that is also something else keeps that row.
export const TABLE: Readonly<Record<string, Row>> = { ...TRACKS, ...PANELS, ...PURSUANCE, ...NAMES, ...GUIDE, ...TIPS, ...DIALOGUE, ...UPDATE_LOG };
