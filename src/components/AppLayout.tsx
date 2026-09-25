import { Activity, BookOpen, CalendarDays, ChartNoAxesCombined, Dumbbell, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

const navigation = [
  { to: '/', label: 'Сегодня', icon: Activity },
  { to: '/plan', label: 'План', icon: CalendarDays },
  { to: '/journal', label: 'Журнал', icon: BookOpen },
  { to: '/progress', label: 'Прогресс', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Ещё', icon: Settings },
];

function LiveOsloClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="timezone-pill"><span className="status-dot" />{new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(now)} · Осло</span>;
}

export function AppLayout() {
  const { state } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="Тренировка — на главную">
          <span className="brand-mark"><Dumbbell size={20} /></span><span>Тренировка</span>
        </NavLink>
        <LiveOsloClock timezone={state?.timezone ?? 'Europe/Oslo'} />
      </header>
      <main className="page-content"><Outlet /></main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} end={to === '/'} key={to} to={to}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
