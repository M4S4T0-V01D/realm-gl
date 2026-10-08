/**
 * The preview site in the Realm's languages: a picker in every page's header (Auto follows the browser, as the game
 * does), and a translation laid over the page. Each language's dictionary is lang/<id>.json, built by
 * scripts/build-preview.mjs from site/preview/lang/<id>.ts (the site's own words) and the game's table (the skill guides,
 * the recipe book, item and track names), and fetched only when that language is chosen.
 *
 * The English stays the source. A block of text (a paragraph, a caption, a heading, a list item: an element holding
 * text and nothing but inline markup) is looked up whole, markup and all, so a sentence translates as a sentence; its
 * text alone when it has no markup. Alt text, titles, labels and placeholders are looked up too. Keys may be templates
 * with {placeholders} ("Picture {n} of {n2}"), {n}, {n2}… numbers only, any other a text that's translated in turn.
 * Whatever the pages' scripts write later (the video carousel, the galleries, the jukebox, the skill guides) is caught
 * as it's written and translated the same way, and the English kept, so switching back is instant.
 */

import { SITE_LANGUAGES } from "./languages.ts";

const STORE = "realm-site-language";

/** The language this browser prefers, of the ones there are (English if none), as the game picks it. */
function browserLanguage(): string {
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"];
  for (const raw of wanted) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("zh")) return /tw|hk|mo|hant/.test(tag) ? "zh-TW" : "zh-CN";
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("in")) return "id";
    const found = SITE_LANGUAGES.find(lang => lang.id.toLowerCase() === tag || lang.id === tag.split("-")[0]);
    if (found) return found.id;
  }
  return "en";
}
const known = (id: string | null) => !!id && SITE_LANGUAGES.some(lang => lang.id === id);
const readSetting = () => { try { const value = localStorage.getItem(STORE); return value && (value === "auto" || known(value)) ? value : "auto"; } catch { return "auto"; } };
const writeSetting = (value: string) => { try { localStorage.setItem(STORE, value); } catch { /* private window: this visit only */ } };
// ?lang=ja picks a language for a link (and the tests).
const asked = new URLSearchParams(location.search).get("lang");
let setting = asked && known(asked) ? asked : readSetting();
const languageOf = (value: string) => value === "auto" ? browserLanguage() : value;

// ---------- The dictionary ----------
type Template = { pattern: RegExp; names: string[]; to: string; literal: number };
let phrases = new Map<string, string>(), templates: Template[] = [], current = "en";
const NUMBER = /^n\d*$/;
const norm = (text: string) => text.replace(/\s+/g, " ").trim();
function load(dictionary: Record<string, string>) {
  phrases = new Map(); templates = [];
  for (const [from, to] of Object.entries(dictionary)) {
    if (!/\{\w+\}/.test(from)) { phrases.set(from, to); continue; }
    const names: string[] = [];
    const source = from.split(/(\{\w+\})/).map(part => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      names.push(m[1]);
      return NUMBER.test(m[1]) ? "([−-]?\\d[\\d,.]*)" : "(.+?)";
    }).join("");
    templates.push({ pattern: new RegExp(`^${source}$`, "s"), names, to, literal: from.replace(/\{\w+\}/g, "").length });
  }
  templates.sort((a, b) => b.literal - a.literal);
}
/** A text in the chosen language, or null if the dictionary doesn't know it. */
export function lookup(text: string, depth = 0): string | null {
  const key = norm(text);
  if (!key || current === "en") return null;
  const exact = phrases.get(key);
  if (exact !== undefined) return exact;
  if (depth > 3) return null;
  for (const { pattern, names, to } of templates) {
    const m = pattern.exec(key);
    if (!m) continue;
    let out = to;
    names.forEach((name, i) => { out = out.split(`{${name}}`).join(NUMBER.test(name) ? m[i + 1] : lookup(m[i + 1], depth + 1) ?? m[i + 1]); });
    return out;
  }
  return null;
}
/** For the pages' own scripts: a text in the language now shown (the English if it's not known). */
export const t = (text: string) => lookup(text) ?? text;

