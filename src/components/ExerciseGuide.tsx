import { AlertTriangle, ArrowDown, CheckCircle2, ExternalLink, Lightbulb, Play, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';

import { EQUIPMENT_TITLES_RU, MUSCLE_TITLES_RU, type Exercise } from '../../shared/exercises';
import { useDialog } from '../hooks/useDialog';

export function ExerciseGuide({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
  const [videoOpen, setVideoOpen] = useState(false);
  const video = exercise.video;
  const videoDialogRef = useDialog<HTMLElement>(videoOpen, () => setVideoOpen(false));

  return (
    <div className={compact ? 'exercise-guide compact' : 'exercise-guide'}>
      <div className="motion-card" aria-label={`Схема движения: ${exercise.title}`}>
        <div className="pose-card"><span>01 · Старт</span><strong>{exercise.visual.start.caption}</strong><small>{exercise.visual.start.landmarks[0]}</small></div>
        <ArrowDown className="motion-arrow" size={20} />
        <div className="pose-card finish"><span>02 · Финиш</span><strong>{exercise.visual.end.caption}</strong><small>{exercise.visual.end.landmarks[0]}</small></div>
      </div>

      <div className="chip-row">
        {exercise.muscles.slice(0, 4).map((muscle) => <span className="chip" key={muscle}>{MUSCLE_TITLES_RU[muscle]}</span>)}
      </div>

      <button className="video-button" onClick={() => video.kind === 'youtube' ? setVideoOpen(true) : window.open(video.url, '_blank', 'noopener,noreferrer')} type="button">
        <span className="video-icon"><Play fill="currentColor" size={19} /></span>
        <span><strong>{video.kind === 'youtube' ? 'Смотреть технику' : 'Открыть видеогайд'}</strong><small>{video.source}{video.duration ? ` · ${video.duration.label}` : ''}</small></span>
        <ExternalLink size={17} />
      </button>

      {!compact && (
        <div className="guide-sections">
          <section><h3><CheckCircle2 size={18} /> Как выполнять</h3><ol>{exercise.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section className="cue-section"><h3><Lightbulb size={18} /> Держи в голове</h3><ul>{exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul></section>
          <section><h3><AlertTriangle size={18} /> Частые ошибки</h3><ul>{exercise.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></section>
          <section className="safety-section"><h3><ShieldCheck size={18} /> Безопасность</h3><ul>{exercise.safety.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <details><summary>Подготовка и варианты</summary><div className="details-content"><h4>Подготовка</h4><ul>{exercise.setup.map((item) => <li key={item}>{item}</li>)}</ul><h4>Если сложно</h4><p>{exercise.regression}</p><h4>Как усложнить</h4><p>{exercise.progression}</p><h4>Инвентарь</h4><p>{exercise.equipment.map((item) => EQUIPMENT_TITLES_RU[item]).join(' · ')}</p></div></details>
        </div>
      )}

      {videoOpen && video.kind === 'youtube' && (
        <div className="modal-backdrop" onMouseDown={() => setVideoOpen(false)} role="presentation">
          <section aria-label={`Видео: ${exercise.title}`} aria-modal="true" className="video-modal" onMouseDown={(event) => event.stopPropagation()} ref={videoDialogRef} role="dialog" tabIndex={-1}>
            <div className="modal-head"><div><strong>{exercise.title}</strong><small>{video.source}{video.duration ? ` · ${video.duration.label}` : ''}</small></div><button aria-label="Закрыть видео" onClick={() => setVideoOpen(false)} type="button"><X /></button></div>
            <div className="video-frame"><iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`} title={video.title} /></div>
            <a className="text-link" href={video.url} rel="noreferrer" target="_blank">Открыть на YouTube <ExternalLink size={15} /></a>
          </section>
        </div>
      )}
    </div>
  );
}
