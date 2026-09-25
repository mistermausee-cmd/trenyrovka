import { BatteryMedium, BookOpen, Check, ChevronRight, Clock3, Dumbbell, Moon, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EXERCISES } from '../../shared/exercises';
import type { WorkoutSessionDetail, WorkoutSessionSummary } from '../../shared/types';
import { LoadingScreen } from '../components/LoadingScreen';
import { apiRequest } from '../lib/api';
import { useDialog } from '../hooks/useDialog';

const statusLabels = { completed: 'Завершена', in_progress: 'В процессе', abandoned: 'Остановлена' } as const;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
}

function formatStart(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function JournalPage() {
  const [workouts, setWorkouts] = useState<WorkoutSessionSummary[] | null>(null);
  const [selected, setSelected] = useState<WorkoutSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'completed'>('all');
  const [error, setError] = useState<string | null>(null);
  const detailDialogRef = useDialog<HTMLElement>(Boolean(selected), () => setSelected(null));

  useEffect(() => { void apiRequest<WorkoutSessionSummary[]>('/api/workouts?limit=100').then(setWorkouts).catch((reason) => setError(reason instanceof Error ? reason.message : 'Ошибка загрузки')); }, []);

  async function openWorkout(id: string) {
    setDetailLoading(true); setError(null);
    try { setSelected(await apiRequest<WorkoutSessionDetail>(`/api/workouts/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть тренировку'); }
    finally { setDetailLoading(false); }
  }

  if (!workouts) return error ? <section className="error-card"><h2>Журнал не загрузился</h2><p>{error}</p><button className="secondary-button" onClick={() => window.location.reload()} type="button"><RotateCcw size={17} /> Повторить</button></section> : <LoadingScreen label="Открываю журнал…" />;
  const visible = workouts.filter((item) => filter === 'all' || item.status === 'completed');

  return (
    <div className="standard-page journal-page">
      <header className="page-heading"><div><p className="eyebrow">Все подходы сохранены</p><h1>Журнал</h1><p>Фактические повторения, нагрузка, сон и самочувствие — без необходимости что-либо вспоминать.</p></div><span className="journal-total"><BookOpen /><strong>{workouts.length}</strong><small>записей</small></span></header>
      <div className="segmented"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} type="button">Все</button><button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')} type="button">Завершённые</button></div>
      {visible.length === 0 ? <section className="journal-empty"><span><Dumbbell size={28} /></span><h2>Первая запись появится после тренировки</h2><p>Начни с главного экрана — приложение само сохранит каждый подход.</p></section> : <div className="journal-list">{visible.map((workout) => <button className="journal-item" key={workout.id} onClick={() => void openWorkout(workout.id)} type="button"><span className={`journal-letter ${workout.status}`}>{workout.code}</span><div className="journal-copy"><div><strong>Тренировка {workout.code}</strong><span className={`status-label ${workout.status}`}>{statusLabels[workout.status]}</span></div><p>{formatDate(workout.scheduledDate)} · {formatStart(workout.startedAt)}</p><div><span><Check size={14} /> {workout.completedSets}/{workout.totalSets} подходов</span><span><Clock3 size={14} /> {workout.durationMinutes ?? '—'} мин</span>{workout.overallEffort && <span><BatteryMedium size={14} /> {workout.overallEffort}/10</span>}</div></div><ChevronRight className="journal-chevron" /></button>)}</div>}
      {error && <div className="inline-error">{error}</div>}
      {detailLoading && <div className="modal-backdrop"><LoadingScreen label="Открываю запись…" /></div>}
      {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)} role="presentation"><section aria-label={`Тренировка ${selected.code} от ${formatDate(selected.scheduledDate)}`} aria-modal="true" className="journal-detail" onMouseDown={(event) => event.stopPropagation()} ref={detailDialogRef} role="dialog" tabIndex={-1}><button aria-label="Закрыть запись" className="close-button" onClick={() => setSelected(null)} type="button"><X /></button><div className="detail-title"><span>{selected.code}</span><div><p className="eyebrow">{formatDate(selected.scheduledDate)} · неделя {selected.week}</p><h2>Тренировка {selected.code}</h2><small>{selected.completedSets} из {selected.totalSets} подходов · {selected.durationMinutes ?? '—'} минут</small></div></div><div className="detail-metrics"><span><Moon /> <small>Сон</small><strong>{selected.sleepHours ?? '—'} ч</strong></span><span><BatteryMedium /> <small>Сложность</small><strong>{selected.overallEffort ?? '—'}/10</strong></span><span className={(selected.pain ?? 0) >= 4 ? 'alert' : ''}><ShieldAlert /> <small>Боль</small><strong>{selected.pain ?? '—'}/10</strong></span></div><div className="detail-exercises">{selected.template.exercises.map((planned, index) => { const logs = selected.sets.filter((set) => set.exerciseIndex === index); return <article key={`${planned.exerciseId}-${index}`}><div><span>{index + 1}</span><div><strong>{EXERCISES[planned.exerciseId].title}</strong><small>Цель {planned.target.min}–{planned.target.max} · {selected.template.prescription.sets} подхода</small></div></div><div className="logged-sets">{Array.from({ length: selected.template.prescription.sets }, (_, setIndex) => { const log = logs.find((item) => item.setNumber === setIndex + 1); return <span className={log?.status ?? ''} key={setIndex}><small>{setIndex + 1}</small><strong>{log?.actualValue ?? '—'}</strong><em>{log?.loadKg ? `${log.loadKg} кг` : log?.rir != null ? `RIR ${log.rir}` : ''}</em></span>; })}</div></article>; })}</div>{(selected.preNotes || selected.postNotes) && <div className="session-notes">{selected.preNotes && <p><strong>До:</strong> {selected.preNotes}</p>}{selected.postNotes && <p><strong>После:</strong> {selected.postNotes}</p>}</div>}</section></div>}
    </div>
  );
}
