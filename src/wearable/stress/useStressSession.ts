import { useCallback, useEffect, useRef, useState } from 'react';
import { useWearHeartRate } from '../useWearHeartRate';
import { HeartRateEvent } from '../WearBridge';
import {
  BASELINE_DURATION_MS,
  BASELINE_GRACE_MS,
  BaselineAccumulator,
  clearBaseline as clearStoredBaseline,
  loadBaseline,
  saveBaseline,
} from './baseline';
import { CapturedBaselineProvider } from '../indices/baselineProvider';
import {
  ExpectancyAlertState,
  ExpectancyAlertTracker,
  IDLE_ALERT,
} from '../indices/expectancyAlert';
import { IndexCalculator } from '../indices/indexCalculator';
import { InstantIndices } from '../indices/types';
import { computeCompositeStress } from './compositeStress';
import { flushSamples, recordSample } from './sampleStore';
import { Baseline, CompositeStress, FeatureKey } from './types';

/** Progresso da captura de baseline, enquanto ela está rodando. */
export interface CaptureState {
  elapsedMs: number;
  durationMs: number;
  /** Amostras aceitas, descartadas por movimento e recebidas fora da janela. */
  accepted: number;
  rejected: number;
  outOfWindow: number;
  /**
   * A janela acabou e a captura está esperando as amostras atrasadas que o
   * relógio ainda não entregou.
   */
  draining: boolean;
  /** Features que já juntaram amostras suficientes para virar estatística. */
  readyFeatures: FeatureKey[];
}

export interface StressSession {
  latest: HeartRateEvent | null;
  isLive: boolean;
  baseline: Baseline | null;
  /** Índice composto da última amostra sem movimento; null sem baseline. */
  composite: CompositeStress | null;
  /** CM/EE/PB/IRPT/RP da última amostra sem movimento; null sem baseline. */
  indices: InstantIndices | null;
  expectancy: ExpectancyAlertState;
  /** A baseline em uso tem algum termo genérico em vez de medido no participante. */
  baselineIsGeneric: boolean;
  capture: CaptureState | null;
  startCapture: () => void;
  cancelCapture: () => void;
  clearBaseline: () => void;
}

/**
 * Costura o stream do relógio ao índice composto: grava toda amostra em disco,
 * alimenta a captura de baseline quando ela está ativa e calcula o índice
 * quando há baseline.
 *
 * Uma única assinatura do Data Layer para tudo — o card ao vivo consome este
 * hook em vez de abrir um segundo listener em paralelo.
 */
