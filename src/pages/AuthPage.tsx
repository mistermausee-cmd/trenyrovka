import { Check, Dumbbell, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { useAuth } from '../contexts/AuthContext';

function osloToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function AuthPage({ setupRequired }: { setupRequired: boolean }) {
  const { setup, login } = useAuth();
  const [setupToken, setSetupToken] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('Атлет');
  const [startDate, setStartDate] = useState(osloToday());
  const [hasBands, setHasBands] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordReady = useMemo(() => password.length >= 10, [password]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setupRequired) await setup({ setupToken, password, displayName, startDate, hasBands });
      else await login(password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand-large"><span className="brand-mark"><Dumbbell size={23} /></span><span>Тренировка</span></div>
        <div>
          <p className="eyebrow">Твой персональный ритм</p>
          <h1>{setupRequired ? 'Сильнее. Спокойно. По плану.' : 'Продолжим с того места.'}</h1>
          <p className="auth-lead">Каждый подход, замер и маленькая победа — в одном приватном пространстве.</p>
        </div>
        <div className="auth-promises">
          <span><ShieldCheck size={18} /> Данные остаются на твоём сервере</span>
          <span><Sparkles size={18} /> План адаптируется по неделям</span>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div>
            <p className="step-label">{setupRequired ? 'Первый запуск' : 'С возвращением'}</p>
            <h2>{setupRequired ? 'Настроим доступ' : 'Вход'}</h2>
            <p className="muted">{setupRequired ? 'Setup-токен показан установщиком на сервере.' : 'Введи пароль от персонального трекера.'}</p>
          </div>

          {setupRequired && (
            <>
              <label className="field"><span>Setup-токен</span><input autoComplete="one-time-code" onChange={(event) => setSetupToken(event.target.value)} required value={setupToken} /></label>
              <label className="field"><span>Как к тебе обращаться</span><input maxLength={40} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>
              <label className="field"><span>Первый день программы</span><input onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} /></label>
            </>
          )}

          <label className="field">
            <span>Пароль {setupRequired && <small className={passwordReady ? 'valid' : ''}>{passwordReady && <Check size={13} />} минимум 10 символов</small>}</span>
            <div className="password-field">
              <LockKeyhole size={18} />
              <input autoComplete={setupRequired ? 'new-password' : 'current-password'} minLength={setupRequired ? 10 : 1} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} value={password} />
              <button aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>

          {setupRequired && (
            <label className="toggle-row">
              <span><strong>У меня уже есть длинные резинки</strong><small>И надёжный дверной якорь</small></span>
              <input checked={hasBands} onChange={(event) => setHasBands(event.target.checked)} type="checkbox" />
            </label>
          )}

          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="primary-button wide" disabled={busy || (setupRequired && !passwordReady)} type="submit">{busy ? 'Подождите…' : setupRequired ? 'Создать мой трекер' : 'Войти'}</button>
        </form>
      </section>
    </main>
  );
}
