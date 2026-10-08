/**
 * The Realm in other languages. The interface is written in English; this lays a translation over it where it's shown:
 * every text and label (title, aria-label, placeholder) inside the game is looked up in the chosen language's
 * dictionary and swapped, and swapped again whenever the game changes it. The English is kept, so switching back (or
 * to another language) is instant. Players' own words (chat, names) are never touched.
 *
 * A dictionary maps English to the language: whole phrases ("Inventory"), and templates with {placeholders}
 * ("Empty slot {n}"), whose filled-in parts are translated too where they're known (a skill's name, a quest's).
 */
import { ja } from "./lang/ja.ts";
import { ko } from "./lang/ko.ts";
import { zhCN } from "./lang/zh-CN.ts";
import { zhTW } from "./lang/zh-TW.ts";
import { vi } from "./lang/vi.ts";
import { id } from "./lang/id.ts";
import { th } from "./lang/th.ts";
import { tr } from "./lang/tr.ts";
import { es } from "./lang/es.ts";
import { ptBR } from "./lang/pt-BR.ts";
import { ru } from "./lang/ru.ts";
import { uk } from "./lang/uk.ts";
import { TABLE, TABLE_LANGUAGES } from "./lang/table.ts";

export type Dictionary = Readonly<Record<string, string>>;
/** The languages, by their own names. */
export const LANGUAGES: readonly { id: string; name: string; dictionary: Dictionary | null }[] = [
  { id: "en", name: "English", dictionary: null },
  { id: "ja", name: "日本語", dictionary: ja },
  { id: "ko", name: "한국어", dictionary: ko },
  { id: "zh-CN", name: "简体中文", dictionary: zhCN },
  { id: "zh-TW", name: "繁體中文", dictionary: zhTW },
  { id: "vi", name: "Tiếng Việt", dictionary: vi },
  { id: "id", name: "Bahasa Indonesia", dictionary: id },
  { id: "th", name: "ไทย", dictionary: th },
  { id: "tr", name: "Türkçe", dictionary: tr },
  { id: "es", name: "Español", dictionary: es },
  { id: "pt-BR", name: "Português (Brasil)", dictionary: ptBR },
  { id: "ru", name: "Русский", dictionary: ru },
  { id: "uk", name: "Українська", dictionary: uk },
];

/** The language this browser prefers, of the ones there are (English if none). */
export function browserLanguage(): string {
  const wanted = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"];
  for (const raw of wanted) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("zh")) return /tw|hk|mo|hant/.test(tag) ? "zh-TW" : "zh-CN";
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("in")) return "id";
    const found = LANGUAGES.find(lang => lang.id === tag || lang.id === tag.split("-")[0]);
    if (found) return found.id;
  }
  return "en";
}
/** The language a setting means ("auto", or missing: the browser's). */
export const languageOf = (setting: string | undefined) => !setting || setting === "auto" ? browserLanguage() : LANGUAGES.some(lang => lang.id === setting) ? setting : "en";

