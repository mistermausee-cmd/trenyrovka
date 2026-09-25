import { Activity, CalendarCheck2, ChartNoAxesCombined, Check, Dumbbell, Plus, Ruler, Scale, Timer, Trash2, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { AnalyticsResponse, MeasurementRecord } from '../../shared/types';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, jsonBody } from '../lib/api';
import { useDialog } from '../hooks/useDialog';

function osloToday(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function shortDate(iso: string): string { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(`${iso}T12:00:00`)); }
function delta(first: number | null | undefined, last: number | null | undefined, suffix: string): string { if (first == null || last == null || first === last) return 'пока без динамики'; const value = Math.round((last - first) * 10) / 10; return `${value > 0 ? '+' : ''}${value} ${suffix} от первого замера`; }

interface MeasurementForm { measuredAt: string; weightKg: string; waistCm: string; chestCm: string; armCm: string; thighCm: string; sleepHours: string; notes: string; }
const emptyForm = (): MeasurementForm => ({ measuredAt: osloToday(), weightKg: '', waistCm: '', chestCm: '', armCm: '', thighCm: '', sleepHours: '', notes: '' });

export function ProgressPage() {
  const { state } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MeasurementForm>(emptyForm);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const measurementDialogRef = useDialog<HTMLFormElement>(formOpen, () => setFormOpen(false));

  const load = useCallback(async () => { setAnalytics(await apiRequest<AnalyticsResponse>('/api/analytics')); }, []);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить прогресс')); }, [load]);
  useEffect(() => { if (analytics?.exerciseProgress[0] && !selectedExercise) setSelectedExercise(analytics.exerciseProgress[0].exerciseId); }, [analytics, selectedExercise]);

  const measurements = analytics?.measurements ?? [];
  const first = measurements[0]; const last = measurements.at(-1);
  const chartData = useMemo(() => measurements.map((item) => ({ ...item, label: shortDate(item.measuredAt) })), [measurements]);
  const exercise = analytics?.exerciseProgress.find((item) => item.exerciseId === selectedExercise);

  async function saveMeasurement(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const numberOrNull = (value: string) => value === '' ? null : Number(value);
    try {
      await apiRequest<MeasurementRecord>('/api/measurements', { method: 'POST', body: jsonBody({ measuredAt: form.measuredAt, weightKg: numberOrNull(form.weightKg), waistCm: numberOrNull(form.waistCm), chestCm: numberOrNull(form.chestCm), armCm: numberOrNull(form.armCm), thighCm: numberOrNull(form.thighCm), sleepHours: numberOrNull(form.sleepHours), notes: form.notes }) }, state?.csrfToken);
      setForm(emptyForm()); setFormOpen(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить замер'); }
    finally { setBusy(false); }
  }

  async function removeMeasurement(id: string) {
    if (!window.confirm('Удалить этот замер?')) return;
    await apiRequest(`/api/measurements/${id}`, { method: 'DELETE' }, state?.csrfToken); await load();
  }

  if (!analytics) return error ? <section className="error-card"><h2>Прогресс не загрузился</h2><p>{error}</p><button className="secondary-button" onClick={() => { setError(null); void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Ошибка загрузки')); }} type="button">Повторить</button></section> : <LoadingScreen label="Считаю прогресс…" />;

  return <div className="standard-page progress-page">
    <header className="page-heading"><div><p className="eyebrow">Результат — это тренд</p><h1>Прогресс</h1><p>Сравнивай недели, а не отдельные дни. Сила растёт раньше, чем изменения становятся заметны в зеркале.</p></div><button className="primary-button" onClick={() => setFormOpen(true)} type="button"><Plus size={19} /> Добавить замер</button></header>
    <section className="stats-grid"><article><span className="stat-icon lime"><CalendarCheck2 /></span><small>Соблюдение плана</small><strong>{analytics.adherencePercent}%</strong><p>{analytics.completedWorkouts} тренировок завершено</p></article><article><span className="stat-icon blue"><Dumbbell /></span><small>Качественные подходы</small><strong>{analytics.completedSets}</strong><p>фактически записано</p></article><article><span className="stat-icon coral"><Timer /></span><small>Время под планом</small><strong>{analytics.totalTrainingMinutes}</strong><p>минут силовой работы</p></article><article><span className="stat-icon lime"><TrendingUp /></span><small>Серия</small><strong>{analytics.currentStreakWeeks}</strong><p>полных недель подряд</p></article></section>
    <div className="charts-grid"><section className="chart-card"><div className="chart-head"><div><span><Scale size={18} /></span><div><small>Масса тела</small><strong>{last?.weightKg ? `${last.weightKg} кг` : 'Нет данных'}</strong></div></div><em>{delta(first?.weightKg, last?.weightKg, 'кг')}</em></div>{chartData.some((item) => item.weightKg != null) ? <div className="chart-box"><ResponsiveContainer height="100%" width="100%"><LineChart data={chartData}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis axisLine={false} dataKey="label" fontSize={10} tickLine={false} /><YAxis axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} fontSize={10} tickLine={false} width={35} /><Tooltip contentStyle={{ background: '#1a241e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} /><Line dataKey="weightKg" dot={{ fill: '#c9f26a', strokeWidth: 0 }} name="Вес" stroke="#c9f26a" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div> : <ChartEmpty icon={Scale} text="Добавь вес после покупки весов" />}</section><section className="chart-card"><div className="chart-head"><div><span><Ruler size={18} /></span><div><small>Талия</small><strong>{last?.waistCm ? `${last.waistCm} см` : 'Нет данных'}</strong></div></div><em>{delta(first?.waistCm, last?.waistCm, 'см')}</em></div>{chartData.some((item) => item.waistCm != null) ? <div className="chart-box"><ResponsiveContainer height="100%" width="100%"><LineChart data={chartData}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis axisLine={false} dataKey="label" fontSize={10} tickLine={false} /><YAxis axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} fontSize={10} tickLine={false} width={35} /><Tooltip contentStyle={{ background: '#1a241e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} /><Line dataKey="waistCm" dot={{ fill: '#8ecdf2', strokeWidth: 0 }} name="Талия" stroke="#8ecdf2" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div> : <ChartEmpty icon={Ruler} text="Измерь талию утром на уровне пупка" />}</section></div>
    <section className="chart-card strength-chart"><div className="strength-head"><div><p className="eyebrow">Лучший результат дня</p><h2>Сила и контроль</h2></div>{analytics.exerciseProgress.length > 0 && <select onChange={(event) => setSelectedExercise(event.target.value)} value={selectedExercise}>{analytics.exerciseProgress.map((item) => <option key={item.exerciseId} value={item.exerciseId}>{item.title}</option>)}</select>}</div>{exercise ? <div className="chart-box large"><ResponsiveContainer height="100%" width="100%"><LineChart data={exercise.points.map((point) => ({ ...point, label: shortDate(point.date) }))}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis axisLine={false} dataKey="label" fontSize={10} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} fontSize={10} tickLine={false} width={35} /><Tooltip contentStyle={{ background: '#1a241e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} /><Line dataKey="bestValue" dot={{ fill: '#ff826f', strokeWidth: 0 }} name="Лучший подход" stroke="#ff826f" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div> : <ChartEmpty icon={Activity} text="График появится после первой завершённой тренировки" />}</section>
    <section className="measurements-card"><div className="section-heading"><div><p className="eyebrow">Контрольные точки</p><h2>История замеров</h2></div><span>Измеряй талию раз в неделю</span></div>{measurements.length === 0 ? <p className="muted">Пока нет замеров. Вес можно добавить позже — начни с талии.</p> : <div className="measurement-table">{[...measurements].reverse().map((item) => <div key={item.id}><strong>{shortDate(item.measuredAt)}</strong><span><small>Вес</small>{item.weightKg ?? '—'}{item.weightKg && ' кг'}</span><span><small>Талия</small>{item.waistCm ?? '—'}{item.waistCm && ' см'}</span><span><small>Грудь</small>{item.chestCm ?? '—'}{item.chestCm && ' см'}</span><button aria-label="Удалить замер" onClick={() => void removeMeasurement(item.id)} type="button"><Trash2 size={16} /></button></div>)}</div>}</section>
    {error && <div className="inline-error">{error}</div>}
    {formOpen && <div className="modal-backdrop" onMouseDown={() => setFormOpen(false)} role="presentation"><form aria-label="Добавление замера" aria-modal="true" className="measurement-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveMeasurement} ref={measurementDialogRef} role="dialog" tabIndex={-1}><button aria-label="Закрыть окно" className="close-button" onClick={() => setFormOpen(false)} type="button"><X /></button><p className="eyebrow">Новая контрольная точка</p><h2>Добавить замер</h2><p className="muted">Утром, после туалета и до завтрака. Не обязательно заполнять всё.</p><label className="field"><span>Дата</span><input data-dialog-initial onChange={(event) => setForm((current) => ({ ...current, measuredAt: event.target.value }))} required type="date" value={form.measuredAt} /></label><div className="measurement-fields"><MeasureInput label="Вес" suffix="кг" value={form.weightKg} onChange={(value) => setForm((current) => ({ ...current, weightKg: value }))} /><MeasureInput label="Талия" suffix="см" value={form.waistCm} onChange={(value) => setForm((current) => ({ ...current, waistCm: value }))} /><MeasureInput label="Грудь" suffix="см" value={form.chestCm} onChange={(value) => setForm((current) => ({ ...current, chestCm: value }))} /><MeasureInput label="Рука" suffix="см" value={form.armCm} onChange={(value) => setForm((current) => ({ ...current, armCm: value }))} /><MeasureInput label="Бедро" suffix="см" value={form.thighCm} onChange={(value) => setForm((current) => ({ ...current, thighCm: value }))} /><MeasureInput label="Сон" suffix="ч" value={form.sleepHours} onChange={(value) => setForm((current) => ({ ...current, sleepHours: value }))} /></div><label className="field"><span>Заметка</span><textarea maxLength={500} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Условия измерения, самочувствие…" rows={3} value={form.notes} /></label>{error && <div className="inline-error">{error}</div>}<button className="primary-button wide" disabled={busy} type="submit"><Check size={18} /> {busy ? 'Сохраняю…' : 'Сохранить замер'}</button></form></div>}
  </div>;
}

function ChartEmpty({ icon: Icon, text }: { icon: typeof Scale; text: string }) { return <div className="chart-empty"><Icon /><p>{text}</p></div>; }
function MeasureInput({ label, suffix, value, onChange }: { label: string; suffix: string; value: string; onChange: (value: string) => void }) { return <label className="measure-input"><span>{label}</span><div><input inputMode="decimal" min="0" onChange={(event) => onChange(event.target.value)} placeholder="—" step="0.1" type="number" value={value} /><small>{suffix}</small></div></label>; }
