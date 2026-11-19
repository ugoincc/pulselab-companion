import { useEffect, useState } from 'react';
import {
  HeartRateEvent,
  ProviderCapabilities,
  ProviderCapabilitiesEvent,
  subscribeToProviderCapabilities,
} from './WearBridge';

/**
 * Registro do que cada provedor do relógio declarou saber fornecer.
 *
 * Por que um registro em módulo, e não estado de componente: a declaração chega
 * uma vez por conexão de provedor (ESPECIFICACAO-protocolo-payload-v1.md §6.3),
 * possivelmente antes de qualquer tela estar montada, e vale para todas as
 * amostras daquele `providerId` até a próxima conexão. Guardar em componente
 * significaria perdê-la a cada desmontagem e não ter como recuperá-la — o
 * relógio não reenvia.
 *
 * Guardado por `providerId`, não uma entrada só: a declaração é *do provedor*.
 * Uma amostra que chegue atrasada de um provedor anterior (uma rajada retida
 * enquanto a tela estava apagada, SENSORS.md §4.1) continua governada pela
 * declaração daquele provedor, não pela do que está ativo agora.
 */
const declarations = new Map<string, ProviderCapabilitiesEvent>();

type Listener = (event: ProviderCapabilitiesEvent) => void;
const listeners = new Set<Listener>();

let unsubscribeBridge: (() => void) | null = null;

function ensureSubscribed() {
  if (unsubscribeBridge) return;
  unsubscribeBridge = subscribeToProviderCapabilities(event => {
    // Substitui em vez de mesclar: uma nova declaração é uma nova conexão de
    // provedor, e uma capacidade que sumiu da declaração sumiu de verdade.
    declarations.set(event.providerId, event);
    listeners.forEach(listener => listener(event));
  });
}

// Assina na carga do módulo, não no primeiro uso: a declaração pode chegar
// antes de qualquer tela pedir por ela, e o bus nativo guarda só a última.
ensureSubscribed();

/**
 * A declaração daquele provedor, ou `undefined` se nenhuma chegou ainda.
 *
 * `undefined` aqui não é "não fornece nada" — é "ainda não sei". Quem consome
 * precisa tratar os dois casos separadamente; ver [isFieldStructurallyAbsent].
 */
export function capabilitiesFor(
  providerId: string,
): ProviderCapabilities | undefined {
  return declarations.get(providerId)?.capabilities;
}

/** Todas as declarações conhecidas, por `providerId`. */
export function allDeclarations(): ProviderCapabilitiesEvent[] {
  return Array.from(declarations.values());
}

/**
 * A pergunta que o contrato de capacidade existe para responder: este campo
 * está ausente porque o provedor nunca vai fornecê-lo, ou porque ainda não
 * forneceu desta vez?
 *
 * Retorna `true` só quando há declaração e ela diz que não fornece. Sem
 * declaração retorna `false` — é o lado conservador: um campo ausente é tratado
 * como possivelmente futuro, e o consumidor continua esperando por ele, em vez
 * de decidir permanentemente que não virá com base em nenhuma informação.
 */
export function isFieldStructurallyAbsent(
  providerId: string,
  field: keyof ProviderCapabilities,
): boolean {
  const declared = capabilitiesFor(providerId);
  if (!declared) return false;
  return declared[field] === false;
}

/**
 * A declaração que governa uma amostra específica — pelo `providerId` que ela
 * carrega, não pelo provedor ativo no momento em que ela foi processada.
 */
export function capabilitiesForSample(
  sample: Pick<HeartRateEvent, 'providerId'>,
): ProviderCapabilities | undefined {
  return capabilitiesFor(sample.providerId);
}

/**
 * Versão React: reavalia quando uma declaração nova chega.
 *
 * Lê o valor já guardado na inicialização do estado, para o caso comum de a
 * declaração ter chegado antes de a tela montar.
 */
export function useProviderCapabilities(
  providerId: string | undefined,
): ProviderCapabilities | undefined {
  const [capabilities, setCapabilities] = useState<
    ProviderCapabilities | undefined
  >(() => (providerId ? capabilitiesFor(providerId) : undefined));

  useEffect(() => {
    if (!providerId) {
      setCapabilities(undefined);
      return;
    }
    setCapabilities(capabilitiesFor(providerId));

    const listener: Listener = event => {
      if (event.providerId === providerId) {
        setCapabilities(event.capabilities);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [providerId]);

  return capabilities;
}

/** Só para testes: esquece tudo o que foi declarado. */
export function resetProviderCapabilities() {
  declarations.clear();
}
