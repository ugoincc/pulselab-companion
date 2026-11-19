import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';
import { FONTS } from '../../theme/fonts';
import { CaptureState } from './useStressSession';
import { FEATURE_LABELS, FEATURE_KEYS } from './types';

/**
 * Captura da baseline de repouso (5 min), como modal.
 *
 * É modal e não tela justamente para o módulo do relógio continuar autocontido:
 * não precisa entrar no stack de navegação do `App.tsx`.
 */

interface Props {
  capture: CaptureState | null;
  isLive: boolean;
  onCancel: () => void;
}

function formatRemaining(elapsedMs: number, durationMs: number): string {
  const remaining = Math.max(0, durationMs - elapsedMs);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function BaselineCaptureModal({ capture, isLive, onCancel }: Props) {
  if (!capture) return null;

  const progress = Math.min(1, capture.elapsedMs / capture.durationMs);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Calibrando repouso</Text>
          <Text style={styles.subtitle}>
            Fique sentado e parado até o fim da contagem. Esta medida vira a
            referência com a qual todo o resto da sessão é comparado.
          </Text>

          <Text style={styles.timer}>{formatRemaining(capture.elapsedMs, capture.durationMs)}</Text>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>

          {capture.draining ? (
            <Text style={styles.subtitle}>
              Janela concluída — já pode se mexer. Esperando o relógio entregar as
              últimas amostras: com a tela dele apagada elas chegam em rajada, com
              até um minuto de atraso.
            </Text>
          ) : null}

          {!isLive ? (
            <Text style={styles.warning}>
              Sem sinal do relógio. A contagem continua, mas nenhuma amostra está
              sendo coletada.
            </Text>
          ) : null}

          {capture.rejected > 0 ? (
            <Text style={styles.warning}>
              {capture.rejected} amostra{capture.rejected > 1 ? 's' : ''} descartada
              {capture.rejected > 1 ? 's' : ''} por movimento.
            </Text>
          ) : null}

          <View style={styles.features}>
            {FEATURE_KEYS.map(key => {
              const ready = capture.readyFeatures.includes(key);
              return (
                <View key={key} style={styles.featureRow}>
                  <View style={[styles.dot, ready ? styles.dotReady : styles.dotPending]} />
                  <Text style={[styles.featureLabel, ready && styles.featureLabelReady]}>
                    {FEATURE_LABELS[key]}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.note}>
            Features sem amostras suficientes ficam de fora da baseline — o índice
            se recompõe com as restantes.
          </Text>

          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 18,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  timer: {
    color: COLORS.green,
    fontFamily: FONTS.monoBold,
    fontSize: 40,
    textAlign: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.green,
  },
  warning: {
    color: COLORS.warning,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  features: {
    gap: 6,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotReady: {
    backgroundColor: COLORS.green,
  },
  dotPending: {
    backgroundColor: '#555',
  },
  featureLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  featureLabelReady: {
    color: COLORS.textPrimary,
  },
  note: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
});
