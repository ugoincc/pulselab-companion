import { Baseline } from '../stress/types';

/**
 * De onde vêm os valores de repouso contra os quais os índices são medidos.
 *
 * A razão de ser desta interface é a Fase 2: quando existir banco, a média
 * rolante de 14 dias entra por aqui (`PersistedBaselineProvider` abaixo) sem que
 * `IndexCalculator` seja tocado. O calculador recebe um `BaselineProvider` no
 * construtor e nunca instancia uma implementação concreta.
 *
 * Cada campo é `null` quando aquele valor não foi capturado. Null propaga: o
 * termo correspondente sai da conta e os pesos dos que sobraram são
 * renormalizados. Isso é deliberadamente diferente de substituir por um valor
 * genérico — ver `GENERIC_RESTING` no fim deste arquivo.
 */
export interface BaselineProvider {
  /** BPM médio de repouso. */
  readonly bpmBaseline: number | null;
  /** RMSSD médio de repouso, em ms. */
  readonly hrvBaseline: number | null;
  /** SI de Baevsky médio de repouso, escala bruta. */
  readonly siBaseline: number | null;
  /** Quais dos três acima não são do participante, e sim valores genéricos. */
  readonly genericTerms: readonly BaselineTerm[];
}

export type BaselineTerm = 'bpm' | 'hrv' | 'si';

/**
 * Baseline capturada em repouso guiado e persistida no dispositivo
 * (`../stress/baseline.ts`).
 *
 * Fase 1 usa esta. Fase 2 troca por uma implementação que busca a média de 14
 * dias do backend — mesma interface, mesma injeção, zero mudança no cálculo.
 */
export class CapturedBaselineProvider implements BaselineProvider {
  readonly bpmBaseline: number | null;
  readonly hrvBaseline: number | null;
  readonly siBaseline: number | null;
  readonly genericTerms: readonly BaselineTerm[];

  constructor(baseline: Baseline) {
    // > 0 em todos: são denominadores. Um zero aqui não é "sem dado", é uma
    // divisão que produziria Infinity e envenenaria o índice inteiro.
    this.bpmBaseline = positive(baseline.bpm?.mean);
    this.hrvBaseline = positive(baseline.features.rmssd?.mean);
    this.siBaseline = positive(baseline.features.baevskySI?.mean);

    const generic: BaselineTerm[] = [];
    // FALLBACK TEMPORÁRIO — ver GENERIC_RESTING. Só o BPM tem fallback, e só
    // aqui: baselines gravadas antes do campo `bpm` existir são desta forma
    // aproveitadas em vez de exigirem recalibração do participante.
    if (this.bpmBaseline == null) {
      this.bpmBaseline = GENERIC_RESTING.bpm;
      generic.push('bpm');
    }
    this.genericTerms = generic;
  }
}

/**
 * Valores fisiológicos genéricos de repouso.
 *
 * FALLBACK TEMPORÁRIO E DELIBERADAMENTE ESTREITO. Um valor de referência
 * populacional não é a baseline de ninguém: com HRV de repouso real de 20 ms, um
 * "genérico" de 42 ms produziria R ≈ 0,52 constante — alarme permanente que
 * pareceria fisiologia e não erro de configuração. Por isso a regra é que termo
 * sem baseline sai da conta (o peso é renormalizado), e não que ele seja
 * preenchido com estes números.
 *
 * A única exceção é o BPM, porque sem ele nem A nem V existem e não sobra índice
 * nenhum para renormalizar. Quando isso acontece o consumidor recebe `'bpm'` em
 * `genericTerms` e a tela precisa dizer que a leitura não é personalizada.
 *
 * Remover junto com a Fase 2, quando a baseline vier do histórico persistido.
 */
export const GENERIC_RESTING = {
  /** BPM de repouso de adulto saudável. */
  bpm: 70,
  /** RMSSD de repouso de adulto saudável, em ms. */
  hrv: 42,
  /** SI de Baevsky, meio da faixa de baixo estresse de Baevsky (50–150), escala bruta. */
  si: 80,
} as const;

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}
