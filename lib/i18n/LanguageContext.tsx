'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { id, type TranslationDictionary } from './locales/id';
import { en } from './locales/en';

export type Language = 'id' | 'en';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  dictionary: TranslationDictionary;
}

const dictionaries: Record<Language, TranslationDictionary> = {
  id,
  en,
};

const STORAGE_KEY = 'sahamlens_lang';
const COOKIE_KEY = 'sahamlens_lang';

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: Record<string, any>, path: string): string | undefined {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('id');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved === 'id' || saved === 'en') {
        setLanguageState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // Ignore localStorage access errors (e.g. strict privacy mode)
    }
    setMounted(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.cookie = `${COOKIE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = lang;
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'id' ? 'en' : 'id');
  }, [language, setLanguage]);

  const dictionary = useMemo(() => dictionaries[language] || dictionaries.id, [language]);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      // Try active language first
      const activeDict = dictionaries[language] || dictionaries.id;
      let val = getNestedValue(activeDict as any, path);

      // Fallback to Indonesian if missing in English
      if (val === undefined && language !== 'id') {
        val = getNestedValue(dictionaries.id as any, path);
      }

      if (val === undefined) {
        return path; // Return path as fallback if not found anywhere
      }

      return interpolate(val, params);
    },
    [language]
  );

  const contextValue = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      dictionary,
    }),
    [language, setLanguage, toggleLanguage, t, dictionary]
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback for components rendered outside provider (e.g. tests or isolated stories)
    const fallbackT = (path: string, params?: Record<string, string | number>) => {
      const val = getNestedValue(dictionaries.id as any, path) || path;
      return interpolate(val, params);
    };
    return {
      language: 'id',
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: fallbackT,
      dictionary: dictionaries.id,
    };
  }
  return context;
}
