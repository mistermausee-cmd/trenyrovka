import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/AppLayout';
import { LoadingScreen } from './components/LoadingScreen';
import { ScrollToTop } from './components/ScrollToTop';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

const PlanPage = lazy(() => import('./pages/PlanPage').then((module) => ({ default: module.PlanPage })));
const JournalPage = lazy(() => import('./pages/JournalPage').then((module) => ({ default: module.JournalPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const WorkoutPage = lazy(() => import('./pages/WorkoutPage').then((module) => ({ default: module.WorkoutPage })));

export function App() {
  const { state, loading, error } = useAuth();
  if (loading) return <LoadingScreen label="Подключаюсь к твоему трекеру…" />;
  if (!state) return <main className="fatal-screen"><h1>Нет связи с сервером</h1><p>{error ?? 'Попробуй обновить страницу.'}</p><button className="primary-button" onClick={() => window.location.reload()} type="button">Обновить</button></main>;
  if (!state.authenticated) return <AuthPage setupRequired={state.setupRequired} />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="workout/:id" element={<WorkoutPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}