// ---------- Over the page ----------
/** Markup that stays inside a block of text. */
const INLINE = new Set(["B", "I", "EM", "STRONG", "A", "BR", "SMALL", "SPAN", "CODE", "SUP", "SUB", "ABBR"]);
const ATTRIBUTES = ["alt", "title", "aria-label", "placeholder"] as const;
const LETTER = /\p{L}/u;
type Seen = { en: string; html: boolean; shown: string };
const blocks = new WeakMap<Element, Seen>(), texts = new WeakMap<Text, Seen>(), attrs = new WeakMap<Element, Map<string, Seen>>();
let titleSeen: Seen | null = null;
const skip = (el: Element) => el.closest("script, style, svg, canvas, [data-no-translate]");
/** A block: holds text of its own, and nothing but inline markup. */
function isBlock(el: Element) {
  let text = false;
  for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && LETTER.test(node.textContent ?? "")) text = true;
  return text && [...el.querySelectorAll("*")].every(child => INLINE.has(child.tagName));
}
function block(el: Element) {
  const seen = blocks.get(el), html = seen ? seen.html : el.children.length > 0, now = html ? el.innerHTML : el.textContent ?? "";
  const en = seen && now === seen.shown ? seen.en : now;
  const isHtml = seen && now === seen.shown ? seen.html : html;
  const next = (current === "en" ? null : lookup(en)) ?? en;
  blocks.set(el, { en, html: isHtml, shown: next });
  if (next === now) return;
  if (isHtml) el.innerHTML = next; else el.textContent = next;
  // What was just written is the translation, as the browser now writes it back.
  blocks.get(el)!.shown = isHtml ? el.innerHTML : el.textContent ?? "";
}
function text(node: Text) {
  const seen = texts.get(node), now = node.data, en = seen && now === seen.shown ? seen.en : now;
  if (!LETTER.test(en)) return;
  const found = current === "en" ? null : lookup(en), next = found === null ? en : en.match(/^\s*/)![0] + found + en.match(/\s*$/)![0];
  texts.set(node, { en, html: false, shown: next });
  if (next !== now) node.data = next;
}
function attributes(el: Element) {
  for (const name of ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value === null || !LETTER.test(value)) continue;
    let saved = attrs.get(el);
    if (!saved) attrs.set(el, saved = new Map());
    const seen = saved.get(name), en = seen && value === seen.shown ? seen.en : value, next = (current === "en" ? null : lookup(en)) ?? en;
    saved.set(name, { en, html: false, shown: next });
    if (next !== value) el.setAttribute(name, next);
  }
}
function walk(el: Element) {
  if (skip(el)) return;
  attributes(el);
  if (isBlock(el)) { el.querySelectorAll("*").forEach(attributes); block(el); return; }
  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element);
    else if (node.nodeType === Node.TEXT_NODE) text(node as Text);
  }
}
function title() {
  const now = document.title, en = titleSeen && now === titleSeen.shown ? titleSeen.en : now, next = (current === "en" ? null : lookup(en)) ?? en;
  titleSeen = { en, html: false, shown: next };
  if (next !== now) document.title = next;
}
/** Everything a script changed: translated again from its block up (or its English kept, if it's the English now). */
const observer = new MutationObserver(records => {
  const again = new Set<Element>();
  for (const record of records) {
    const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target as Element : record.target.parentElement;
    if (!target) continue;
    if (record.type === "attributes") { if (!skip(target)) attributes(target); continue; }
    let up: Element | null = target, found: Element | null = null;
    while (up && up !== document.body) { if (blocks.has(up)) found = up; up = up.parentElement; }
    again.add(found ?? target);
  }
  for (const el of again) if (el.isConnected) walk(el);
});
function apply() {
  document.documentElement.lang = current;
  title();
  walk(document.body);
  observer.disconnect();
  if (current !== "en") observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
  document.documentElement.classList.remove("realm-translating");
  picker && (picker.value = setting, renderPicker());
}
const cache = new Map<string, Record<string, string>>();
async function choose(language: string) {
  let dictionary: Record<string, string> = {};
  if (language !== "en") {
    dictionary = cache.get(language) ?? await fetch(`lang/${language}.json`).then(response => response.ok ? response.json() : {}).catch(() => ({}));
    cache.set(language, dictionary);
  }
  current = language; load(dictionary);
  if (document.readyState === "loading") await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  apply();
}

