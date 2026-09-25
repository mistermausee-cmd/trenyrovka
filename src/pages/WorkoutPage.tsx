import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell, ExternalLink, FastForward, Flag, Minus, Pause, Play, Plus, RotateCcw, ShieldAlert, SkipForward, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EXERCISES } from '../../shared/exercises';
import type { CompleteWorkoutInput, SaveSetInput, WorkoutSessionDetail } from '../../shared/types';
import { ExerciseGuide } from '../components/ExerciseGuide';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, jsonBody } from '../lib/api';
import { useDialog } from '../hooks/useDialog';

const warmupItems = ['1–2 минуты быстрой ходьбы на месте', '10 спокойных приседаний без веса', '10 наклонов таза с прямой спиной', '5 обратных выпадов на каждую ногу', '10 кругов плечами и 8 отжиманий лопатками'];

function findNext(detail: WorkoutSessionDetail): { exerciseIndex: number; setNumber: number } | null {
  for (let exerciseIndex = 0; exerciseIndex < detail.template.exercises.length; exerciseIndex += 1) {
    for (let setNumber = 1; setNumber <= detail.template.prescription.sets; setNumber += 1) {
      if (!detail.sets.some((item) => item.exerciseIndex === exerciseIndex && item.setNumber === setNumber)) return { exerciseIndex, setNumber };
    }
  }
  return null;
}

function RestOverlay({ seconds, onSkip }: { seconds: number; onSkip: () => void }) {
  return <div className="rest-overlay"><div className="rest-orbit" style={{ '--rest': `${Math.min(1, seconds / 120) * 360}deg` } as React.CSSProperties}><span><small>отдых</small><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></span></div><p>Дыши спокойно. Следующий подход — когда таймер закончится или ты будешь готов.</p><button className="secondary-button" onClick={onSkip} type="button"><FastForward size={18} /> Я готов продолжить</button></div>;
}

