// The preview site's languages (see lang.ts), kept apart from the page code so the tests can read them.

/** The game's languages, by their own names (games/rarefriends-realm/i18n.ts; tests/preview-i18n.test.mjs keeps them the same). */
export const SITE_LANGUAGES = [
  { id: "en", name: "English" }, { id: "ja", name: "日本語" }, { id: "ko", name: "한국어" }, { id: "zh-CN", name: "简体中文" },
  { id: "zh-TW", name: "繁體中文" }, { id: "vi", name: "Tiếng Việt" }, { id: "id", name: "Bahasa Indonesia" }, { id: "th", name: "ไทย" },
  { id: "tr", name: "Türkçe" }, { id: "es", name: "Español" }, { id: "pt-BR", name: "Português (Brasil)" }, { id: "ru", name: "Русский" },
  { id: "uk", name: "Українська" },
] as const;
