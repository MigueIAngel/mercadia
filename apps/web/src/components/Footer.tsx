import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const t = await getTranslations('footer');
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-lg text-ink">Mercadia</span> · {t('tagline')}
        </p>
        <p className="flex gap-4">
          <a href="https://github.com/MigueIAngel/mercadia" className="hover:text-ink">
            {t('source')}
          </a>
          <span>{t('by')}</span>
        </p>
      </div>
      <p className="border-t border-stone-100 py-3 text-center text-xs text-stone-400">
        {t('demoNote')}
      </p>
    </footer>
  );
}
