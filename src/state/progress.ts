import { useCallback, useEffect, useState } from 'react';

export interface LevelStats {
  completed: number;
  checked: number;
  correct: number;
}
export type Progress = Record<1 | 2 | 3, LevelStats>;

const KEY = 'netquest.progress.v1';
const empty = (): Progress => ({
  1: { completed: 0, checked: 0, correct: 0 },
  2: { completed: 0, checked: 0, correct: 0 },
  3: { completed: 0, checked: 0, correct: 0 },
});

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento disponible */
  }
  return empty();
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* ignorar */
    }
  }, [progress]);

  const recordChecks = useCallback((level: 1 | 2 | 3, checked: number, correct: number) => {
    setProgress((p) => ({ ...p, [level]: { ...p[level], checked: p[level].checked + checked, correct: p[level].correct + correct } }));
  }, []);
  const recordCompletion = useCallback((level: 1 | 2 | 3) => {
    setProgress((p) => ({ ...p, [level]: { ...p[level], completed: p[level].completed + 1 } }));
  }, []);
  const reset = useCallback(() => setProgress(empty()), []);
  return { progress, recordChecks, recordCompletion, reset };
}

export type ProgressApi = ReturnType<typeof useProgress>;
export const accuracy = (s: LevelStats) => (s.checked ? Math.round((s.correct / s.checked) * 100) : null);
