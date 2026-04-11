import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getDb } from '../db/db';
import { i18n } from '../i18n';

export interface AppSettings {
  language: 'en' | 'zh';
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    language: 'en',
    theme: 'system',
    fontSize: 14,
  });

  // Apply theme to document
  const applyTheme = () => {
    const root = document.documentElement;
    if (settings.value.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', settings.value.theme === 'dark');
    }
  };

  // Apply font size to document
  const applyFontSize = () => {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', `${settings.value.fontSize}px`);
  };

  const load = async () => {
    try {
      const db = await getDb();
      const result = await db.select<{ key: string; value: string }[]>('SELECT * FROM settings');
      for (const row of result) {
        if (row.key === 'language') settings.value.language = row.value as 'en' | 'zh';
        if (row.key === 'theme') settings.value.theme = row.value as 'light' | 'dark' | 'system';
        if (row.key === 'fontSize') settings.value.fontSize = parseInt(row.value, 10);
      }
      applyTheme();
      applyFontSize();
      i18n.global.locale.value = settings.value.language;
    } catch (e) {
      // settings table might not exist yet
    }
  };

  const save = async () => {
    const db = await getDb();
    await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['language', settings.value.language]);
    await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['theme', settings.value.theme]);
    await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['fontSize', String(settings.value.fontSize)]);
  };

  // Watch for changes and apply immediately
  watch(() => settings.value.language, (newLang) => {
    i18n.global.locale.value = newLang;
  });

  watch(() => settings.value.theme, applyTheme);
  watch(() => settings.value.fontSize, applyFontSize);

  return { settings, load, save, applyTheme, applyFontSize };
});