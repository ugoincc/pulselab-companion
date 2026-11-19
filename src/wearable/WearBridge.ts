import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * Uma amostra de biometria vinda do relógio (1/s).
 *
 * Os nomes dos campos são o contrato com `SensorBundle` no app do relógio —
 * renomear um aqui exige mudar os dois repositórios junto.
 *
 * Campos opcionais ficam `undefined` (não `0`) enquanto o sensor correspondente
 * não entregou leitura válida: o índice composto precisa distinguir "sensor sem
 * leitura" de "leitura igual a zero".
 */
export type HeartRateEvent = {
  bpm: number;
  /** RMSSD sobre a janela de IBI, em ms. */
  hrv?: number;
  spo2?: number;
  skinTemp?: number;
  /**
   * Índice de estresse de Baevsky sobre a mesma janela de IBI, na escala bruta
   * (sem o sqrt do Kubios — as faixas publicadas de Baevsky, ~50–150 para baixo
   * estresse, descrevem o índice bruto).
   */
  baevskySI?: number;
  /** Nível tônico de condutância da pele (SCL), em µS. */
  edaTonic?: number;
  /** Respostas de condutância da pele (SCR) por minuto. */
  edaScrPerMin?: number;
  /** true quando o acelerômetro viu movimento nessa janela (gate de artefato). */
  motionFlag: boolean;
  timestamp: number;
  /**
   * ESPECIFICACAO-protocolo-payload-v1.md §2/§4 — campos novos da v1.
   * Versão do contrato de payload (§2).
   */
  schemaVersion: number;
  /**
   * Monotônico por amostra emitida pelo provedor no relógio, reinicia em 0 a
   * cada reconexão do provedor (§5). Perda dentro de uma rajada é detectável
   * por um buraco na sequência.
   */
  sequenceNumber: number;
  /** Epoch ms de quando o ciclo de SpO2 que produziu `spo2` de fato completou — distinto de `timestamp`. */
  spo2MeasuredAt?: number;
  /** Idem, para `skinTemp`. */
  skinTempMeasuredAt?: number;
  /** Qual `SensorProvider` no relógio originou a leitura (ex.: `"samsung-shs-sdk"`). */
  providerId: string;
  /**
   * Epoch ms carimbado no celular por `WearableHeartRateListenerService.onMessageReceived`
   * — chegada ao Data Layer, não à camada JS (essa segunda travessia não é medida aqui; ver §7).
   */
  phoneReceivedAt: number;
};

/**
 * O que o provedor no relógio declara ser capaz de fornecer
 * (ESPECIFICACAO-protocolo-payload-v1.md §6.3).
 *
 * Não existe `providesBpm`: `bpm` é não-nulável no contrato, então todo
 * provedor fornece por definição.
 *
 * A razão de isto existir é que `undefined` sozinho é ambíguo. Um `hrv` ausente
 * vindo do `samsung-shs-sdk` significa "a janela de IBI ainda não encheu,
 * pergunte de novo"; vindo do `health-services` significa "nunca, essa API não
 * expõe IBI". Mesmo valor no fio, decisões diferentes — e é a capacidade
 * declarada, não o valor, que distingue os dois casos.
 */
export type ProviderCapabilities = {
  providesHrv: boolean;
  providesBaevskySI: boolean;
  providesSpo2: boolean;
  providesSkinTemp: boolean;
  providesEda: boolean;
  providesMotionFlag: boolean;
};

/**
 * Uma declaração de capacidade, enviada uma vez por conexão de provedor — não
 * por amostra.
 */
export type ProviderCapabilitiesEvent = {
  /** Qual provedor declarou; casa com `HeartRateEvent.providerId`. */
  providerId: string;
  capabilities: ProviderCapabilities;
  /** Epoch ms carimbado no celular ao receber a declaração. */
  receivedAt: number;
};

const { WearBridge } = NativeModules;

// WearBridge is null on iOS / when the native module isn't linked yet (e.g. before a native rebuild).
const emitter = WearBridge ? new NativeEventEmitter(WearBridge) : null;

export function subscribeToHeartRate(onEvent: (event: HeartRateEvent) => void) {
  const subscription = emitter?.addListener('onHeartRate', onEvent);
  return () => subscription?.remove();
}

/**
 * Assina as declarações de capacidade. Chega uma por conexão de provedor, e
 * vale para todas as amostras daquele `providerId` até a próxima.
 *
 * Na prática, prefira `capabilitiesFor`/`useProviderCapabilities` de
 * `./providerCapabilities`: assinar aqui direto só entrega o evento, e quem
 * assinar depois de a declaração ter chegado não a vê.
 */
export function subscribeToProviderCapabilities(
  onEvent: (event: ProviderCapabilitiesEvent) => void,
) {
  const subscription = emitter?.addListener('onProviderCapabilities', onEvent);
  return () => subscription?.remove();
}
