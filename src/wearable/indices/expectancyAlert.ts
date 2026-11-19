import { NormalizedTerms } from './types';

/**
 * Alerta de Expectativa.
 *
 * Dispara quando ativação cardíaca e supressão de HRV estão altas *ao mesmo
 * tempo e de forma sustentada* — o padrão de antecipação ansiosa, distinto do
 * susto momentâneo que qualquer notificação de celular produz. Toda a regra está
 * na palavra sustentada: sem ela, o alerta tocaria a cada espirro.
 */

export const A_THRESHOLD = 0.15;
export const R_THRESHOLD = 0.2;

/** Por quanto tempo a condição precisa se manter antes de virar alerta. */
export const SUSTAINED_MS = 5 * 60 * 1000;

/**
 * Silêncio a partir do qual a contagem recomeça do zero.
 *
 * O relógio sai do pulso, o Bluetooth cai, a tela dorme e a entrega atrasa. Sem
 * este corte, uma condição vista às 10h00 e de novo às 10h40 contaria como 40
 * minutos sustentados — e os 39 minutos sem evidência nenhuma seriam justamente
 * o que faria o alerta parecer grave.
 */
export const MAX_GAP_MS = 90 * 1000;

export interface ExpectancyAlertState {
  /** A condição está valendo agora. */
  active: boolean;
  /** Há quanto tempo a condição se mantém ininterrupta (0 quando não vale). */
  sustainedMs: number;
  /** A condição se manteve tempo suficiente: é isto que a tela mostra. */
  triggered: boolean;
}

export const IDLE_ALERT: ExpectancyAlertState = {
  active: false,
  sustainedMs: 0,
  triggered: false,
};

/**
 * Acompanha a condição ao longo do tempo. Uma instância por sessão.
 *
 * Guarda dois instantes, não a série: quando a condição começou e quando foi
 * vista pela última vez. A janela deslizante de amostras existe para V; aqui ela
 * seria peso morto.
 */
export class ExpectancyAlertTracker {
  private since: number | null = null;
  private lastSeen = 0;

  /** Alimenta com os termos de uma amostra e devolve o estado resultante. */
  update(terms: NormalizedTerms, at: number): ExpectancyAlertState {
    const holds = terms.a != null && terms.r != null && terms.a > A_THRESHOLD && terms.r > R_THRESHOLD;

    if (!holds) {
      this.since = null;
      this.lastSeen = at;
      return IDLE_ALERT;
    }

    if (this.since == null || at - this.lastSeen > MAX_GAP_MS) this.since = at;
    this.lastSeen = at;

    const sustainedMs = Math.max(0, at - this.since);
    return { active: true, sustainedMs, triggered: sustainedMs >= SUSTAINED_MS };
  }

  reset(): void {
    this.since = null;
    this.lastSeen = 0;
  }
}
