import { Activity, Watch } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme/colors';
import { FONTS } from '../theme/fonts';
import IndicesPanel from './indices/IndicesPanel';
import BaselineCaptureModal from './stress/BaselineCaptureModal';
import { stressBand, StressBand } from './stress/compositeStress';
import { CompositeStress } from './stress/types';
import { useStressSession } from './stress/useStressSession';

// ─── Metric cell ──────────────────────────────────────────────────────────────

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
}

function Metric({ label, value, unit }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ─── Índice composto ──────────────────────────────────────────────────────────

const BAND_COLORS: Record<StressBand, string> = {
  baixo: COLORS.green,
  normal: COLORS.textPrimary,
  elevado: COLORS.warning,
};

function CompositeRow({ composite }: { composite: CompositeStress }) {
  const band = stressBand(composite.value);
  const signed = `${composite.value >= 0 ? '+' : ''}${composite.value.toFixed(2)}`;

  return (
    <View style={styles.compositeRow}>
      <View style={styles.compositeLeft}>
        <Activity size={14} color={BAND_COLORS[band]} strokeWidth={1.8} />
        <Text style={styles.compositeLabel}>Estresse composto</Text>
      </View>
      <View style={styles.compositeRight}>
        <Text style={[styles.compositeValue, { color: BAND_COLORS[band] }]}>{signed}</Text>
        {/* Quantas das 4 features entraram na conta: sem isso o número pareceria
            igualmente confiável com 4 sensores e com 1. */}
        <Text style={styles.compositeFeatures}>{composite.featuresUsed.length}/4</Text>
      </View>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

/**
 * Card de biometria em tempo real vinda do relógio (Wear Data Layer), com o
 * índice de estresse composto quando há baseline calibrada.
 * Autocontido: basta renderizar <WatchLiveCard /> em qualquer tela.
 */
export default function WatchLiveCard() {
  const {
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
  } = useStressSession();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Watch size={16} color={isLive ? COLORS.green : COLORS.textSecondary} strokeWidth={1.8} />
          <Text style={styles.title}>Biometria do relógio</Text>
        </View>
        <View style={styles.statusWrap}>
          <View style={[styles.statusDot, isLive ? styles.statusDotLive : styles.statusDotOff]} />
          <Text style={[styles.statusText, isLive && styles.statusTextLive]}>
            {isLive ? 'Ao vivo' : latest ? 'Sem sinal' : 'Aguardando'}
          </Text>
        </View>
      </View>

      {latest ? (
        <>
          <View style={styles.metricsRow}>
            <Metric label="BPM" value={String(Math.round(latest.bpm))} />
            <Metric label="HRV" value={latest.hrv != null ? String(latest.hrv) : '--'} unit="ms" />
            <Metric
              label="SI"
              value={latest.baevskySI != null ? latest.baevskySI.toFixed(0) : '--'}
            />
            <Metric label="SpO2" value={latest.spo2 != null ? String(latest.spo2) : '--'} unit="%" />
            <Metric
              label="EDA"
              value={latest.edaTonic != null ? latest.edaTonic.toFixed(2) : '--'}
              unit="µS"
            />
            <Metric
              label="Temp"
              value={latest.skinTemp != null ? latest.skinTemp.toFixed(1) : '--'}
              unit="°C"
            />
          </View>

          {latest.motionFlag ? (
            <Text style={styles.motionText}>
              Movimento detectado — esta janela não entra no índice.
            </Text>
          ) : null}

          {composite ? <CompositeRow composite={composite} /> : null}

          {indices ? (
            <IndicesPanel
              indices={indices}
              expectancy={expectancy}
              baselineIsGeneric={baselineIsGeneric}
            />
          ) : null}

          {/* Enquanto faltar qualquer um dos dois blocos há o que ganhar com uma
              calibragem — inclusive quando a baseline é antiga e não tem BPM. */}
          {!composite || !indices ? (
            <Pressable style={styles.calibrate} onPress={startCapture}>
              <Text style={styles.calibrateText}>
                {baseline ? 'Recalibrar repouso' : 'Calibrar repouso (5 min)'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.waitingText}>
          Abra o app do relógio e inicie o monitoramento.
        </Text>
      )}

      <BaselineCaptureModal capture={capture} isLive={isLive} onCancel={cancelCapture} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotLive: {
    backgroundColor: COLORS.green,
  },
  statusDotOff: {
    backgroundColor: '#555',
  },
  statusText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 11,
  },
  statusTextLive: {
    color: COLORS.green,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.monoBold,
    fontSize: 16,
  },
  metricUnit: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
    fontSize: 9,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 10,
  },
  motionText: {
    color: COLORS.warning,
    fontFamily: FONTS.regular,
    fontSize: 11,
  },
  compositeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: COLORS.cardBorder,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  compositeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  compositeLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  compositeRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  compositeValue: {
    fontFamily: FONTS.monoBold,
    fontSize: 18,
  },
  compositeFeatures: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
    fontSize: 10,
  },
  calibrate: {
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calibrateText: {
    color: COLORS.green,
    fontFamily: FONTS.semiBold,
    fontSize: 13,
  },
  waitingText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
});
