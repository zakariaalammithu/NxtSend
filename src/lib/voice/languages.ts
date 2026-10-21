/**
 * Voice language catalogue — BCP-47 speech locales shared by the
 * speech-recognition (STT), speech-synthesis (TTS) and translation
 * pickers (P6 Stage C).
 *
 * One catalogue for all three features so a language chosen once
 * means the same thing everywhere: `code` is the BCP-47 tag passed to
 * SpeechRecognition.lang / SpeechSynthesisUtterance.lang and (its
 * primary subtag) to Whisper; `label` is the language's own name plus
 * the English name; `country` is the region the locale targets.
 *
 * Support honesty: presence in this list means the locale is a valid
 * BCP-47 choice — NOT that every browser ships a voice/recognizer for
 * it. The UI always pairs this picker with the live capability matrix
 * (./capabilities.ts) and the voices actually installed on the device.
 */

export interface VoiceLanguage {
  /** BCP-47 tag, e.g. "en-US", "bn-BD". */
  code: string;
  /** Human label: "English (United States)". */
  label: string;
  /** The language's name in its own script where practical. */
  nativeLabel: string;
  /** Country / region the locale targets. */
  country: string;
}

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: "en-US", label: "English (United States)", nativeLabel: "English", country: "United States" },
  { code: "en-GB", label: "English (United Kingdom)", nativeLabel: "English", country: "United Kingdom" },
  { code: "en-AU", label: "English (Australia)", nativeLabel: "English", country: "Australia" },
  { code: "en-CA", label: "English (Canada)", nativeLabel: "English", country: "Canada" },
  { code: "en-IN", label: "English (India)", nativeLabel: "English", country: "India" },
  { code: "es-ES", label: "Spanish (Spain)", nativeLabel: "Español", country: "Spain" },
  { code: "es-MX", label: "Spanish (Mexico)", nativeLabel: "Español", country: "Mexico" },
  { code: "es-AR", label: "Spanish (Argentina)", nativeLabel: "Español", country: "Argentina" },
  { code: "es-CO", label: "Spanish (Colombia)", nativeLabel: "Español", country: "Colombia" },
  { code: "fr-FR", label: "French (France)", nativeLabel: "Français", country: "France" },
  { code: "fr-CA", label: "French (Canada)", nativeLabel: "Français", country: "Canada" },
  { code: "de-DE", label: "German (Germany)", nativeLabel: "Deutsch", country: "Germany" },
  { code: "pt-BR", label: "Portuguese (Brazil)", nativeLabel: "Português", country: "Brazil" },
  { code: "pt-PT", label: "Portuguese (Portugal)", nativeLabel: "Português", country: "Portugal" },
  { code: "it-IT", label: "Italian (Italy)", nativeLabel: "Italiano", country: "Italy" },
  { code: "nl-NL", label: "Dutch (Netherlands)", nativeLabel: "Nederlands", country: "Netherlands" },
  { code: "pl-PL", label: "Polish (Poland)", nativeLabel: "Polski", country: "Poland" },
  { code: "sv-SE", label: "Swedish (Sweden)", nativeLabel: "Svenska", country: "Sweden" },
  { code: "da-DK", label: "Danish (Denmark)", nativeLabel: "Dansk", country: "Denmark" },
  { code: "nb-NO", label: "Norwegian (Norway)", nativeLabel: "Norsk", country: "Norway" },
  { code: "fi-FI", label: "Finnish (Finland)", nativeLabel: "Suomi", country: "Finland" },
  { code: "tr-TR", label: "Turkish (Türkiye)", nativeLabel: "Türkçe", country: "Türkiye" },
  { code: "ru-RU", label: "Russian (Russia)", nativeLabel: "Русский", country: "Russia" },
  { code: "uk-UA", label: "Ukrainian (Ukraine)", nativeLabel: "Українська", country: "Ukraine" },
  { code: "ar-SA", label: "Arabic (Saudi Arabia)", nativeLabel: "العربية", country: "Saudi Arabia" },
  { code: "ar-EG", label: "Arabic (Egypt)", nativeLabel: "العربية", country: "Egypt" },
  { code: "ar-AE", label: "Arabic (UAE)", nativeLabel: "العربية", country: "United Arab Emirates" },
  { code: "he-IL", label: "Hebrew (Israel)", nativeLabel: "עברית", country: "Israel" },
  { code: "hi-IN", label: "Hindi (India)", nativeLabel: "हिन्दी", country: "India" },
  { code: "bn-BD", label: "Bengali (Bangladesh)", nativeLabel: "বাংলা", country: "Bangladesh" },
  { code: "bn-IN", label: "Bengali (India)", nativeLabel: "বাংলা", country: "India" },
  { code: "ur-PK", label: "Urdu (Pakistan)", nativeLabel: "اردو", country: "Pakistan" },
  { code: "ta-IN", label: "Tamil (India)", nativeLabel: "தமிழ்", country: "India" },
  { code: "te-IN", label: "Telugu (India)", nativeLabel: "తెలుగు", country: "India" },
  { code: "mr-IN", label: "Marathi (India)", nativeLabel: "मराठी", country: "India" },
  { code: "gu-IN", label: "Gujarati (India)", nativeLabel: "ગુજરાતી", country: "India" },
  { code: "kn-IN", label: "Kannada (India)", nativeLabel: "ಕನ್ನಡ", country: "India" },
  { code: "ml-IN", label: "Malayalam (India)", nativeLabel: "മലയാളം", country: "India" },
  { code: "pa-IN", label: "Punjabi (India)", nativeLabel: "ਪੰਜਾਬੀ", country: "India" },
  { code: "ne-NP", label: "Nepali (Nepal)", nativeLabel: "नेपाली", country: "Nepal" },
  { code: "si-LK", label: "Sinhala (Sri Lanka)", nativeLabel: "සිංහල", country: "Sri Lanka" },
  { code: "zh-CN", label: "Chinese (China, Simplified)", nativeLabel: "中文（简体）", country: "China" },
  { code: "zh-TW", label: "Chinese (Taiwan, Traditional)", nativeLabel: "中文（繁體）", country: "Taiwan" },
  { code: "zh-HK", label: "Cantonese (Hong Kong)", nativeLabel: "廣東話", country: "Hong Kong" },
  { code: "ja-JP", label: "Japanese (Japan)", nativeLabel: "日本語", country: "Japan" },
  { code: "ko-KR", label: "Korean (South Korea)", nativeLabel: "한국어", country: "South Korea" },
  { code: "vi-VN", label: "Vietnamese (Vietnam)", nativeLabel: "Tiếng Việt", country: "Vietnam" },
  { code: "th-TH", label: "Thai (Thailand)", nativeLabel: "ไทย", country: "Thailand" },
  { code: "id-ID", label: "Indonesian (Indonesia)", nativeLabel: "Bahasa Indonesia", country: "Indonesia" },
  { code: "ms-MY", label: "Malay (Malaysia)", nativeLabel: "Bahasa Melayu", country: "Malaysia" },
  { code: "fil-PH", label: "Filipino (Philippines)", nativeLabel: "Filipino", country: "Philippines" },
  { code: "sw-KE", label: "Swahili (Kenya)", nativeLabel: "Kiswahili", country: "Kenya" },
  { code: "am-ET", label: "Amharic (Ethiopia)", nativeLabel: "አማርኛ", country: "Ethiopia" },
  { code: "ha-NG", label: "Hausa (Nigeria)", nativeLabel: "Hausa", country: "Nigeria" },
  { code: "yo-NG", label: "Yoruba (Nigeria)", nativeLabel: "Yorùbá", country: "Nigeria" },
  { code: "ig-NG", label: "Igbo (Nigeria)", nativeLabel: "Igbo", country: "Nigeria" },
  { code: "fa-IR", label: "Persian (Iran)", nativeLabel: "فارسی", country: "Iran" },
  { code: "el-GR", label: "Greek (Greece)", nativeLabel: "Ελληνικά", country: "Greece" },
  { code: "cs-CZ", label: "Czech (Czechia)", nativeLabel: "Čeština", country: "Czechia" },
  { code: "hu-HU", label: "Hungarian (Hungary)", nativeLabel: "Magyar", country: "Hungary" },
  { code: "ro-RO", label: "Romanian (Romania)", nativeLabel: "Română", country: "Romania" },
];

