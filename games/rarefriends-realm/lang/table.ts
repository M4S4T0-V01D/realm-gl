// The parts of the Realm translated in one table, every language side by side: item names, the skill guides and recipe
// book, and the tips. One row per English text (a whole phrase, or a template with {placeholders}, where {n}, {n2}…
// stand for numbers only), then its translations in TABLE_LANGUAGES' order. See i18n.ts.
import { NAMES } from "./names.ts";
import { GUIDE } from "./guide.ts";
import { TIPS } from "./tips.ts";

export const TABLE_LANGUAGES = ["ja", "ko", "zh-CN", "zh-TW", "vi", "id", "th", "tr", "es", "pt-BR", "ru", "uk"] as const;
export type Row = readonly [ja: string, ko: string, zhCN: string, zhTW: string, vi: string, id: string, th: string, tr: string, es: string, ptBR: string, ru: string, uk: string];
export const TABLE: Readonly<Record<string, Row>> = { ...NAMES, ...GUIDE, ...TIPS };
