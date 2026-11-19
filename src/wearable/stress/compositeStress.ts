import { HeartRateEvent } from '../WearBridge';
import {
  Baseline,
  CompositeStress,
  FEATURE_DIRECTION,
  FEATURE_KEYS,
  FeatureKey,
} from './types';

/**
 * Índice de estresse composto: soma ponderada de z-scores contra a baseline de
 * repouso do participante.
 *
 *   Composto = Σ wᵢ · sinalᵢ · z(featureᵢ)
 *
 * Não é um classificador treinado, e isso é uma decisão, não uma limitação: cada
 * peso é explícito e documentável na monografia, coerente com a escolha de usar
 * RMSSD/SI em vez do índice proprietário da Samsung. Os pesos iguais abaixo são
 * o ponto de partida transparente; ajustá-los contra um critério externo
 * (autorrelato, cortisol) seria uma decisão explícita, não um ajuste de
 * caixa-preta.
 */

/** Extrai as features do payload do relógio, normalizando os nomes. */
export function extractFeatures(sample: HeartRateEvent): Partial<Record<FeatureKey, number>> {
  return {
    rmssd: sample.hrv,
    baevskySI: sample.baevskySI,
    edaTonic: sample.edaTonic,
    edaScrPerMin: sample.edaScrPerMin,
  };
}

function zScore(value: number, mean: number, std: number): number {
  return (value - mean) / std;
}

/**
 * Calcula o índice composto de uma amostra contra a `baseline`.
 *
 * Retorna null quando nenhuma feature é utilizável — sem baseline, ou com todas
 * as features ausentes. Amostras com `motionFlag` são responsabilidade do
 * chamador: elas continuam sendo gravadas, só não devem alimentar o display.
 *
 * Os pesos são renormalizados sobre as features realmente disponíveis. Isso
 * importa na prática: o EDA é o canal com maior chance de faltar (o tracker pode
 * nem instanciar no relógio), e sem renormalizar o índice inteiro encolheria
 * pela metade quando isso acontecesse, parecendo queda de estresse em vez de
 * perda de sensor.
 */
export function computeCompositeStress(
  sample: HeartRateEvent,
  baseline: Baseline,
): CompositeStress | null {
  const features = extractFeatures(sample);
  const contributions: Partial<Record<FeatureKey, number>> = {};
  const featuresUsed: FeatureKey[] = [];

  for (const key of FEATURE_KEYS) {
    const value = features[key];
    const stats = baseline.features[key];
    // std === 0 significa uma feature que não variou durante todo o repouso:
    // o z-score seria divisão por zero, então ela fica de fora.
    if (value == null || stats == null || stats.std <= 0) continue;

    contributions[key] = FEATURE_DIRECTION[key] * zScore(value, stats.mean, stats.std);
    featuresUsed.push(key);
  }

  if (featuresUsed.length === 0) return null;

  const weight = 1 / featuresUsed.length;
  const value = featuresUsed.reduce((sum, key) => sum + weight * contributions[key]!, 0);

  return { value, contributions, featuresUsed };
}

/**
 * Faixas qualitativas para o display.
 *
 * PROVISÓRIO: os cortes em ±0,5 desvio-padrão são convenção de leitura, não
 * resultado validado. Servem para dar contexto ao número na tela; o valor
 * numérico é que é o dado. Revisar contra critério externo antes de usar isso
 * como afirmação na monografia.
 */
export type StressBand = 'baixo' | 'normal' | 'elevado';

export function stressBand(value: number): StressBand {
  if (value < -0.5) return 'baixo';
  if (value > 0.5) return 'elevado';
  return 'normal';
}
