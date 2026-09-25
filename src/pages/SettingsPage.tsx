import { Check, CloudDownload, DatabaseBackup, Download, KeyRound, LogOut, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { UserSettings } from '../../shared/types';
import { areTrainingDaysSpaced } from '../../shared/program';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, jsonBody } from '../lib/api';

interface BackupInfo { fileName: string; sizeBytes: number; createdAt: string; }
const weekDays = [{ value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' }, { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 0, label: 'Вс' }];

export function SettingsPage() {
  const { state, refresh, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => { const [nextSettings, nextBackups] = await Promise.all([apiRequest<UserSettings>('/api/settings'), apiRequest<BackupInfo[]>('/api/backups')]); setSettings(nextSettings); setBackups(nextBackups); }, []);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки')); }, [load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (!settings) return; setBusy(true); setError(null); setMessage(null);
    try { const updated = await apiRequest<UserSettings>('/api/settings', { method: 'PUT', body: jsonBody(settings) }, state?.csrfToken); setSettings(updated); setMessage('Настройки сохранены'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки'); }
    finally { setBusy(false); }
  }

  function toggleDay(day: number) {
    if (!settings) return;
    const exists = settings.trainingDays.includes(day);
    if (exists && settings.trainingDays.length <= 1) { setError('Оставь хотя бы один выбранный день'); return; }
    if (!exists && settings.trainingDays.length >= 3) { setError('Сначала убери один из выбранных дней'); return; }
    setSettings({ ...settings, trainingDays: exists ? settings.trainingDays.filter((item) => item !== day) : [...settings.trainingDays, day] }); setError(null);
  }

  function setBands(enabled: boolean) {
    if (!settings) return;
    const equipment: UserSettings['equipment'] = enabled ? ['long-resistance-band', 'secure-high-anchor'] : [];
    setSettings({ ...settings, equipment });
  }

  async function createBackupNow() {
    setBusy(true); setError(null); setMessage(null);
    try { const backup = await apiRequest<BackupInfo>('/api/backups', { method: 'POST' }, state?.csrfToken); setBackups((current) => [backup, ...current]); setMessage(`Резервная копия ${backup.fileName} создана`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось создать резервную копию'); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await apiRequest('/api/settings/password', { method: 'PUT', body: jsonBody({ currentPassword, newPassword }) }, state?.csrfToken); setCurrentPassword(''); setNewPassword(''); await refresh(); setMessage('Пароль изменён, остальные сессии завершены'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось изменить пароль'); }
    finally { setBusy(false); }
  }

  if (!settings) return error ? <section className="error-card"><h2>Настройки не загрузились</h2><p>{error}</p><button className="secondary-button" onClick={() => { setError(null); void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Ошибка загрузки')); }} type="button">Повторить</button></section> : <LoadingScreen label="Загружаю настройки…" />;
  const hasBands = settings.equipment.includes('long-resistance-band');
  const daysAreValid = areTrainingDaysSpaced(settings.trainingDays);

  return <div className="standard-page settings-page"><header className="page-heading"><div><p className="eyebrow">Твой план · твои данные</p><h1>Настройки</h1><p>Изменения применяются к следующим тренировкам. Уже сохранённые записи останутся неизменными.</p></div></header>
    {(message || error) && <div className={error ? 'inline-error' : 'success-note'}>{error ?? message}</div>}
    <form className="settings-card" onSubmit={saveSettings}><div className="settings-title"><span><SlidersHorizontal /></span><div><h2>Программа</h2><p>Расписание, старт и доступное оборудование</p></div></div><div className="settings-fields"><label className="field"><span>Имя в приветствии</span><input maxLength={40} onChange={(event) => setSettings({ ...settings, displayName: event.target.value })} required value={settings.displayName} /></label><label className="field"><span>Дата начала 12 недель</span><input onChange={(event) => setSettings({ ...settings, startDate: event.target.value })} required type="date" value={settings.startDate} /></label><div className="field"><span>Три тренировочных дня</span><div className="weekday-picker">{weekDays.map((day) => <button aria-pressed={settings.trainingDays.includes(day.value)} className={settings.trainingDays.includes(day.value) ? 'selected' : ''} key={day.value} onClick={() => toggleDay(day.value)} type="button">{day.label}</button>)}</div>{settings.trainingDays.length === 3 && !daysAreValid && <small className="schedule-warning">Оставь минимум один день отдыха между силовыми.</small>}</div><label className="equipment-toggle"><span><strong>Длинные резиновые петли</strong><small>И надёжный дверной якорь</small></span><input checked={hasBands} onChange={(event) => setBands(event.target.checked)} type="checkbox" /></label><label className="field"><span>Часовой пояс</span><select disabled value={settings.timezone}><option value="Europe/Oslo">Europe/Oslo · Норвегия</option></select></label></div><button className="primary-button" disabled={busy || !daysAreValid} type="submit"><Save size={18} /> Сохранить программу</button></form>
    <section className="settings-card"><div className="settings-title"><span><CloudDownload /></span><div><h2>Данные для анализа</h2><p>Файлы не содержат пароль, cookie или setup-токен</p></div></div><div className="export-grid"><a href="/api/export?format=markdown"><span><Download /></span><div><strong>Отчёт для тренера</strong><small>Markdown · удобно загрузить в чат</small></div></a><a href="/api/export?format=json"><span><DatabaseBackup /></span><div><strong>Полный экспорт</strong><small>JSON · все тренировки и замеры</small></div></a></div></section>
    <section className="settings-card"><div className="settings-title"><span><DatabaseBackup /></span><div><h2>Резервные копии</h2><p>Согласованная копия SQLite хранится только на сервере</p></div></div><div className="backup-row"><div><strong>{backups[0]?.fileName ?? 'Копий пока нет'}</strong><small>{backups[0] ? `${(backups[0].sizeBytes / 1024).toFixed(1)} КБ · ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' }).format(new Date(backups[0].createdAt))}` : 'Создай первую вручную; после установки также работает ежедневный таймер'}</small></div><button className="secondary-button" disabled={busy} onClick={() => void createBackupNow()} type="button"><DatabaseBackup size={17} /> Создать сейчас</button></div></section>
    <form className="settings-card" onSubmit={changePassword}><div className="settings-title"><span><KeyRound /></span><div><h2>Сменить пароль</h2><p>После смены все остальные устройства выйдут из аккаунта</p></div></div><div className="password-grid"><label className="field"><span>Текущий пароль</span><input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} /></label><label className="field"><span>Новый пароль · минимум 10 символов</span><input autoComplete="new-password" minLength={10} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} /></label></div><button className="secondary-button" disabled={busy} type="submit"><Check size={17} /> Изменить пароль</button></form>
    <section className="privacy-card"><ShieldCheck /><div><strong>Приватность по умолчанию</strong><p>Нет внешней аналитики, рекламы и облачной синхронизации. Видео загружается с YouTube только после нажатия. Все тренировочные данные находятся в твоём SQLite-файле.</p></div></section>
    <button className="logout-button" onClick={() => void logout()} type="button"><LogOut size={18} /> Выйти на этом устройстве</button>
  </div>;
}
