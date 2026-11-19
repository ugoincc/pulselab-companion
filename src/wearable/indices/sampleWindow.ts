/**
 * Janela deslizante das amostras recentes, em memória.
 *
 * Existe por um motivo só: V compara o BPM de agora com o de 5 minutos atrás, e
 * o Alerta de Expectativa pergunta se uma condição se sustentou por 5 minutos.
 * As duas perguntas precisam de passado, nenhuma precisa de histórico — o que
 * envelhece sai. Não é log; o log das amostras é `../stress/sampleStore.ts`,
 * que grava em disco.
 */

/** Quanto de passado se guarda. 10 min cobre a janela de 5 min de V com folga. */
export const WINDOW_MS = 10 * 60 * 1000;

/**
 * Teto rígido de entradas, além da poda por tempo.
 *
 * A poda por tempo confia no `timestamp` do relógio; um relógio com relógio
 * errado (adiantado por meses, o que já aconteceu com o emulador) faria toda
 * amostra parecer recente e o buffer cresceria sem limite pela sessão inteira.
 * A 1 Hz, 10 min são ~600 entradas — 900 é folga sem deixar de ser um teto.
 */
export const MAX_ENTRIES = 900;

export interface WindowEntry {
  timestamp: number;
  bpm: number;
}

/**
 * Tolerância ao procurar a amostra de "5 minutos atrás". A entrega em rajadas
 * deixa buracos de dezenas de segundos na série (ver BASELINE_GRACE_MS), então
 * exigir o instante exato faria V simplesmente não existir na maior parte do
 * tempo. 60 s é meio período da própria janela de comparação.
 */
export const LOOKBACK_TOLERANCE_MS = 60 * 1000;

export class SampleWindow {
  private entries: WindowEntry[] = [];

  /** Registra uma amostra e descarta o que saiu da janela. */
  add(timestamp: number, bpm: number): void {
    if (!(timestamp > 0) || !(bpm > 0)) return;

    this.entries.push({ timestamp, bpm });

    const cutoff = timestamp - WINDOW_MS;
    let firstKept = 0;
    while (firstKept < this.entries.length && this.entries[firstKept].timestamp < cutoff) {
      firstKept += 1;
    }
    if (firstKept > 0) this.entries = this.entries.slice(firstKept);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * BPM da amostra mais próxima de `at`, ou null se a mais próxima estiver a
   * mais de [LOOKBACK_TOLERANCE_MS] dele.
   *
   * Varredura linear: são no máximo [MAX_ENTRIES] entradas, uma vez por amostra
   * a 1 Hz. Busca binária seria mais rápida e menos óbvia, e nada aqui está
   * perto de importar para desempenho.
   */
  bpmNear(at: number): number | null {
    let best: WindowEntry | null = null;
    let bestDistance = Infinity;

    for (const entry of this.entries) {
      const distance = Math.abs(entry.timestamp - at);
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }

    return best != null && bestDistance <= LOOKBACK_TOLERANCE_MS ? best.bpm : null;
  }
}
