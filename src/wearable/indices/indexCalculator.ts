import { HeartRateEvent } from '../WearBridge';
import { BaselineProvider } from './baselineProvider';
import { SampleWindow } from './sampleWindow';
import { IndexValue, InstantIndices, NormalizedTerms } from './types';

/**
 * Cálculo dos índices instantâneos.
 *
 * A baseline entra pelo construtor, como `BaselineProvider`. Este arquivo não
 * sabe se ela veio de uma captura de repouso em memória ou de uma média de 14
 * dias do backend, e é esse desconhecimento que torna a Fase 2 uma troca de uma
 * linha lá em cima.
 */

/** Distância no passado com que V compara o BPM. */
export const V_LOOKBACK_MS = 5 * 60 * 1000;

/**
 * Referência fixa de SpO₂. Não é baseline do participante: 97% é o piso da
 * normalidade em ar ambiente, e o divisor 7 põe 90% (limiar clínico de hipóxia)
 * exatamente em O = 1.
 */
export const SPO2_REFERENCE = 97;
export const SPO2_RANGE = 7;

/** Um termo e seu peso na soma. Peso de termo ausente é redistribuído. */
type WeightedTerm = [value: number | null, weight: number];

/**
 * Soma ponderada que sobrevive a termos ausentes.
 *
 * Renormalizar sobre os termos presentes é o que impede um sensor calado de
 * virar boa notícia: sem isso, perder o SpO₂ derrubaria a Carga Mental em 5
 * pontos e perder o SI, em 25 — quedas que o usuário leria como "estou melhor"
 * quando o que houve foi o relógio parar de medir.
 */
function weightedSum(terms: WeightedTerm[]): { sum: number; used: number } | null {
  let weightPresent = 0;
  for (const [value, weight] of terms) {
    if (value != null) weightPresent += weight;
  }
  if (weightPresent <= 0) return null;

  let sum = 0;
  let used = 0;
  for (const [value, weight] of terms) {
    if (value == null) continue;
    sum += (weight / weightPresent) * value;
    used += 1;
  }
  return { sum, used };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Monta um índice a partir da soma ponderada.
 *
 * `invert` cobre EE e PB, que são escalas de "quanto ainda há" e não de "quanto
 * já pesa": 100 − 100 × soma.
 */
function toIndex(terms: WeightedTerm[], invert = false): IndexValue | null {
  const result = weightedSum(terms);
  if (result == null) return null;

  const raw = invert ? 100 - 100 * result.sum : 100 * result.sum;
  return { value: clamp(raw), termsUsed: result.used, termsTotal: terms.length };
}

/** A — ativação cardíaca. */
export function termA(bpm: number | null, bpmBase: number | null): number | null {
  if (bpm == null || bpm <= 0 || bpmBase == null) return null;
  return (bpm - bpmBase) / bpmBase;
}

/** R — supressão de HRV. Positivo quando o RMSSD cai abaixo do repouso. */
export function termR(hrv: number | null | undefined, hrvBase: number | null): number | null {
  if (hrv == null || hrv <= 0 || hrvBase == null) return null;
  return (hrvBase - hrv) / hrvBase;
}

/**
 * S — sobrecarga de estresse: desvio *relativo* do SI de Baevsky.
 *
 * Relativo, e não `SI / 100` como numa versão anterior da especificação: o SI é
 * um índice de escala bruta cuja faixa de repouso varia muito entre pessoas (um
 * repouso de 44 foi medido em device), então dividir por uma constante mede
 * principalmente quem é o participante, não como ele está agora.
 */
export function termS(si: number | null | undefined, siBase: number | null): number | null {
  if (si == null || si <= 0 || siBase == null) return null;
  return (si - siBase) / siBase;
}

/** O — penalidade de SpO₂ contra a referência fixa de 97%. */
export function termO(spo2: number | null | undefined): number | null {
  if (spo2 == null || spo2 <= 0) return null;
  return Math.max(0, (SPO2_REFERENCE - spo2) / SPO2_RANGE);
}

/** V — velocidade de variação do BPM sobre a janela de 5 min. */
export function termV(
  bpm: number | null,
  bpmAgo: number | null,
  bpmBase: number | null
): number | null {
  if (bpm == null || bpm <= 0 || bpmAgo == null || bpmBase == null) return null;
  return Math.abs(bpm - bpmAgo) / bpmBase;
}

export class IndexCalculator {
  private readonly window = new SampleWindow();

  constructor(private readonly baseline: BaselineProvider) {}

  /** Esquece a janela recente. Para quando a sessão reinicia ou a baseline muda. */
  reset(): void {
    this.window.clear();
  }

  /**
   * Alimenta a janela com a amostra e devolve os índices dela.
   *
   * Amostras com `motionFlag` entram na janela mas não geram índices: o artefato
   * de movimento contamina IBI (logo HRV e SI) exatamente como no índice
   * composto. Ainda assim elas alimentam a janela, porque o BPM sob movimento é
   * legítimo — é o V que perderia sentido se a série ficasse cheia de buracos.
   */
  update(sample: HeartRateEvent): InstantIndices | null {
    const bpm = sample.bpm > 0 ? sample.bpm : null;
    const at = sample.timestamp;

    const bpmAgo = bpm != null ? this.window.bpmNear(at - V_LOOKBACK_MS) : null;
    if (bpm != null) this.window.add(at, bpm);

    if (sample.motionFlag) return null;

    const { bpmBaseline, hrvBaseline, siBaseline } = this.baseline;
    const terms: NormalizedTerms = {
      a: termA(bpm, bpmBaseline),
      r: termR(sample.hrv, hrvBaseline),
      s: termS(sample.baevskySI, siBaseline),
      o: termO(sample.spo2),
      v: termV(bpm, bpmAgo, bpmBaseline),
    };

    return { ...computeIndices(terms), terms, timestamp: at };
  }
}

/**
 * Os cinco índices a partir dos termos já normalizados.
 *
 * Os pesos são os do guia e estão aqui em vez de numa tabela de configuração de
 * propósito: cada um é uma afirmação que a monografia precisa defender, não um
 * parâmetro a ajustar até o gráfico ficar bonito.
 */
export function computeIndices(
  terms: NormalizedTerms
): Pick<InstantIndices, 'cm' | 'ee' | 'pb' | 'irpt' | 'rp'> {
  const { a, r, s, o, v } = terms;

  return {
    cm: toIndex([
      [a, 0.35],
      [r, 0.35],
      [s, 0.25],
      [o, 0.05],
    ]),
    ee: toIndex(
      [
        [a, 0.4],
        [r, 0.4],
        [s, 0.2],
      ],
      true
    ),
    pb: toIndex(
      [
        [r, 0.45],
        [a, 0.25],
        [s, 0.2],
        [o, 0.1],
      ],
      true
    ),
    irpt: toIndex([
      [a, 0.3],
      [r, 0.35],
      [s, 0.25],
      [v, 0.1],
    ]),
    rp: toIndex([
      [r, 0.6],
      [a, 0.4],
    ]),
  };
}
