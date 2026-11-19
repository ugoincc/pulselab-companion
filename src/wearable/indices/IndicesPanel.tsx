import { AlertTriangle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';
import { FONTS } from '../../theme/fonts';
import { ExpectancyAlertState } from './expectancyAlert';
import { IndexKey, IndexValue, InstantIndices, IrptZone, irptZone } from './types';

/**
 * Painel dos índices instantâneos, para compor dentro do card de biometria.
 *
 * O IRPT ganha destaque e cor de zona; os outros quatro ficam numa grade
 * secundária. Isso é a hierarquia do próprio guia — o risco é o número que muda
 * uma decisão, os demais explicam de onde ele veio.
 */

const ZONE_COLORS: Record<IrptZone, string> = {
  baixo: COLORS.green,
  atencao: '#facc15',
  alerta: COLORS.warning,
  critico: COLORS.error,
};

const ZONE_LABELS: Record<IrptZone, string> = {
  baixo: 'Risco baixo',
  atencao: 'Atenção',
  alerta: 'Alerta',
  critico: 'Crítico',
};

/** Índice secundário: sigla, valor e quantos termos entraram na conta. */
function SecondaryIndex({
  abbrev,
  label,
  index,
}: {
  abbrev: string;
  label: string;
  index: IndexValue | null;
}) {
  return (
    <View style={styles.secondary}>
      <Text style={styles.secondaryValue}>{index ? Math.round(index.value) : '--'}</Text>
      <Text style={styles.secondaryAbbrev}>{abbrev}</Text>
      <Text style={styles.secondaryLabel} numberOfLines={1}>
        {label}
      </Text>
      {index && index.termsUsed < index.termsTotal ? (
        <Text style={styles.partial}>
          {index.termsUsed}/{index.termsTotal}
        </Text>
      ) : null}
    </View>
  );
}

const SECONDARY: { key: Exclude<IndexKey, 'irpt'>; abbrev: string; label: string }[] = [
  { key: 'cm', abbrev: 'CM', label: 'Carga mental' },
  { key: 'ee', abbrev: 'EE', label: 'Estabilidade' },
  { key: 'pb', abbrev: 'PB', label: 'Prontidão' },
  { key: 'rp', abbrev: 'RP', label: 'Rigidez' },
];

export default function IndicesPanel({
  indices,
  expectancy,
  baselineIsGeneric,
}: {
  indices: InstantIndices;
  expectancy: ExpectancyAlertState;
  baselineIsGeneric: boolean;
}) {
  const irpt = indices.irpt;
  const zone = irpt ? irptZone(irpt.value) : null;
  const color = zone ? ZONE_COLORS[zone] : COLORS.textSecondary;

  return (
    <View style={styles.panel}>
      <View style={styles.irptRow}>
        <View>
          <Text style={styles.irptLabel}>Risco psicológico (IRPT)</Text>
          <Text style={[styles.irptZone, { color }]}>{zone ? ZONE_LABELS[zone] : 'Sem dados'}</Text>
        </View>
        <View style={styles.irptRight}>
          <Text style={[styles.irptValue, { color }]}>{irpt ? Math.round(irpt.value) : '--'}</Text>
          {irpt && irpt.termsUsed < irpt.termsTotal ? (
            <Text style={styles.partial}>
              {irpt.termsUsed}/{irpt.termsTotal} termos
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.secondaryRow}>
        {SECONDARY.map(item => (
          <SecondaryIndex
            key={item.key}
            abbrev={item.abbrev}
            label={item.label}
            index={indices[item.key]}
          />
        ))}
      </View>

      {expectancy.triggered ? (
        <View style={styles.alert}>
          <AlertTriangle size={14} color={COLORS.warning} strokeWidth={1.8} />
          <Text style={styles.alertText}>
            Alerta de expectativa — ativação e queda de HRV sustentadas há{' '}
            {Math.round(expectancy.sustainedMs / 60000)} min.
          </Text>
        </View>
      ) : null}

      {baselineIsGeneric ? (
        <Text style={styles.genericText}>
          Baseline sem repouso medido — os índices usam referência genérica. Recalibre para uma
          leitura sua.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopColor: COLORS.cardBorder,
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 12,
  },
  irptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  irptLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  irptZone: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    marginTop: 2,
  },
  irptRight: {
    alignItems: 'flex-end',
  },
  irptValue: {
    fontFamily: FONTS.monoBold,
    fontSize: 30,
    lineHeight: 34,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondary: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
  },
  secondaryValue: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.monoBold,
    fontSize: 16,
  },
  secondaryAbbrev: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 10,
  },
  secondaryLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 9,
  },
  partial: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
    fontSize: 9,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 9,
  },
  alertText: {
    color: COLORS.warning,
    fontFamily: FONTS.regular,
    fontSize: 11,
    flex: 1,
  },
  genericText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 10,
  },
});
