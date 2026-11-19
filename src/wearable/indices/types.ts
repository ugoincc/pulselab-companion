/**
 * Índices psicofisiológicos instantâneos (Fase 1).
 *
 * Diferença para o índice composto de `../stress`: aquele é um z-score contra a
 * variabilidade do próprio participante em repouso — mede "quão atípica é esta
 * amostra". Estes aqui são desvios *relativos* contra a média de repouso,
 * combinados em pesos fixos e projetados na escala 0–100 para leitura direta.
 * São perguntas diferentes e convivem sem se substituir.
 */

/**
 * Termos normalizados, a base de todos os índices. Cada um é adimensional e
 * centrado em zero quando o participante está igual à sua própria baseline.
 *
 * Podem ser negativos de propósito: A negativo é uma frequência cardíaca abaixo
 * do repouso, R negativo é HRV acima do repouso. Zerá-los aqui apagaria a
 * informação de que a pessoa está mais calma que a linha de base, que é
 * exatamente o que a Estabilidade Emocional e a Prontidão Biológica precisam
 * enxergar. O corte em 0–100 acontece uma vez só, no índice final.
 */
export interface NormalizedTerms {
  /** A — Ativação cardíaca: (BPM − BPM_base) / BPM_base. */
  a: number | null;
  /** R — Supressão de HRV: (HRV_base − HRV) / HRV_base. */
  r: number | null;
  /** S — Sobrecarga de estresse: (SI − SI_base) / SI_base. */
  s: number | null;
  /**
   * O — Penalidade de SpO₂: max(0, (97 − SpO₂) / 7).
   *
   * Único termo sem baseline: 97% é a referência fisiológica fixa. Também é o
   * único unilateral — saturação acima de 97% não é crédito, é só saturação
   * normal, então o max(0) faz parte da definição e não é um clamp defensivo.
   */
  o: number | null;
  /**
   * V — Velocidade: |BPM_t − BPM_(t−5min)| / BPM_base.
   *
   * Fica null nos primeiros 5 minutos de sessão, quando ainda não há ponto de
   * comparação na janela.
   */
  v: number | null;
}

export type IndexKey = 'cm' | 'ee' | 'pb' | 'irpt' | 'rp';

export const INDEX_KEYS: IndexKey[] = ['cm', 'ee', 'pb', 'irpt', 'rp'];

export const INDEX_LABELS: Record<IndexKey, string> = {
  cm: 'Carga mental',
  ee: 'Estabilidade emocional',
  pb: 'Prontidão biológica',
  irpt: 'Risco psicológico',
  rp: 'Rigidez psicológica',
};

export const INDEX_ABBREV: Record<IndexKey, string> = {
  cm: 'CM',
  ee: 'EE',
  pb: 'PB',
  irpt: 'IRPT',
  rp: 'RP',
};

/**
 * Um índice calculado.
 *
 * `termsUsed` não é enfeite: um IRPT de 62 com os quatro termos e um IRPT de 62
 * com só dois são afirmações de confiança muito diferentes, e sem esse campo a
 * tela não teria como distinguir.
 */
export interface IndexValue {
  /** 0–100, já clampado. */
  value: number;
  termsUsed: number;
  termsTotal: number;
}

export interface InstantIndices {
  terms: NormalizedTerms;
  cm: IndexValue | null;
  ee: IndexValue | null;
  pb: IndexValue | null;
  irpt: IndexValue | null;
  rp: IndexValue | null;
  /** Instante de aquisição da amostra que gerou estes valores. */
  timestamp: number;
}

/**
 * Faixas de cor do IRPT, conforme a tabela do guia.
 * 🟢 <30 · 🟡 30–50 · 🟠 50–70 · 🔴 >70
 */
export type IrptZone = 'baixo' | 'atencao' | 'alerta' | 'critico';

export function irptZone(value: number): IrptZone {
  if (value < 30) return 'baixo';
  if (value <= 50) return 'atencao';
  if (value <= 70) return 'alerta';
  return 'critico';
}
