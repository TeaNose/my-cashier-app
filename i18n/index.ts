import { translations, type Language } from './translations';

// Default language is Bahasa Indonesia.
let currentLanguage: Language = 'id';

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

type DotPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? DotPaths<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

type TranslationKey = DotPaths<typeof translations.id>;

function resolve(obj: any, path: string): string {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = translations[currentLanguage] ?? translations.id;
  let value = resolve(dict, key) ?? resolve(translations.id, key) ?? key;
  if (typeof value !== 'string') return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

export function useTranslation() {
  return { t, language: currentLanguage };
}
