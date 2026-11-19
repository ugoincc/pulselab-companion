import AsyncStorage from '@react-native-async-storage/async-storage';
import { HeartRateEvent } from '../WearBridge';
import { extractFeatures } from './compositeStress';
import { Baseline, FEATURE_KEYS, FeatureKey, FeatureStats } from './types';

/**
 * Captura e persistência da baseline de repouso.
 *
 * A baseline é um objeto pequeno e lido uma vez por sessão, então AsyncStorage é
 * o lugar certo (mesmo padrão de `src/notifications/store.ts`). As amostras
 * brutas, que chegam a 1 Hz, vão para arquivo — ver `sampleStore.ts`.
 */

const KEY = '@pulselab:stress-baseline';

/** Duração recomendada da captura de repouso. */
export const BASELINE_DURATION_MS = 5 * 60 * 1000;

/**
 * Quanto se espera, depois do fim da janela, pelas amostras ainda a caminho.
 *
 * Com a tela do relógio dormente a plataforma segura a entrega e descarrega em
 * rajadas — o maior atraso medido em device (SM-L705F, 2026-07-28) foi de 61,8 s.
 * Fechar a captura no cronômetro puro descartaria em silêncio até um minuto das
 * amostras da própria janela, e uma baseline com um buraco desses é pior que
 * nenhuma: não parece quebrada, só fica errada.
 *
 * 90 s dá folga sobre o pior caso observado. A espera acaba antes disso assim que
 * chegar uma amostra carimbada depois do fim da janela — prova de que o relógio
 * já passou dela e não há mais nada da janela para chegar.
 */
export const BASELINE_GRACE_MS = 90 * 1000;

/**
 * Mínimo de amostras para uma feature virar estatística. Abaixo disso o
 * desvio-padrão não é confiável e é melhor não ter a feature do que ter uma
 * baseline ruim — o índice se recompõe sem ela.
 */
export const MIN_SAMPLES_PER_FEATURE = 30;

/**
 * Acumula as amostras que chegam durante a janela de repouso.
 *
 * Amostras com `motionFlag` são descartadas: uma baseline é por definição uma
 * medida de repouso, e movimento durante a captura contaminaria a média e o
 * desvio de todas as features de uma vez.
 */
export class BaselineAccumulator {
  private readonly values: Record<FeatureKey, number[]> = {
    rmssd: [],
    baevskySI: [],
    edaTonic: [],
    edaScrPerMin: [],
  };

  /** Ver `Baseline.bpm`: coletado junto, mas fora das features do índice composto. */
  private readonly bpmValues: number[] = [];

  readonly startedAt = Date.now();
  readonly endsAt = this.startedAt + BASELINE_DURATION_MS;

  private accepted = 0;
  private rejected = 0;
  private outOfWindow = 0;
  private newestSeen = 0;

  add(sample: HeartRateEvent): void {
    // O timestamp é o instante de *aquisição* no relógio, não o de chegada: com a
    // entrega em rajadas os dois podem estar a um minuto de distância. Toda a
    // janela é decidida por ele.
    const at = sample.timestamp;
    if (typeof at === 'number' && at > 0) {
      if (at > this.newestSeen) this.newestSeen = at;
      if (at < this.startedAt || at >= this.endsAt) {
        this.outOfWindow += 1;
        return;
      }
    }

    if (sample.motionFlag) {
      this.rejected += 1;
      return;
    }
    const features = extractFeatures(sample);
    for (const key of FEATURE_KEYS) {
      const value = features[key];
      if (value != null) this.values[key].push(value);
    }
    // > 0: o relógio emite bpm 0 quando o sensor perde contato com a pele.
    if (typeof sample.bpm === 'number' && sample.bpm > 0) this.bpmValues.push(sample.bpm);
    this.accepted += 1;
  }

  /** Quantas amostras entraram, quantas caíram por movimento e quantas por estarem fora da janela. */
  get counts() {
    return { accepted: this.accepted, rejected: this.rejected, outOfWindow: this.outOfWindow };
  }

  /**
   * Já chegou alguma amostra carimbada depois do fim da janela?
   *
   * Enquanto for falso pode haver amostras da janela presas numa rajada ainda não
   * entregue, e fechar a captura perderia esses dados.
   */
  get windowCovered(): boolean {
    return this.newestSeen >= this.endsAt;
  }

  /** Features que já têm amostras suficientes para virar estatística. */
  get readyFeatures(): FeatureKey[] {
    return FEATURE_KEYS.filter(key => this.values[key].length >= MIN_SAMPLES_PER_FEATURE);
  }

  /**
   * Fecha a captura. Retorna null quando nada juntou amostras suficientes.
   *
   * Basta o BPM para a baseline valer a pena ser guardada: o índice composto
   * fica indisponível, mas os índices instantâneos (`../indices`) rodam com o
   * BPM sozinho, com os demais termos renormalizados.
   */
  finalize(): Baseline | null {
    const features: Partial<Record<FeatureKey, FeatureStats>> = {};

    for (const key of FEATURE_KEYS) {
      const stats = describe(this.values[key]);
      if (stats != null) features[key] = stats;
    }

    const bpm = describe(this.bpmValues);

    if (Object.keys(features).length === 0 && bpm == null) return null;

    return {
      capturedAt: new Date(this.startedAt).toISOString(),
      ...(bpm != null ? { bpm } : {}),
      // A janela, não o tempo de parede até fechar: a espera pelas rajadas
      // atrasadas pode acrescentar até BASELINE_GRACE_MS sem que um segundo a
      // mais de fisiologia tenha sido observado.
      durationMs: BASELINE_DURATION_MS,
      features,
    };
  }
}

/**
 * Média e desvio-padrão amostral (denominador n-1) de uma feature.
 *
 * n-1 e não n: estes valores são uma *estimativa* da variabilidade em repouso do
 * participante a partir de uma amostra dela, não a variabilidade de uma
 * população fechada.
 */
function describe(values: number[]): FeatureStats | null {
  if (values.length < MIN_SAMPLES_PER_FEATURE) return null;

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);

  return { mean, std: Math.sqrt(variance), n };
}

// ─── Persistência ─────────────────────────────────────────────────────────────

export async function saveBaseline(baseline: Baseline): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(baseline));
}

export async function loadBaseline(): Promise<Baseline | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Baseline) : null;
  } catch {
    return null;
  }
}

export async function clearBaseline(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