// ---------- Translating ----------
type Template = { pattern: RegExp; names: string[]; to: string; strict: boolean; bare: boolean; literal: number };
type Compiled = { phrases: Map<string, string>; templates: Template[]; cache: Map<string, string> };
const compiled = new Map<string, Compiled>();
/** A placeholder named n, n2… stands for a number only ("{n} bars"), name, name2… for a name left as it is; any other ({item}) for any text. */
const NUMBER = /^n\d*$/, NAME = /^name\d*$/;
function compile(language: string): Compiled | null {
  const dictionary = LANGUAGES.find(lang => lang.id === language)?.dictionary;
  if (!dictionary) return null;
  let done = compiled.get(language);
  if (done) return done;
  done = { phrases: new Map(), templates: [], cache: new Map() };
  // The game's own interface first, then the table every language shares (items, the skill guides, recipes and tips: lang/table.ts).
  const column = TABLE_LANGUAGES.indexOf(language as typeof TABLE_LANGUAGES[number]);
  const entries = [...Object.entries(dictionary).map(([from, to]) => [from, to, false] as const),
    ...(column < 0 ? [] : Object.entries(TABLE).map(([from, row]) => [from, row[column], true] as const))];
  for (const [from, to, shared] of entries) {
    if (!/\{\w+\}/.test(from)) { if (!done.phrases.has(from)) done.phrases.set(from, to); continue; }
    const names: string[] = [];
    const source = from.split(/(\{\w+\})/).map(part => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      names.push(m[1]);
      // A number as the browser writes it: "25,000", "25.000", or "25 000" with a (narrow) no-break space.
      return NUMBER.test(m[1]) ? "([−-]?\\d(?:[\\d,.]|[\\u00a0\\u202f](?=\\d))*)" : "(.+?)";
    }).join("");
    const literal = from.replace(/\{\w+\}/g, "");
    // A template only applies when every part of it is known if it's nothing but placeholders ("{n} {thing}"), or it's
    // from the shared table (where a {name} is the one part left as it is: a player's, a Friend family's).
    const bare = !/\p{L}/u.test(literal);
    done.templates.push({ pattern: new RegExp(`^${source}$`), names, to, strict: shared || bare, bare, literal: literal.length });
  }
  // The most specific first: the most fixed text, then the fewest placeholders.
  done.templates.sort((a, b) => b.literal - a.literal || a.names.length - b.names.length);
  compiled.set(language, done);
  return done;
}
/** How a language joins a list ("+5 attack, +3 strength"). */
const LIST: Record<string, string> = { ja: "、", "zh-CN": "、", "zh-TW": "、" };
/** One piece of text in a language (unchanged if the dictionary doesn't know it). */
export function translate(text: string, language: string): string {
  const c = compile(language);
  if (!c) return text;
  const cached = c.cache.get(text);
  if (cached !== undefined) return cached;
  let out = translated(text, language, c, 0, null);
  // A line that starts with a capital (or a number) still does when a name moved to the front ("15 pewter arrows").
  if (/^\s*[\p{Lu}\d]/u.test(text)) out = out.replace(/^(\s*)(\p{Ll})/u, (_, space: string, first: string) => space + (language === "tr" ? first.toLocaleUpperCase("tr") : first.toUpperCase()));
  if (c.cache.size > 4000) c.cache.clear();
  c.cache.set(text, out);
  return out;
}
/** The parts of a text a language's dictionary doesn't know (for the tests: what's left in English). */
export function untranslated(text: string, language: string): string[] {
  const c = compile(language), missed: string[] = [];
  if (c) translated(text, language, c, 0, missed);
  return missed;
}
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** A sentence begun by a name that was filled in mid-line ("… viejos. daga de peltre ×6"): its first letter a capital. */
const sentences = (text: string, language: string) => text.replace(/([.!?…]\s+)(\p{Ll})/gu, (_, end: string, letter: string) => end + letter.toLocaleUpperCase(language));
function translated(text: string, language: string, c: Compiled, depth: number, missed: string[] | null): string {
  const lead = /^\s*/.exec(text)![0], tail = /\s*$/.exec(text)![0], core = text.trim();
  if (!core) return text;
  const exact = c.phrases.get(core);
  if (exact !== undefined) return lead + exact + tail;
  // A name in the middle of a sentence ("a knife on oak logs"): the dictionary has it capitalised.
  if (/^\p{Ll}/u.test(core)) {
    const upper = c.phrases.get(upperFirst(core));
    if (upper !== undefined) return lead + lowerFirst(upper) + tail;
  }
  // A plural made by adding "s" ("6 pewter daggers"): the thing's own name, where that is known.
  if (/[a-z]s$/.test(core)) {
    const one = core.endsWith("ies") ? `${core.slice(0, -3)}y` : core.slice(0, -1);
    const single = c.phrases.get(one) ?? (/^\p{Ll}/u.test(one) ? c.phrases.get(upperFirst(one)) : undefined);
    if (single !== undefined) return lead + (c.phrases.has(one) ? single : lowerFirst(single)) + tail;
  }
  // A name made a sentence ("Hollis Armoury." on a shop's sign): the name, and the full stop where the language uses one.
  if (/[^.]\.$/.test(core)) {
    const named = c.phrases.get(core.slice(0, -1));
    if (named !== undefined) return lead + named + (/[。.!?！？]$/.test(named) || language === "ja" || language === "th" || language.startsWith("zh") ? "" : ".") + tail;
  }
  // Numbers and symbols stay as they are.
  if (!/[A-Za-z]/.test(core)) return text;
  // A mark in front of a line ("✓ An egg", "• 3 pewter bars"): the line translated, the mark kept.
  const marked = /^([^\p{L}\p{N}\s"'“‘(\[{+#$@-]+)\s+(.+)$/su.exec(core);
  if (marked) return lead + marked[1] + " " + translated(marked[2], language, c, depth, missed) + tail;
  if (depth > 4) { missed?.push(core); return text; }
  // A part of the text: whatever of it can't be translated stays in English (and is noted).
  const part = (piece: string) => translated(piece, language, c, depth + 1, missed);
  // A list of things ("2 ore + 1 inkcoal", "+5 attack, +3 strength") when every one of them is known.
  const list = (sep: string, joined: string) => {
    if (!core.includes(sep)) return null;
    const trial: string[] = [], parts = core.split(sep).map(piece => translated(piece, language, c, depth + 1, trial));
    return trial.length ? null : lead + parts.join(joined) + tail;
  };
  const sum = list(" + ", " + ");
  if (sum !== null) return sum;
  for (const { pattern, names, to, strict, bare } of c.templates) {
    const m = pattern.exec(core);
    if (!m) continue;
    // ("{n} × {item}" is one thing, not the first of a list.)
    if (bare && m.slice(1).some(part => part.includes(", "))) continue;
    if (strict) {
      // All of it known, or this template isn't the one.
      const trial: string[] = [], parts = names.map((name, i) => NUMBER.test(name) || NAME.test(name) ? m[i + 1] : translated(m[i + 1], language, c, depth + 1, trial));
      if (trial.length) continue;
      let out = to;
      names.forEach((name, i) => { out = out.split(`{${name}}`).join(parts[i]); });
      return lead + sentences(out, language) + tail;
    }
    let out = to;
    names.forEach((name, i) => { out = out.split(`{${name}}`).join(NUMBER.test(name) ? m[i + 1] : part(m[i + 1])); });
    return lead + sentences(out, language) + tail;
  }
  // Sentences put together ("You eat the trout. It heals some health."): each one on its own, when every one is known.
  const said = core.split(/(?<=[.!?…])\s+(?=[\p{Lu}\d"'“‘(+])/u);
  if (said.length > 1) {
    const trial: string[] = [], parts = said.map(piece => translated(piece, language, c, depth + 1, trial));
    if (!trial.length) return lead + parts.join(language === "ja" || language.startsWith("zh") ? "" : " ") + tail;
  }
  // Pieces of a line ("12 XP · 3 bars · Anvil"), each translated on its own.
  if (core.includes(" · ")) return lead + core.split(" · ").map(piece => part(piece)).join(" · ") + tail;
  // An action and what it's done to ("Chop down Oak tree"): the action translated, the rest as far as it's known.
  const words = core.split(" ");
  if (words.length <= 8) for (let k = Math.min(3, words.length - 1); k >= 1; k--) {
    const verb = words.slice(0, k).join(" ");
    if (VERBS.has(verb) && c.phrases.has(verb)) return lead + c.phrases.get(verb)! + " " + part(words.slice(k).join(" ")) + tail;
  }
  const commas = list(", ", LIST[language] ?? ", ");
  if (commas !== null) return commas;
  missed?.push(core);
  return text;
}
/** The actions in the right-click menus (the first word or words of a hover line). */
const VERBS = new Set([
  "Walk here", "Examine", "Talk-to", "Attack", "Fight", "Take", "Use", "Drop", "Wield", "Wear", "Remove", "Eat", "Drink", "Bury", "Light", "Open", "Check", "Fill",
  "Empty", "Value", "Move to", "Teleport", "Message", "Wave", "Trade with", "Trade", "Follow", "Chop down", "Mine", "Net", "Bait", "Lure", "Cage", "Harpoon", "Pick",
  "Search", "Pickpocket", "Steal-from", "Enter", "Bank", "Smelt", "Smith", "Pray-at", "Climb-up", "Climb-down", "Go-through", "Jump-across", "Sail-to", "Unlock",
  "Cook-at", "Read", "Read-journal", "Spin", "Tan-hides", "Shear", "Rub", "Sip", "Cast", "Call", "Claim", "Clean", "Break", "Coat-weapon", "Set-down", "Look-at",
  "Stroke", "Ride", "Dismount", "Deposit", "Withdraw", "Buy", "Sell", "Invite-to-party", "Add-friend", "Remove-friend", "Ignore", "Follow-me", "Dismiss", "Send-home",
  "Craft-sigil", "Play", "Perform", "Guide", "Select", "Skip", "Start-at", "Deactivate",
]);
/** Short-hand for the game's own code: a phrase in the language now chosen. */
export const t = (text: string) => translate(text, current);

// ---------- Over the page ----------
const ATTRIBUTES = ["title", "aria-label", "placeholder"] as const;
let current = "en", root: HTMLElement | null = null, observer: MutationObserver | null = null;
/**
 * The English each text and attribute had, and what we last put there (so it can be translated again, into another
 * language, or put back; anything else found there is the game's own new English).
 */
type Seen = { en: string; shown: string };
const englishText = new WeakMap<Text, Seen>(), englishAttr = new WeakMap<Element, Map<string, Seen>>();
let writing = false;
/** Not translated: players' own words (chat lines of public and private talk, names typed in), and anything marked so. */
const untouchable = (el: Element | null) => !!el?.closest("[data-no-translate], .chat-public, .chat-private, input, textarea, [contenteditable]");
function textNode(node: Text) {
  if (untouchable(node.parentElement)) return;
  const known = englishText.get(node);
  // A text the game has changed since we last wrote it is new English.
  const english = known !== undefined && node.data === known.shown ? known.en : node.data;
  const next = current === "en" ? english : translate(english, current);
  englishText.set(node, { en: english, shown: next });
  if (node.data !== next) { writing = true; node.data = next; writing = false; }
}
function attributes(el: Element) {
  if (untouchable(el) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
  let saved = englishAttr.get(el);
  for (const name of ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    const known = saved?.get(name);
    const english = known !== undefined && value === known.shown ? known.en : value;
    if (!saved) { saved = new Map(); englishAttr.set(el, saved); }
    const next = current === "en" ? english : translate(english, current);
    saved.set(name, { en: english, shown: next });
    if (value !== next) { writing = true; el.setAttribute(name, next); writing = false; }
  }
}
function walk(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) { textNode(node as Text); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "CANVAS") return;
  attributes(el);
  for (let child = el.firstChild; child; child = child.nextSibling) walk(child);
}
/** Translate everything under `element` into `language`, and keep it translated as the game changes it. */
export function setLanguage(element: HTMLElement, language: string) {
  current = LANGUAGES.some(lang => lang.id === language) ? language : "en";
  if (typeof document !== "undefined") document.documentElement.lang = current;
  element.dataset.lang = current;
  // In English there's nothing to translate: put back any English a language left, then stop watching (it costs).
  if (current === "en") { walk(element); observer?.disconnect(); observer = null; root = null; return; }
  if (root !== element || !observer) {
    observer?.disconnect();
    root = element;
    observer = new MutationObserver(records => {
      if (writing) return;
      for (const record of records) {
        if (record.type === "characterData") textNode(record.target as Text);
        else if (record.type === "attributes") attributes(record.target as Element);
        else record.addedNodes.forEach(walk);
      }
    });
    observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
  }
  walk(element);
}
/** The language now shown. */
export const currentLanguage = () => current;