// ---------- The picker ----------
let picker: HTMLSelectElement | null = null;
function renderPicker() {
  if (!picker) return;
  const auto = SITE_LANGUAGES.find(lang => lang.id === browserLanguage())!.name;
  picker.options[0].textContent = `${t("Auto")} (${auto})`;
}
function mountPicker() {
  const style = document.createElement("style");
  style.textContent = `.lang-pick { display: inline-flex; align-items: center; gap: 6px; flex: none; font: 13px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; color: #d6d3cc; }
.lang-pick select { font: inherit; color: #e8e5de; background: #1b1c21; color-scheme: dark; border: 1.5px solid #4a4b53; padding: 5px 8px; cursor: pointer; max-width: 46vw; }
.lang-pick select:hover { border-color: #f2e28f; } .lang-pick select:focus-visible { outline: 3px solid #f2e28f; outline-offset: 2px; }`;
  document.head.append(style);
  const label = document.createElement("label"), globe = document.createElement("span");
  label.className = "lang-pick"; label.dataset.noTranslate = "";
  globe.textContent = "🌐"; globe.setAttribute("aria-hidden", "true");
  picker = document.createElement("select");
  picker.setAttribute("aria-label", "Language · 言語 · 언어 · 语言");
  picker.append(new Option("Auto", "auto"), ...SITE_LANGUAGES.map(lang => new Option(lang.name, lang.id)));
  picker.value = setting; renderPicker();
  picker.addEventListener("change", () => {
    setting = picker!.value; writeSetting(setting);
    // A ?lang= link is a one-off: the choice made here is the one that sticks.
    if (asked) { const url = new URL(location.href); url.searchParams.delete("lang"); history.replaceState(null, "", url); }
    void choose(languageOf(setting));
  });
  label.append(globe, picker);
  // Beside the page's own links (index: the top bar; the guides and lore: the header).
  const bar = document.querySelector(".bar") ?? document.querySelector(".top .wrap");
  (bar ?? document.body).append(label);
}

// While a language other than English loads, the page waits a moment rather than flash English.
const first = languageOf(setting);
if (first !== "en") {
  document.documentElement.classList.add("realm-translating");
  const hide = document.createElement("style");
  hide.textContent = "html.realm-translating body { visibility: hidden; }";
  document.head.append(hide);
  setTimeout(() => document.documentElement.classList.remove("realm-translating"), 2500);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountPicker, { once: true }); else mountPicker();
void choose(first);
/** What's still in English on the page in the language shown (for tests/preview-browser.mjs, and finding new words to translate). */
function untranslated(): string[] {
  const out = new Set<string>(), english = (seen: Seen | undefined, now: string) => seen ? seen.en : now;
  const missing = (en: string) => { if (LETTER.test(en) && lookup(en) === null) out.add(norm(en)); };
  const visit = (el: Element) => {
    if (skip(el) || (el as HTMLElement).hidden) return;
    const each = (one: Element) => { for (const name of ATTRIBUTES) { const value = one.getAttribute(name); if (value !== null) missing(english(attrs.get(one)?.get(name), value)); } };
    each(el);
    if (isBlock(el) || blocks.has(el)) { el.querySelectorAll("*").forEach(each); const seen = blocks.get(el); missing(english(seen, seen?.html ?? el.children.length > 0 ? el.innerHTML : el.textContent ?? "")); return; }
    for (const node of el.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) visit(node as Element);
      else if (node.nodeType === Node.TEXT_NODE) missing(english(texts.get(node as Text), (node as Text).data));
    }
  };
  missing(titleSeen?.en ?? document.title);
  visit(document.body);
  return [...out];
}
Object.assign(window, { realmT: t, realmUntranslated: untranslated, realmLanguage: () => current });
