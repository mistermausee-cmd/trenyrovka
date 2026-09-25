import { ArrowRight, BatteryMedium, CalendarCheck2, Check, Clock3, Dumbbell, Moon, Play, RotateCcw, Sparkles, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { EXERCISES } from '../../shared/exercises';
import type { DashboardResponse, WorkoutSessionDetail } from '../../shared/types';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, jsonBody } from '../lib/api';
import { useDialog } from '../hooks/useDialog';

function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));
}

function weekLabel(week: number | null): string {
  return week ? `Неделя ${week} из 12` : '12-недельная программа';
}

export function DashboardPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [readiness, setReadiness] = useState(3);
  const [sleepHours, setSleepHours] = useState('');
  const [notes, setNotes] = useState('');
  const [starting, setStarting] = useState(false);
  const checkinDialogRef = useDialog<HTMLFormElement>(startOpen, () => setStartOpen(false));

  useEffect(() => {
    let active = true;
    apiRequest<DashboardResponse>('/api/dashboard')
      .then((value) => { if (active) setDashboard(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить план'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const progress = useMemo(() => dashboard ? Math.min(100, (dashboard.weekCompletedCount / dashboard.weekTarget) * 100) : 0, [dashboard]);

  async function startWorkout(event: FormEvent) {
    event.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const workout = await apiRequest<WorkoutSessionDetail>('/api/workouts', {
        method: 'POST',
        body: jsonBody({ readiness, sleepHours: sleepHours ? Number(sleepHours) : null, notes }),
      }, state?.csrfToken);
      navigate(`/workout/${workout.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось начать тренировку');
      setStarting(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!dashboard) return <section className="error-card"><h2>Не удалось открыть план</h2><p>{error}</p><button className="secondary-button" onClick={() => window.location.reload()} type="button"><RotateCcw size={17} /> Повторить</button></section>;

  const template = dashboard.nextTemplate;
  const activeWorkout = dashboard.activeWorkout;
  const programDay = dashboard.programDay;
  const beforeStart = programDay.status === 'before-start';
  const maintenanceMode = programDay.status === 'finished';
  const programLabel = beforeStart ? `Старт ${formatLongDate(dashboard.settings.startDate)}` : maintenanceMode ? '12 недель завершены' : weekLabel(programDay.week);

  return (
    <div className="dashboard-stack">
      <section className="welcome-row">
        <div><p className="eyebrow">{formatLongDate(dashboard.localDate)}</p><h1>{dashboard.greeting}, {dashboard.settings.displayName}</h1><p>Сегодня важен не идеальный результат, а следующий качественный подход.</p></div>
        <div className="week-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><span><strong>{dashboard.weekCompletedCount}</strong><small>из {dashboard.weekTarget}</small></span></div>
      </section>

      <section className="today-grid">
        <article className="workout-hero">
          <div className="workout-hero-top"><span className="phase-badge">{programLabel}</span><span className={`day-state ${programDay.scheduled ? 'scheduled' : ''}`}><CalendarCheck2 size={15} />{beforeStart ? 'Программа ещё не началась' : maintenanceMode ? 'Поддерживающий режим' : programDay.scheduled ? 'По плану сегодня' : 'Можно выполнить сегодня'}</span></div>
          <div className="workout-title-row"><div><p>{maintenanceMode ? 'Следующая поддерживающая' : 'Следующая тренировка'}</p><h2>{template.title}</h2><span>{maintenanceMode ? 'Повторяем неделю 12 и сохраняем прогресс' : template.prescription.phaseTitle}</span></div><span className="workout-letter">{template.code}</span></div>
          <div className="workout-meta"><span><Dumbbell size={17} /> {template.exercises.length} упражнений</span><span><Clock3 size={17} /> ≈ 45–60 минут</span><span><BatteryMedium size={17} /> {template.prescription.sets} подхода</span></div>
          <div className="exercise-preview">{template.exercises.slice(0, 4).map((item, index) => <span key={item.exerciseId}><b>{String(index + 1).padStart(2, '0')}</b>{EXERCISES[item.exerciseId].title}</span>)}</div>
          <button className="primary-button hero-action" disabled={beforeStart && !activeWorkout} onClick={() => activeWorkout ? navigate(`/workout/${activeWorkout.id}`) : !beforeStart && setStartOpen(true)} type="button">
            {activeWorkout ? <><Play fill="currentColor" size={19} /> Продолжить тренировку</> : beforeStart ? <><Clock3 size={19} /> Старт {formatLongDate(dashboard.settings.startDate)}</> : <><Play fill="currentColor" size={19} /> Начать тренировку</>}<ArrowRight size={19} />
          </button>
        </article>

        <aside className="insight-column">
          <article className="metric-card"><div className="metric-icon lime"><TrendingUp size={20} /></div><p>Всего завершено</p><strong>{dashboard.completedCount}</strong><small>тренировок по программе</small></article>
          <article className="metric-card"><div className="metric-icon coral"><Sparkles size={20} /></div><p>Фокус недели</p><strong className="metric-text">{template.prescription.phaseTitle}</strong><small>{template.prescription.rir.min === template.prescription.rir.max ? template.prescription.rir.min : `${template.prescription.rir.min}–${template.prescription.rir.max}`} повтора в запасе</small></article>
        </aside>
      </section>

      <section className="section-card"><div className="section-heading"><div><p className="eyebrow">Сегодняшний маршрут</p><h2>Что тебя ждёт</h2></div><span>{template.exercises.length * template.prescription.sets} подходов</span></div><div className="route-list">{template.exercises.map((item, index) => { const exercise = EXERCISES[item.exerciseId]; return <article key={item.exerciseId}><span className="route-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{exercise.title}</strong><small>{item.target.min}–{item.target.max} {item.target.measurement === 'seconds' ? 'сек' : 'повт.'}{item.target.perSide ? ' на сторону' : ''}</small></div><span className="route-sets">× {template.prescription.sets}</span></article>; })}</div></section>

      <section className="coach-note"><span><Moon size={21} /></span><div><strong>Восстановление — часть плана</strong><p>Если готовность сегодня 1–2 из 5, уменьши нагрузку рюкзака и сохрани 3–4 повтора в запасе. Острая боль — сигнал остановиться.</p></div></section>

      {startOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setStartOpen(false)}>
          <form aria-label="Готовность перед тренировкой" aria-modal="true" className="checkin-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={startWorkout} ref={checkinDialogRef} role="dialog" tabIndex={-1}>
            <button className="close-button" aria-label="Закрыть" onClick={() => setStartOpen(false)} type="button"><X /></button>
            <p className="eyebrow">30 секунд перед стартом</p><h2>Как ты сегодня?</h2><p className="muted">Это поможет видеть связь между восстановлением и результатом.</p>
            <fieldset className="readiness-field"><legend>Готовность</legend><div>{[1,2,3,4,5].map((value) => <button aria-pressed={readiness === value} className={readiness === value ? 'selected' : ''} data-dialog-initial={readiness === value ? '' : undefined} key={value} onClick={() => setReadiness(value)} type="button"><span>{value}</span><small>{['тяжело','ниже нормы','нормально','хорошо','отлично'][value - 1]}</small></button>)}</div></fieldset>
            <label className="field"><span><Moon size={16} /> Сколько спал? <small>необязательно</small></span><input inputMode="decimal" max="24" min="0" onChange={(event) => setSleepHours(event.target.value)} placeholder="Например, 7.5" step="0.1" type="number" value={sleepHours} /></label>
            <label className="field"><span>Заметка перед тренировкой <small>необязательно</small></span><textarea maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Энергия, настроение, дискомфорт…" rows={3} value={notes} /></label>
            {error && <div className="inline-error">{error}</div>}
            <button className="primary-button wide" disabled={starting} type="submit">{starting ? 'Создаю тренировку…' : <><Check size={19} /> Всё готово</>}</button>
          </form>
        </div>
      )}
    </div>
  );
}
