import { useLocale } from './LocaleContext'

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="flex items-center gap-0.5 text-xs font-medium rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setLocale('ja')}
        className={`px-2.5 py-1.5 transition-colors ${
          locale === 'ja'
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={locale === 'ja'}
      >
        日本語
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`px-2.5 py-1.5 transition-colors ${
          locale === 'en'
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  )
}
