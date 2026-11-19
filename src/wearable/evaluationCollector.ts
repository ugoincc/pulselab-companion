import { NativeModules } from 'react-native';
import { HeartRateEvent, subscribeToHeartRate } from './WearBridge';

const { WearBridge } = NativeModules;

/**
 * `providerId` do provedor de repetição. O coletor só grava enquanto ele está
 * ativo: o registro de recepção só tem sentido contra um registro de emissão,
 * e só o replay produz um (ver `EmissionLog` no relógio).
 */
const REPLAY_PROVIDER_ID = 'replay';

/**
 * Coletor de amostras recebidas — o conjunto `R` de cap6-avaliacao.tex §6.3.2.
 *
 * Grava **na camada de aplicação**, depois da ponte nativa, e não no serviço
 * receptor: o escopo do protocolo termina onde o dado se torna utilizável pela
 * aplicação, então é aqui que a latência fim a fim fecha. `jsReceivedAt` é o
 * instante que importa para a métrica; `phoneReceivedAt`, carimbado no serviço
 * nativo, viaja junto para que a travessia nativo→JS possa ser isolada.
 *
 * A gravação em si é feita pelo módulo nativo (`appendEvaluationSample`), que
 * tem acesso ao sistema de arquivos sem dependência adicional. Isso não move o
 * ponto de medição: o carimbo é tomado aqui, antes da chamada.
 */

let unsubscribe: (() => void) | null = null;
let recording = false;
let currentPath: string | null = null;

/**
 * Uma amostra como gravada no registro de recepção: tudo o que chegou, mais o
 * instante em que chegou à camada JS.
 */
export type ReceivedSample = HeartRateEvent & { jsReceivedAt: number };

function appendSample(event: HeartRateEvent, jsReceivedAt: number) {
  if (!WearBridge?.appendEvaluationSample) return;
  const sample: ReceivedSample = { ...event, jsReceivedAt };
  WearBridge.appendEvaluationSample(JSON.stringify(sample));
}

/**
 * Liga o coletor. Enquanto ativo, cada amostra do provedor de repetição é
 * carimbada e gravada; amostras de outros provedores são ignoradas, para que o
 * arquivo não misture uma sessão de avaliação com uso normal.
 *
 * Idempotente: chamar duas vezes não abre um segundo arquivo.
 *
 * `seed`, se fornecido, é a amostra que disparou o armamento (ver
 * `armEvaluationCollector`) — teria de esperar a abertura assíncrona do
 * arquivo nativo para só então ser vista por uma assinatura nova, e nesse meio
 * tempo seria perdida sem nunca ter atravessado o transporte. Uma primeira
 * medição real acusou exatamente essa perda sistemática de uma amostra por
 * execução, artefato do instrumento e não do protocolo — corrigido carimbando
 * `seed` no instante em que a própria detecção de armamento a viu, e
 * anexando-a assim que o arquivo abre, antes de assinar eventos futuros.
 */
export async function startEvaluationCollection(
  seed?: { event: HeartRateEvent; jsReceivedAt: number },
): Promise<string | null> {
  if (recording) return currentPath;
  if (!WearBridge?.startEvaluationRun) return null;

  currentPath = await WearBridge.startEvaluationRun();
  recording = true;

  if (seed) appendSample(seed.event, seed.jsReceivedAt);

  unsubscribe = subscribeToHeartRate((event: HeartRateEvent) => {
    if (event.providerId !== REPLAY_PROVIDER_ID) return;
    // Carimbo tomado antes de qualquer trabalho: o que se mede é a chegada da
    // amostra à aplicação, não o custo de serializá-la.
    appendSample(event, Date.now());
  });

  return currentPath;
}

/** Desliga o coletor e fecha o arquivo. Devolve o caminho gravado, se houve. */
export async function stopEvaluationCollection(): Promise<string | null> {
  unsubscribe?.();
  unsubscribe = null;
  recording = false;
  const path = currentPath;
  currentPath = null;
  if (WearBridge?.stopEvaluationRun) await WearBridge.stopEvaluationRun();
  return path;
}

export function isCollecting(): boolean {
  return recording;
}

/**
 * Arma o coletor: ele liga sozinho quando o relógio começa a emitir pelo
 * provedor de repetição, e desliga quando o provedor muda.
 *
 * Preferido a ligar o coletor no boot do app, que criaria um arquivo vazio a
 * cada sessão de uso normal, e a um botão na interface, que acrescentaria
 * superfície de UI a um instrumento de bancada. O gatilho é o próprio sinal de
 * que uma execução de avaliação começou.
 *
 * Devolve a função de desarme.
 */
export function armEvaluationCollector(): () => void {
  const stopWatching = subscribeToHeartRate((event: HeartRateEvent) => {
    const isReplay = event.providerId === REPLAY_PROVIDER_ID;
    if (isReplay && !recording) {
      // Carimbado aqui, não dentro de startEvaluationCollection: é o instante
      // em que esta amostra de fato chegou à aplicação, e a abertura do
      // arquivo nativo que segue é assíncrona.
      void startEvaluationCollection({ event, jsReceivedAt: Date.now() });
    } else if (!isReplay && recording) {
      void stopEvaluationCollection();
    }
  });

  return () => {
    stopWatching();
    if (recording) void stopEvaluationCollection();
  };
}