export const DEFAULT_VOICE_LANGUAGE = "en-US";

const BY_CODE = new Map(VOICE_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Finds a catalogue entry by BCP-47 code (case-insensitive). */
export function findVoiceLanguage(code: string | null | undefined): VoiceLanguage | null {
  if (!code || typeof code !== "string") return null;
  return BY_CODE.get(code.trim().toLowerCase()) ?? null;
}

/** True when the code is one of the catalogue locales. */
export function isVoiceLanguageCode(code: unknown): code is string {
  return typeof code === "string" && findVoiceLanguage(code) !== null;
}

/** Normalizes any stored value to a catalogue code (unknown → default). */
export function normalizeVoiceLanguage(code: unknown): string {
  const found = typeof code === "string" ? findVoiceLanguage(code) : null;
  return found ? found.code : DEFAULT_VOICE_LANGUAGE;
}

/** The ISO-639 primary subtag ("en" from "en-US") — Whisper's language param. */
export function voiceLanguagePrimarySubtag(code: string): string {
  return (findVoiceLanguage(code)?.code ?? DEFAULT_VOICE_LANGUAGE)
    .split("-")[0]
    .toLowerCase();
}

/** "English (United States)" — the name used in AI translation prompts. */
export function voiceLanguageName(code: string): string {
  return findVoiceLanguage(code)?.label ?? "English (United States)";
}
