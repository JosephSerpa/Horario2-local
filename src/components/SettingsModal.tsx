import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, Languages } from 'lucide-react';
import { useAppStore } from '../store';
import { useTranslation } from '../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme, language, setLanguage } = useAppStore();
  const t = useTranslation(language);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl z-50 overflow-hidden border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t.settings}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Theme Toggle */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                  {t.theme}
                </label>
                <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${theme === 'light' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                  >
                    {t.light}
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${theme === 'dark' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                  >
                    {t.dark}
                  </button>
                </div>
              </div>

              {/* Language Toggle */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <Languages size={16} />
                  {t.language}
                </label>
                <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                  <button
                    onClick={() => setLanguage('es')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${language === 'es' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                  >
                    Español
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${language === 'en' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                  >
                    English
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
