import { useEffect, useRef, useState } from 'react';
import { createCountdown } from '../lib/countdown';

export default function EndOfLessonCountdown({
  seconds,
  hasNext,
  onElapsed,
  onCancel,
  onSkipNow,
}: {
  seconds: number;
  hasNext: boolean;
  onElapsed: () => void;
  onCancel: () => void;
  onSkipNow: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const cdRef = useRef(createCountdown(seconds, onElapsed));
  useEffect(() => {
    const cd = cdRef.current;
    const id = setInterval(() => {
      cd.tick();
      setLeft(cd.secondsLeft);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const cancel = () => {
    cdRef.current.cancel();
    onCancel();
  };
  return (
    <div className="absolute inset-0 grid place-items-center z-30 pointer-events-none">
      <div className="bg-neutral-900/95 rounded-xl p-5 text-center pointer-events-auto">
        <div className="text-green-400 mb-1">Aula assistida ✓</div>
        <div className="text-neutral-200 mb-3">
          {hasNext ? 'Concluindo e indo p/ a próxima em ' : 'Concluindo em '}
          <b>{left}s</b>
        </div>
        <div className="flex gap-2 justify-center">
          <button onClick={cancel} className="px-3 py-2 bg-neutral-800 rounded">Cancelar</button>
          <button onClick={onSkipNow} className="px-3 py-2 bg-blue-600 rounded">{hasNext ? 'Pular agora' : 'Concluir agora'}</button>
        </div>
      </div>
    </div>
  );
}
