import { CalendarDays, ChevronDown, Dumbbell, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EXERCISES } from '../../shared/exercises';
import { getWorkoutTemplate } from '../../shared/program';
import type { DashboardResponse } from '../../shared/types';
import { ExerciseGuide } from '../components/ExerciseGuide';
import { LoadingScreen } from '../components/LoadingScreen';
import { apiRequest } from '../lib/api';
import { useDialog } from '../hooks/useDialog';

export function PlanPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<keyof typeof EXERCISES | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exerciseDialogRef = useDialog<HTMLElement>(Boolean(selectedExercise), () => setSelectedExercise(null));

  const load = () => {
    setError(null);
    void apiRequest<DashboardResponse>('/api/dashboard').then(setDashboard).catch((reason) => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить программу'));
  };
  useEffect(load, []);
  if (!dashboard) return error ? <section className="error-card"><h2>Программа не загрузилась</h2><p>{error}</p><button className="secondary-button" onClick={load} type="button"><RotateCcw size={17} /> Повторить</button></section> : <LoadingScreen label="Собираю программу…" />;

  const week = dashboard.programDay.week ?? (dashboard.programDay.status === 'finished' ? 12 : 1);
  const templates = (['A', 'B'] as const).map((code) => getWorkoutTemplate(code, week, dashboard.settings.equipment));

  return (
    <div className="standard-page">
      <header className="page-heading"><div><p className="eyebrow">12 недель · A/B</p><h1>Твоя программа</h1><p>Три полнотелые тренировки в неделю. Пропуск не сбивает чередование — приложение всегда покажет следующую нужную.</p></div><span className="large-week"><small>сейчас</small><strong>{week}</strong><small>неделя</small></span></header>
      <section className="phase-strip"><span className={week <= 2 ? 'active' : ''}><b>01</b><small>Недели 1–2</small><strong>Техника</strong></span><span className={week >= 3 && week <= 8 ? 'active' : ''}><b>02</b><small>Недели 3–8</small><strong>Объём</strong></span><span className={week >= 9 ? 'active' : ''}><b>03</b><small>Недели 9–12</small><strong>Закрепление</strong></span></section>
      <div className="plan-grid">{templates.map((template) => <section className="plan-workout" key={template.code}><div className="plan-workout-head"><span>{template.code}</span><div><p>{template.title}</p><h2>{template.code === 'A' ? 'Опора и тяга' : 'Баланс и плечи'}</h2><small>{template.prescription.sets} подхода · RIR {template.prescription.rir.min}–{template.prescription.rir.max}</small></div></div><div className="plan-exercises">{template.exercises.map((item, index) => { const exercise = EXERCISES[item.exerciseId]; return <button key={item.exerciseId} onClick={() => setSelectedExercise(item.exerciseId)} type="button"><span>{index + 1}</span><div><strong>{exercise.title}</strong><small>{item.target.min}–{item.target.max} {item.target.measurement === 'seconds' ? 'секунд' : 'повторений'}{item.target.perSide ? ' / сторона' : ''}</small></div><ChevronDown size={17} /></button>; })}</div></section>)}</div>
      <section className="principles-grid"><article><Dumbbell /><strong>Двойная прогрессия</strong><p>Сначала дойди до верхней границы повторов во всех подходах, затем немного добавь нагрузку или усложни вариант.</p></article><article><ShieldCheck /><strong>Не до отказа</strong><p>Останавливайся с заданным запасом повторов. Качество движения важнее последнего неуверенного повторения.</p></article><article><CalendarDays /><strong>Восстановление</strong><p>Между силовыми оставляй минимум один день. В остальные дни подходит прогулка 30–45 минут.</p></article></section>
      <aside className="source-note"><Info size={18} /><p>План следует позиции ACSM 2026: регулярная прогрессивная работа всех крупных мышечных групп, достаточный недельный объём и высокая, но управляемая интенсивность. Домашние тренировки и резинки доказанно эффективны.</p><a href="https://doi.org/10.1249/mss.0000000000003897" rel="noreferrer" target="_blank">Открыть источник</a></aside>
      {selectedExercise && <div className="modal-backdrop" onMouseDown={() => setSelectedExercise(null)} role="presentation"><section aria-label={`Техника: ${EXERCISES[selectedExercise].title}`} aria-modal="true" className="exercise-sheet" onMouseDown={(event) => event.stopPropagation()} ref={exerciseDialogRef} role="dialog" tabIndex={-1}><button className="close-button" onClick={() => setSelectedExercise(null)} type="button">Закрыть</button><p className="eyebrow">Техника упражнения</p><h2>{EXERCISES[selectedExercise].title}</h2><p className="muted">{EXERCISES[selectedExercise].purpose}</p><ExerciseGuide exercise={EXERCISES[selectedExercise]} /></section></div>}
    </div>
  );
}
