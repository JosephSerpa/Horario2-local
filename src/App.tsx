/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SchedulePage } from './pages/SchedulePage';
import { AdminPage } from './pages/AdminPage';
import { NowPage } from './pages/NowPage';
import { RecordsPage } from './pages/RecordsPage';
import { useAppStore } from './store';

export default function App() {
  const { loadFromCloud } = useAppStore();

  useEffect(() => {
    loadFromCloud();
  }, [loadFromCloud]);

  return (
    <BrowserRouter>
      <div className="fixed top-2 right-4 z-[9999] pointer-events-none opacity-40 text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 select-none tracking-wide">
        Desarrollado y publicado por: Joseph Jair Serpa Pillaca
      </div>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<SchedulePage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="registros" element={<RecordsPage />} />
        </Route>
        <Route path="/ahora" element={<NowPage />} />
      </Routes>
    </BrowserRouter>
  );
}
