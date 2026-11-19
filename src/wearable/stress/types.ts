/**
 * Tipos do índice de estresse composto.
 *
 * O relógio produz *features*; o celular produz o *índice*. A conta que fecha o
 * índice mora aqui porque depende de uma baseline por participante — estado com
 * ciclo de vida e persistência, coisa que não cabe num foreground service do
 * relógio sob pressão de bateria.
 */

/**
 * As quatro features que entram no índice. São exatamente as mesmas que o
 * pipeline de pesquisa offline recalcula, para que os dois resultados sejam
 * comparáveis.
 */
export type FeatureKey = 'rmssd' | 'baevskySI' | 'edaTonic' | 'edaScrPerMin';

export const FEATURE_KEYS: FeatureKey[] = ['rmssd', 'baevskySI', 'edaTonic', 'edaScrPerMin'];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  rmssd: 'HRV (RMSSD)',
  baevskySI: 'SI de Baevsky',
  edaTonic: 'EDA tônico',
  edaScrPerMin: 'EDA fásico',
};

/**
 * Sinal de cada feature no índice: +1 quando subir significa mais estresse,
 * -1 quando for o contrário.
 *
 * O RMSSD é o único invertido — a variabilidade cardíaca *cai* sob dominância
 * simpática, então um z-score negativo de RMSSD é evidência de estresse.
 */
export const FEATURE_DIRECTION: Record<FeatureKey, 1 | -1> = {
  rmssd: -1,
  baevskySI: 1,
  edaTonic: 1,
  edaScrPerMin: 1,
};

/** Média e desvio-padrão de uma feature durante a janela de repouso. */
export interface FeatureStats {
  mean: number;
  std: number;
  /** Quantas amostras entraram nessa estatística. */
  n: number;
}

/**
 * Baseline de repouso de um participante. `features` é parcial de propósito:
 * se o EDA não estiver disponível no relógio, simplesmente não haverá entrada
 * para ele, e o índice se recompõe com as features restantes.
 */
export interface Baseline {
  /** ISO 8601. */
  capturedAt: string;
  durationMs: number;
  features: Partial<Record<FeatureKey, FeatureStats>>;
  /**
   * BPM de repouso. Fora de `features` de propósito: o BPM não entra no índice
   * composto (a frequência cardíaca isolada é o sinal mais confundido por
   * postura e cafeína de todos os quatro), mas é o denominador dos índices
   * instantâneos, onde o desvio relativo é justamente o que se quer medir.
   *
   * Opcional porque baselines gravadas antes desta versão não têm o campo.
   */
  bpm?: FeatureStats;
}

/** Resultado do índice composto para uma amostra. */
export interface CompositeStress {
  /** Soma ponderada de z-scores. ~0 = igual à baseline; positivo = mais estresse. */
  value: number;
  /** z-score já orientado (sinal aplicado) de cada feature que entrou na conta. */
  contributions: Partial<Record<FeatureKey, number>>;
  /** Quais features efetivamente entraram — menos que 4 é normal e esperado. */
  featuresUsed: FeatureKey[];
}
