import { Languages } from "lucide-react";
import { LANGUAGES, currentLanguage, setLanguage } from "../i18n";

/** The interface language. Each language is named in itself, so it is never translated. */
export default function LanguagePicker({ className = "", compact = false }) {
  const lang = currentLanguage();
  return (
    <label className={`inline-flex items-center gap-1 ${className}`}>
      <Languages size={14} aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select translate="no" aria-label="Language" title={LANGUAGES.find((l) => l.code === lang)?.label} value={lang} onChange={(e) => setLanguage(e.target.value)}
        className="cursor-pointer border-0 bg-transparent py-0 pl-0 pr-7 text-sm text-inherit focus:ring-0">
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{compact ? l.code.toUpperCase() : l.label}</option>)}
      </select>
    </label>
  );
}
