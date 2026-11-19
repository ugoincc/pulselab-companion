# PulseLab — aplicativo *companion* (Android / React Native)

Receptor, no celular, do protocolo de comunicação e do formato de *payload* propostos
no Trabalho de Conclusão de Curso:

> CORDEIRO, Hugo Gustavo. **Especificação de um Protocolo de Comunicação e Payload
> Adaptável para Coleta de Dados Biométricos entre Smartwatches Wear OS e Aplicações
> Móveis.** Trabalho de Conclusão de Curso (Bacharelado em Ciência da Computação) —
> Universidade Estadual do Oeste do Paraná (Unioeste), Foz do Iguaçu, 2026.

O emissor (aplicativo do relógio) e a especificação normativa do contrato estão em
[`ugoincc/pulselab-wear`](https://github.com/ugoincc/pulselab-wear) —
ver `ESPECIFICACAO-protocolo-payload-v1.md` naquele repositório.

Este é um aplicativo mínimo, de tela única, que contém **apenas o módulo PulseLab**.
O módulo foi desenvolvido originalmente integrado a outro aplicativo; aqui ele roda
isolado, sem autenticação, rede ou qualquer outra funcionalidade.

## Papel no protocolo

```
RELÓGIO                         CELULAR (este repositório)
                  Data Layer    ┌──────────────────────────────────────────────┐
/sensor/capabilities ─────────▶ │ WearableHeartRateListenerService (Kotlin)    │
/sensor/batch ────────────────▶ │  └ carimba phoneReceivedAt                   │
  (1 mensagem por rajada,       │  └ HeartRateEventBus                         │
   N amostras SensorBundle)     │ WearBridgeModule (Kotlin, ponte RN)          │
                                │  └ desempacota o lote → 1 evento por amostra │
                                │ WearBridge.ts → JS                           │
                                │  ├ providerCapabilities: declaração por      │
                                │  │  provedor (ausente ≠ não suportado)       │
                                │  ├ WatchLiveCard / IndicesPanel: exibição    │
                                │  ├ stress/: baseline e índice composto       │
                                │  └ evaluationCollector: registro R da        │
                                │     avaliação (carimba jsReceivedAt)         │
                                └──────────────────────────────────────────────┘
```

| Camada | Arquivos |
|---|---|
| Recepção nativa (Data Layer) | `android/app/src/main/java/br/unioeste/pulselab/wearable/WearableHeartRateListenerService.kt`, `WearMessagePaths.kt`, `HeartRateEventBus.kt` |
| Ponte nativo → JS (desempacota o lote) | `wearable/WearBridgeModule.kt`, `WearBridgePackage.kt` (registrado em `MainApplication.kt`) |
| Registro de recepção da avaliação | `wearable/EvaluationLog.kt`, `src/wearable/evaluationCollector.ts` |
| Tipos do contrato e assinatura de eventos | `src/wearable/WearBridge.ts`, `src/wearable/providerCapabilities.ts`, `src/wearable/useWearHeartRate.ts` |
| Índices e estresse composto | `src/wearable/indices/`, `src/wearable/stress/` |
| Interface | `App.tsx`, `src/wearable/WatchLiveCard.tsx`, `src/wearable/indices/IndicesPanel.tsx` |

Os nomes de campo são idênticos aos do relógio: o desempacotamento é feito por nome,
e campos ausentes ou nulos permanecem indefinidos no JavaScript, em vez de virarem
zero. Um `sequenceNumber` menor que o anterior indica reconexão do provedor, não
reordenamento.

## Requisito da Data Layer: mesmo `applicationId` e mesma assinatura

A Wear OS Data Layer só entrega mensagens entre aplicativos com o **mesmo
`applicationId` e o mesmo certificado** nos dois aparelhos. Por isso este
aplicativo usa:

- `applicationId = br.unioeste.pulselab`, o mesmo do aplicativo do relógio;
- `android/app/debug.keystore`, a keystore de debug padrão do React Native
  (senha `android`), idêntica a `wear/debug.keystore` no repositório do relógio.
  Ela é versionada de propósito e assina tanto o build de debug quanto o de
  *release*.

Consequência prática: no celular este app ocupa o mesmo pacote de qualquer outro
build com esse `applicationId` — instalar um substitui o outro. Para trocar o
identificador, altere-o de forma consistente nos dois repositórios.

## Compilação e execução

Requisitos: Node.js 20+, JDK 17, Android SDK (API 36) e um celular Android
pareado a um Galaxy Watch com o aplicativo do relógio instalado.

```bash
npm install
```

APK autônomo (JS embutido, sem servidor de desenvolvimento):

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Desenvolvimento com recarga (Metro):

```bash
npx expo run:android
```

A pasta `android/` foi gerada por `expo prebuild` (Expo SDK 54, React Native 0.81)
e depois editada à mão: módulo `wearable/`, registro do `WearBridgePackage`, serviço
e `intent-filter` no `AndroidManifest.xml` e a dependência
`play-services-wearable` em `android/app/build.gradle`. **Não rode
`expo prebuild --clean`**, que descartaria essas alterações.

Uso: abra o app no celular e inicie a sessão no relógio. O cartão mostra as
métricas ao vivo, o provedor ativo e sua declaração de capacidades.

## Reproduzindo a avaliação

Quando o relógio usa o provedor `replay`, o coletor de avaliação grava cada amostra
recebida (com `phoneReceivedAt` e `jsReceivedAt`) em
`/sdcard/Android/data/br.unioeste.pulselab/files/eval/received-<data>.ndjson`.
Recolha esse arquivo e o registro de emissão do relógio e concilie-os com
`tools/reconcile.py` do repositório do relógio:

```bash
adb pull /sdcard/Android/data/br.unioeste.pulselab/files/eval/ celular/
python3 tools/reconcile.py emitted-replay-<data>.ndjson celular/eval/received-<data>.ndjson
```

Mantenha este app aberto entre execuções: reiniciá-lo força a reconexão da Data
Layer e introduz uma perda espúria de ~10 s no início da execução seguinte (ver
`tools/factorial-run/README.md` no repositório do relógio).