export function WorkoutPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WorkoutSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [warmupDone, setWarmupDone] = useState(() => sessionStorage.getItem(`warmup:${id}`) === 'done');
  const [actualValue, setActualValue] = useState(8);
  const [loadKg, setLoadKg] = useState('');
  const [rir, setRir] = useState(3);
  const [saving, setSaving] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [overallEffort, setOverallEffort] = useState(6);
  const [pain, setPain] = useState(0);
  const [postNotes, setPostNotes] = useState('');
  const restDialogRef = useDialog<HTMLDivElement>(Boolean(restEndsAt), () => setRestEndsAt(null));
  const finishDialogRef = useDialog<HTMLFormElement>(finishOpen, () => setFinishOpen(false));

  useEffect(() => {
    let active = true;
    apiRequest<WorkoutSessionDetail>(`/api/workouts/${id}`)
      .then((value) => { if (active) { setDetail(value); const next = findNext(value); if (next) setExerciseIndex(next.exerciseIndex); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить тренировку'); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!restEndsAt) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRestSeconds(left);
      if (left === 0) setRestEndsAt(null);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [restEndsAt]);

  const planned = detail?.template.exercises[exerciseIndex];
  const exercise = planned ? EXERCISES[planned.exerciseId] : null;
  const currentSetNumber = useMemo(() => {
    if (!detail) return 1;
    for (let number = 1; number <= detail.template.prescription.sets; number += 1) {
      if (!detail.sets.some((item) => item.exerciseIndex === exerciseIndex && item.setNumber === number)) return number;
    }
    return null;
  }, [detail, exerciseIndex]);
  const nextStep = detail ? findNext(detail) : null;
  const completedSets = detail?.sets.filter((item) => item.status === 'completed').length ?? 0;
  const totalSets = detail?.totalSets ?? 1;

  useEffect(() => {
    if (!planned || !detail) return;
    setActualValue(planned.target.min);
    setRir(detail.template.prescription.rir.max);
    setLoadKg('');
  }, [planned?.exerciseId, currentSetNumber, detail?.template.prescription.rir.max]);

  async function saveSet(status: 'completed' | 'skipped') {
    if (!detail || !planned || currentSetNumber == null) return;
    setSaving(true); setError(null);
    const input: SaveSetInput = { exerciseId: planned.exerciseId, exerciseIndex, setNumber: currentSetNumber, actualValue: status === 'completed' ? actualValue : null, loadKg: loadKg ? Number(loadKg) : null, rir: status === 'completed' ? rir : null, status, notes: '' };
    try {
      const updated = await apiRequest<WorkoutSessionDetail>(`/api/workouts/${detail.id}/sets`, { method: 'PUT', body: jsonBody(input) }, state?.csrfToken);
      setDetail(updated);
      const upcoming = findNext(updated);
      if (upcoming) {
        setExerciseIndex(upcoming.exerciseIndex);
        setRestEndsAt(Date.now() + updated.template.prescription.rest.minSeconds * 1000);
      } else setFinishOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить подход');
    } finally { setSaving(false); }
  }

  async function completeWorkout(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setSaving(true); setError(null);
    const input: CompleteWorkoutInput = { overallEffort, pain, notes: postNotes };
    try {
      await apiRequest(`/api/workouts/${detail.id}/complete`, { method: 'POST', body: jsonBody(input) }, state?.csrfToken);
      sessionStorage.removeItem(`warmup:${id}`);
      navigate('/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось завершить тренировку');
      setSaving(false);
    }
  }

  async function discardWorkout() {
    if (!detail || !window.confirm('Отменить эту тренировку? Записанные подходы останутся в журнале как незавершённые.')) return;
    setSaving(true); setError(null);
    try {
      await apiRequest(`/api/workouts/${detail.id}/abandon`, { method: 'POST' }, state?.csrfToken);
      sessionStorage.removeItem(`warmup:${id}`);
      navigate('/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить тренировку');
      setSaving(false);
    }
  }

  if (!detail && !error) return <LoadingScreen label="Открываю тренировку…" />;
  if (!detail) return <main className="workout-error"><ShieldAlert size={35} /><h1>Тренировка недоступна</h1><p>{error}</p><Link className="secondary-button" to="/"><ArrowLeft size={18} /> На главную</Link></main>;
  if (detail.status === 'completed') return <main className="workout-error"><Check size={35} /><h1>Тренировка завершена</h1><p>Все данные уже сохранены в журнале.</p><Link className="primary-button" to="/">На главную</Link></main>;

  if (!warmupDone) return <main className="warmup-screen"><div className="player-top"><Link to="/"><ArrowLeft /></Link><span>Подготовка · тренировка {detail.code}</span><span>≈ 5 минут</span></div><section className="warmup-card"><span className="warmup-icon"><Play size={28} fill="currentColor" /></span><p className="eyebrow">Перед первым подходом</p><h1>Разбудим тело</h1><p>Разминка должна согреть, но не утомить. Двигайся спокойно и без боли.</p><ol>{warmupItems.map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}</ol><button className="primary-button wide" onClick={() => { sessionStorage.setItem(`warmup:${id}`, 'done'); setWarmupDone(true); }} type="button">Разминка готова <ChevronRight size={19} /></button></section></main>;

  if (!exercise || !planned) return null;

  return (
    <main className="workout-player">
      <header className="player-top"><Link aria-label="Выйти на главную" to="/"><ArrowLeft /></Link><div><span>Тренировка {detail.code} · неделя {detail.week}</span><div className="player-progress"><i style={{ width: `${(completedSets / totalSets) * 100}%` }} /></div></div><button aria-label="Завершить или отменить тренировку" onClick={() => setFinishOpen(true)} type="button"><Flag size={18} /> <span>Завершить</span></button></header>
      <div className="exercise-pagination"><button aria-label="Предыдущее упражнение" disabled={exerciseIndex === 0} onClick={() => setExerciseIndex((value) => value - 1)} type="button"><ChevronLeft /></button><span>{exerciseIndex + 1} / {detail.template.exercises.length}</span><div>{detail.template.exercises.map((item, index) => <button aria-label={`Открыть ${EXERCISES[item.exerciseId].title}`} className={`${index === exerciseIndex ? 'active' : ''} ${detail.sets.filter((set) => set.exerciseIndex === index).length >= detail.template.prescription.sets ? 'done' : ''}`} key={item.exerciseId} onClick={() => setExerciseIndex(index)} type="button" />)}</div><button aria-label="Следующее упражнение" disabled={exerciseIndex === detail.template.exercises.length - 1} onClick={() => setExerciseIndex((value) => value + 1)} type="button"><ChevronRight /></button></div>
      <section className="exercise-stage">
        <div className="exercise-main"><p className="eyebrow">Упражнение {exerciseIndex + 1}</p><h1>{exercise.title}</h1><p className="exercise-purpose">{exercise.purpose}</p><ExerciseGuide compact exercise={exercise} /><details className="technique-details"><summary>Полная техника и ошибки <ChevronRight size={17} /></summary><ExerciseGuide exercise={exercise} /></details></div>
        <aside className="set-console">
          <div className="target-card"><span><Dumbbell size={19} /></span><div><small>Цель подхода</small><strong>{planned.target.min}–{planned.target.max} {planned.target.measurement === 'seconds' ? 'секунд' : 'повторений'}</strong><p>{planned.target.perSide ? 'На каждую сторону' : `Запас: ${detail.template.prescription.rir.min}–${detail.template.prescription.rir.max} повтора`}</p></div></div>
          <div className="set-dots">{Array.from({ length: detail.template.prescription.sets }, (_, index) => { const number = index + 1; const logged = detail.sets.find((item) => item.exerciseIndex === exerciseIndex && item.setNumber === number); return <button className={logged ? logged.status : currentSetNumber === number ? 'current' : ''} key={number} type="button"><span>{logged?.status === 'completed' ? <Check size={16} /> : number}</span><small>{logged?.actualValue ?? '—'}</small></button>; })}</div>
          {currentSetNumber == null ? <div className="exercise-complete"><Check size={27} /><strong>Упражнение готово</strong><p>Все подходы сохранены.</p>{nextStep && <button className="primary-button wide" onClick={() => setExerciseIndex(nextStep.exerciseIndex)} type="button">К следующему <ChevronRight size={18} /></button>}</div> : <div className="set-entry"><p>Подход {currentSetNumber} из {detail.template.prescription.sets}</p><div className="rep-stepper"><button aria-label="Уменьшить" onClick={() => setActualValue((value) => Math.max(1, value - 1))} type="button"><Minus /></button><div><input aria-label={planned.target.measurement === 'seconds' ? 'Секунды' : 'Повторения'} inputMode="numeric" min="1" onChange={(event) => setActualValue(Math.max(1, Number(event.target.value)))} type="number" value={actualValue} /><span>{planned.target.measurement === 'seconds' ? 'секунд' : planned.target.perSide ? 'на сторону' : 'повторений'}</span></div><button aria-label="Увеличить" onClick={() => setActualValue((value) => value + 1)} type="button"><Plus /></button></div><label className="mini-field"><span>Вес рюкзака / нагрузка <small>кг, необязательно</small></span><input inputMode="decimal" min="0" onChange={(event) => setLoadKg(event.target.value)} placeholder="0" step="0.1" type="number" value={loadKg} /></label><fieldset className="rir-control"><legend>Сколько повторов осталось бы?</legend><div>{[0,1,2,3,4,5].map((value) => <button aria-pressed={rir === value} className={rir === value ? 'selected' : ''} data-dialog-initial={false} key={value} onClick={() => setRir(value)} type="button">{value}{value === 5 ? '+' : ''}</button>)}</div><small>Цель сегодня: {detail.template.prescription.rir.min}–{detail.template.prescription.rir.max}. До полного отказа идти не нужно.</small></fieldset>{error && <div className="inline-error">{error}</div>}<button className="primary-button wide complete-set" disabled={saving} onClick={() => void saveSet('completed')} type="button">{saving ? 'Сохраняю…' : <><Check size={20} /> Подход выполнен</>}</button><button className="skip-button" disabled={saving} onClick={() => void saveSet('skipped')} type="button"><SkipForward size={16} /> Пропустить подход</button></div>}
        </aside>
      </section>

      {restEndsAt && <div aria-label="Отдых между подходами" aria-modal="true" className="rest-modal" ref={restDialogRef} role="dialog" tabIndex={-1}><button aria-label="Закрыть таймер" className="close-button" onClick={() => setRestEndsAt(null)} type="button"><X /></button><RestOverlay seconds={restSeconds} onSkip={() => setRestEndsAt(null)} /></div>}
      {finishOpen && <div className="modal-backdrop" onMouseDown={() => setFinishOpen(false)} role="presentation"><form aria-label="Завершение тренировки" aria-modal="true" className="finish-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={completeWorkout} ref={finishDialogRef} role="dialog" tabIndex={-1}><button aria-label="Закрыть окно" className="close-button" onClick={() => setFinishOpen(false)} type="button"><X /></button><span className="finish-icon"><Flag /></span><p className="eyebrow">Финишная отметка</p><h2>Как прошла тренировка?</h2><p className="muted">Сохранено {completedSets} из {totalSets} рабочих подходов.</p><fieldset className="scale-control"><legend>Общая сложность · {overallEffort}/10</legend><input max="10" min="1" onChange={(event) => setOverallEffort(Number(event.target.value))} type="range" value={overallEffort} /><div><span>легко</span><span>очень тяжело</span></div></fieldset><fieldset className="scale-control pain"><legend>Боль · {pain}/10</legend><input max="10" min="0" onChange={(event) => setPain(Number(event.target.value))} type="range" value={pain} /><div><span>нет</span><span>сильная</span></div></fieldset>{pain >= 4 && <div className="warning-note"><ShieldAlert size={19} /> Если это была острая или суставная боль, не повторяй болезненное движение до выяснения причины.</div>}<label className="field"><span>Что важно запомнить?</span><textarea maxLength={1000} onChange={(event) => setPostNotes(event.target.value)} placeholder="Что получилось, где было сложно…" rows={4} value={postNotes} /></label>{error && <div className="inline-error">{error}</div>}<button className="primary-button wide" disabled={saving || completedSets === 0} type="submit"><Check size={19} /> Сохранить тренировку</button>{completedSets === 0 && <small className="form-hint">Нужен хотя бы один выполненный подход, либо отмени тренировку ниже.</small>}<button className="danger-text-button" disabled={saving} onClick={() => void discardWorkout()} type="button"><X size={17} /> Отменить тренировку</button></form></div>}
    </main>
  );
}
