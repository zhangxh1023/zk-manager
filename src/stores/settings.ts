import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { appDataApi } from '../api/appData';
import { i18n } from '../i18n';

export interface AppSettings {
  language: 'en' | 'zh';
  theme: 'light' | 'dark' | 'system';
  scale: number;
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    language: 'en',
    theme: 'system',
    scale: 1.0,
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

  // Apply scale to document
  const applyScale = () => {
    const root = document.documentElement;
    root.style.setProperty('--app-scale', String(settings.value.scale));
    document.body.style.transform = `scale(${settings.value.scale})`;
    document.body.style.transformOrigin = 'top left';
    // Adjust body width to prevent clipping
    const containerWidth = 100 / settings.value.scale;
    document.body.style.width = `${containerWidth}%`;
  };

  const load = async () => {
    try {
      const result = await appDataApi.loadSettings();
      for (const row of result) {
        if (row.key === 'language') settings.value.language = row.value as 'en' | 'zh';
        if (row.key === 'theme') settings.value.theme = row.value as 'light' | 'dark' | 'system';
        if (row.key === 'scale') {
          const parsed = parseFloat(row.value);
          // Ensure scale is valid (0.8 to 2.0), default to 1.0 if invalid
          settings.value.scale = (parsed >= 0.8 && parsed <= 2.0) ? parsed : 1.0;
        }
      }
      applyTheme();
      applyScale();
      i18n.global.locale.value = settings.value.language;
    } catch {
      // settings table might not exist yet
    }
  };

  const save = async () => {
    await appDataApi.saveSettings(settings.value);
  };

  // Watch for changes and apply immediately
  watch(() => settings.value.language, (newLang) => {
    i18n.global.locale.value = newLang;
  });

  watch(() => settings.value.theme, applyTheme);
  watch(() => settings.value.scale, applyScale);

  return { settings, load, save, applyTheme, applyScale };
});
