import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from './src/theme/colors';
import { FONTS } from './src/theme/fonts';
import { armEvaluationCollector } from './src/wearable/evaluationCollector';
import WatchLiveCard from './src/wearable/WatchLiveCard';

/**
 * Tela única do companion PulseLab: recebe os lotes do relógio pela Wear OS
 * Data Layer (módulo nativo WearBridge), mostra as métricas ao vivo e os
 * índices derivados, e arma o coletor de avaliação que grava o conjunto
 * recebido quando o relógio usa o provedor de repetição.
 */
export default function App() {
  useEffect(() => armEvaluationCollector(), []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.title}>PulseLab</Text>
            <Text style={styles.subtitle}>Companion Wear OS · protocolo v1</Text>
          </View>
          <WatchLiveCard />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 16 },
  header: { paddingVertical: 8 },
  title: { color: COLORS.textPrimary, fontFamily: FONTS.bold, fontSize: 24 },
  subtitle: { color: COLORS.textSecondary, fontFamily: FONTS.mono, fontSize: 12, marginTop: 4 },
});
