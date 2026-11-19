import { useEffect, useRef, useState } from 'react';
import { HeartRateEvent, subscribeToHeartRate } from './WearBridge';

// Sem eventos por este intervalo, o relógio é considerado desconectado.
const STALE_AFTER_MS = 15_000;

export interface WearHeartRateState {
  /** Última leitura recebida do relógio (null antes da primeira). */
  latest: HeartRateEvent | null;
  /** true enquanto leituras chegam dentro da janela de STALE_AFTER_MS. */
  isLive: boolean;
}

/**
 * Assina as leituras de sensores enviadas pelo relógio via Wear Data Layer.
 * Toda a lógica de "conectado/desconectado" fica aqui para as telas
 * consumirem apenas `{ latest, isLive }`.
 */
export function useWearHeartRate(): WearHeartRateState {
  const [latest, setLatest] = useState<HeartRateEvent | null>(null);
  const [isLive, setIsLive] = useState(false);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToHeartRate(event => {
      setLatest(event);
      setIsLive(true);
      if (staleTimer.current) clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => setIsLive(false), STALE_AFTER_MS);
    });
    return () => {
      unsubscribe();
      if (staleTimer.current) clearTimeout(staleTimer.current);
    };
  }, []);

  return { latest, isLive };
}