export function useStressSession(): StressSession {
  const { latest, isLive } = useWearHeartRate();

  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [composite, setComposite] = useState<CompositeStress | null>(null);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [indices, setIndices] = useState<InstantIndices | null>(null);
  const [expectancy, setExpectancy] = useState<ExpectancyAlertState>(IDLE_ALERT);

  const accumulator = useRef<BaselineAccumulator | null>(null);
  // Lido dentro do efeito por amostra; em ref para não reassinar a cada mudança.
  const baselineRef = useRef<Baseline | null>(null);
  // Guardam janela deslizante e contagem do alerta, que são estado entre
  // amostras — por isso instâncias vivas em ref, e não recriadas por render.
  const calculator = useRef<IndexCalculator | null>(null);
  const alertTracker = useRef(new ExpectancyAlertTracker());

  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  // Uma baseline nova invalida tudo que foi medido contra a antiga: os índices
  // na tela, a contagem do alerta e a janela de V (cujo BPM de 5 min atrás
  // seria comparado a um denominador diferente).
  useEffect(() => {
    calculator.current = baseline ? new IndexCalculator(new CapturedBaselineProvider(baseline)) : null;
    alertTracker.current.reset();
    setIndices(null);
    setExpectancy(IDLE_ALERT);
  }, [baseline]);

  useEffect(() => {
    void loadBaseline().then(setBaseline);
  }, []);

  // Grava o que estiver pendente ao sair da tela.
  useEffect(() => () => void flushSamples(), []);

  const finishCapture = useCallback(() => {
    const acc = accumulator.current;
    accumulator.current = null;
    setCapture(null);
    if (!acc) return;

    const result = acc.finalize();
    if (result) {
      setBaseline(result);
      void saveBaseline(result);
    }
  }, []);

  /**
   * Fecha a captura se a janela já acabou *e* não há mais o que esperar.
   * Retorna se fechou.
   *
   * Não basta o cronômetro: a plataforma entrega em rajadas e a última delas pode
   * carregar até um minuto de amostras da janela. Fecha-se quando chegou amostra
   * carimbada depois do fim da janela (não sobrou nada) ou quando a espera
   * esgotou — sem esse teto a captura ficaria pendurada se o relógio se
   * desconectasse justamente no fim.
   */
  const settleCapture = useCallback(
    (acc: BaselineAccumulator): boolean => {
      const elapsedMs = Date.now() - acc.startedAt;
      if (elapsedMs < BASELINE_DURATION_MS) return false;
      if (!acc.windowCovered && elapsedMs < BASELINE_DURATION_MS + BASELINE_GRACE_MS) return false;
      finishCapture();
      return true;
    },
    [finishCapture]
  );

  // Uma amostra chegou: persiste sempre, e então ou alimenta a captura, ou
  // atualiza o índice.
  useEffect(() => {
    if (!latest) return;

    recordSample(latest);

    const acc = accumulator.current;
    if (acc) {
      acc.add(latest);
      if (!settleCapture(acc)) {
        const elapsedMs = Date.now() - acc.startedAt;
        setCapture({
          elapsedMs,
          durationMs: BASELINE_DURATION_MS,
          ...acc.counts,
          draining: elapsedMs >= BASELINE_DURATION_MS,
          readyFeatures: acc.readyFeatures,
        });
      }
      return;
    }

    // A janela deslizante recebe toda amostra, inclusive com movimento — é o
    // próprio IndexCalculator que decide o que fazer com o flag.
    const instant = calculator.current?.update(latest) ?? null;
    if (instant) {
      setIndices(instant);
      setExpectancy(alertTracker.current.update(instant.terms, instant.timestamp));
    }

    const current = baselineRef.current;
    // Janelas com movimento não atualizam o display: o artefato de movimento
    // contamina IBI e EDA justamente as duas fontes do índice.
    if (current && !latest.motionFlag) {
      setComposite(computeCompositeStress(latest, current));
    }
  }, [latest, finishCapture]);

  // O relógio pode parar de enviar no meio da captura (saiu do pulso, Bluetooth
  // caiu). Sem este tique o cronômetro congelaria e a captura nunca fecharia,
  // porque toda a contagem depende da chegada de amostras.
  const isCapturing = capture !== null;
  useEffect(() => {
    if (!isCapturing) return;
    const id = setInterval(() => {
      const acc = accumulator.current;
      if (!acc) return;
      if (settleCapture(acc)) return;
      const elapsedMs = Date.now() - acc.startedAt;
      setCapture(prev =>
        prev ? { ...prev, elapsedMs, draining: elapsedMs >= BASELINE_DURATION_MS } : prev
      );
    }, 1000);
    return () => clearInterval(id);
  }, [isCapturing, settleCapture]);

  const startCapture = useCallback(() => {
    accumulator.current = new BaselineAccumulator();
    setComposite(null);
    setIndices(null);
    setExpectancy(IDLE_ALERT);
    alertTracker.current.reset();
    setCapture({
      elapsedMs: 0,
      durationMs: BASELINE_DURATION_MS,
      accepted: 0,
      rejected: 0,
      outOfWindow: 0,
      draining: false,
      readyFeatures: [],
    });
  }, []);

  const cancelCapture = useCallback(() => {
    accumulator.current = null;
    setCapture(null);
  }, []);

  const clear = useCallback(() => {
    setBaseline(null);
    setComposite(null);
    void clearStoredBaseline();
  }, []);

  // Sinalizar isto na tela é obrigatório, não cosmético: um índice contra valor
  // genérico é uma leitura sobre "um adulto médio", não sobre este participante.
  const baselineIsGeneric =
    baseline != null && new CapturedBaselineProvider(baseline).genericTerms.length > 0;

  return {
    latest,
    isLive,
    baseline,
    composite,
    indices,
    expectancy,
    baselineIsGeneric,
    capture,
    startCapture,
    cancelCapture,
    clearBaseline: clear,
  };
}
