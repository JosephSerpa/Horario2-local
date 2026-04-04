import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Settings, ShieldAlert, Calendar, MonitorPlay } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppStore } from '../store';
import { SettingsModal } from './SettingsModal';

export function Layout() {
  const { theme, isLoading } = useAppStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const isAdminPage = location.pathname === '/admin';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 font-sans">
      {/* Loading Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-200 dark:bg-zinc-800 z-50 overflow-hidden">
          <motion.div
            className="h-full bg-indigo-500"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: 'linear',
            }}
          />
        </div>
      )}

      <main className="pb-24">
        <Outlet />
      </main>

      {/* Floating Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
        <Link to="/ahora">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-4 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
            title="Vista de Pantalla (Ahora)"
          >
            <MonitorPlay size={24} />
          </motion.button>
        </Link>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsSettingsOpen(true)}
          className="p-4 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Settings size={24} />
        </motion.button>
        
        <Link to={isAdminPage ? '/' : '/admin'}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-4 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {isAdminPage ? <Calendar size={24} /> : <ShieldAlert size={24} />}
          </motion.button>
        </Link>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
