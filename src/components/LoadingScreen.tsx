import { Dumbbell } from 'lucide-react';

export function LoadingScreen({ label = 'Загружаю тренировку…' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status">
      <span className="loading-mark"><Dumbbell size={28} /></span>
      <span>{label}</span>
    </div>
  );
}
