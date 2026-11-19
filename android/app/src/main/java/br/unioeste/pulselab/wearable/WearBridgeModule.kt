package br.unioeste.pulselab.wearable

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val EVENT_HEART_RATE = "onHeartRate"
private const val EVENT_CAPABILITIES = "onProviderCapabilities"

class WearBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        scope.launch {
            HeartRateEventBus.events.collect { rawJson ->
                emitBatch(rawJson)
            }
        }
        scope.launch {
            HeartRateEventBus.capabilities.collect { rawJson ->
                emitCapabilities(rawJson)
            }
        }
    }

    override fun getName(): String = "WearBridge"

    /**
     * Unwraps one batch message into individual JS events.
     *
     * The watch sends one message per sensor burst (`{"samples":[...]}`) because
     * with the screen dozing the platform withholds delivery and hands it up to 66
     * samples at once — one Data Layer message each would be a burst of ~66 in
     * under a second. Unwrapping here keeps that entirely off the JS side: the
     * `onHeartRate` listener still receives one event per sample, in order, so
     * nothing in TypeScript had to change.
     *
     * Each sample carries its own true acquisition timestamp, so a late batch is
     * still a faithful 1 Hz series — consumers must trust `timestamp`, not arrival
     * time.
     */
    private fun emitBatch(rawJson: String) {
        val samples = try {
            JSONObject(rawJson).optJSONArray("samples") ?: return
        } catch (e: Exception) {
            return
        }

        for (i in 0 until samples.length()) {
            samples.optJSONObject(i)?.let(::emit)
        }
    }

    private fun emit(json: JSONObject) {
        // Field names mirror br.unioeste.pulselab.wear.model.SensorBundle on the watch.
        // Absent/null stays absent on the JS side (undefined) rather than becoming
        // 0 — a missing sensor reading and a reading of zero are not the same
        // thing, and the composite stress index has to tell them apart.
        val params = Arguments.createMap().apply {
            putDouble("bpm", json.optDouble("bpm"))
            if (json.hasValue("hrv")) putInt("hrv", json.getInt("hrv"))
            if (json.hasValue("spo2")) putInt("spo2", json.getInt("spo2"))
            if (json.hasValue("skinTemp")) putDouble("skinTemp", json.getDouble("skinTemp"))
            if (json.hasValue("baevskySI")) putDouble("baevskySI", json.getDouble("baevskySI"))
            if (json.hasValue("edaTonic")) putDouble("edaTonic", json.getDouble("edaTonic"))
            if (json.hasValue("edaScrPerMin")) putInt("edaScrPerMin", json.getInt("edaScrPerMin"))
            putBoolean("motionFlag", json.optBoolean("motionFlag", false))
            putDouble("timestamp", json.optDouble("timestamp"))
            // ESPECIFICACAO-protocolo-payload-v1.md §4 — v1 additions.
            putInt("schemaVersion", json.optInt("schemaVersion", 1))
            putDouble("sequenceNumber", json.optDouble("sequenceNumber"))
            if (json.hasValue("spo2MeasuredAt")) putDouble("spo2MeasuredAt", json.getDouble("spo2MeasuredAt"))
            if (json.hasValue("skinTempMeasuredAt")) putDouble("skinTempMeasuredAt", json.getDouble("skinTempMeasuredAt"))
            putString("providerId", json.optString("providerId"))
            if (json.hasValue("phoneReceivedAt")) putDouble("phoneReceivedAt", json.getDouble("phoneReceivedAt"))
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_HEART_RATE, params)
    }

    /**
     * Forwards one capability declaration to JS, unchanged in meaning.
     *
     * Sent once per provider connection, not per sample
     * (ESPECIFICACAO-protocolo-payload-v1.md §6.3). Its own event rather than a
     * field on every `onHeartRate`: repeating a constant declaration on a 1 Hz
     * stream — up to 66 times inside one screen-off burst — would pay for it
     * over and over to say nothing new.
     *
     * The booleans are read by name, not copied wholesale, so a capability the
     * watch adds later arrives as `undefined` on an old phone build instead of
     * as an untyped extra key. Missing reads as `false`: a provider that does
     * not say it supplies a channel is treated as not supplying it, which is
     * the safe direction — the consumer ignores a field it might have used,
     * rather than trusting one that will never come.
     */
    private fun emitCapabilities(rawJson: String) {
        val root = try {
            JSONObject(rawJson)
        } catch (e: Exception) {
            return
        }
        val providerId = root.optString("providerId")
        val declared = root.optJSONObject("capabilities") ?: return
        if (providerId.isEmpty()) return

        val capabilities = Arguments.createMap().apply {
            listOf(
                "providesHrv", "providesBaevskySI", "providesSpo2",
                "providesSkinTemp", "providesEda", "providesMotionFlag"
            ).forEach { key -> putBoolean(key, declared.optBoolean(key, false)) }
        }

        val params = Arguments.createMap().apply {
            putString("providerId", providerId)
            putMap("capabilities", capabilities)
            // Stamped here rather than on the watch: what the consumer needs to
            // know is which samples this declaration governs, and it governs
            // everything that arrives after it, on this phone's clock.
            putDouble("receivedAt", System.currentTimeMillis().toDouble())
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_CAPABILITIES, params)
    }

    /** True when the key is present and not JSON null — i.e. carries a real value. */
    private fun JSONObject.hasValue(key: String): Boolean = has(key) && !isNull(key)

    // --- Registro de amostras recebidas (avaliação experimental) --------------
    //
    // O conjunto `R` de cap6-avaliacao.tex §6.3.2, contraparte do `EmissionLog`
    // do relógio. A escrita é nativa apenas para não acrescentar dependência de
    // sistema de arquivos ao lado JS; os instantes gravados são carimbados em
    // JavaScript, que é onde o escopo do protocolo termina (cap4 §4.1) e,
    // portanto, onde a latência fim a fim precisa fechar.

    private val evaluationLog = EvaluationLog(reactContext)

    /** Abre um arquivo de execução e devolve o caminho absoluto. */
    @ReactMethod
    fun startEvaluationRun(promise: Promise) {
        try {
            promise.resolve(evaluationLog.start())
        } catch (e: Exception) {
            promise.reject("eval_log_start_failed", e)
        }
    }

    /** Anexa uma amostra já serializada em JSON pelo lado JS. */
    @ReactMethod
    fun appendEvaluationSample(line: String) {
        evaluationLog.append(line)
    }

    /** Fecha a execução; devolve o caminho do arquivo, ou null se não havia. */
    @ReactMethod
    fun stopEvaluationRun(promise: Promise) {
        promise.resolve(evaluationLog.stop())
    }

    // Required by NativeEventEmitter on Android, even with no-op bodies.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun invalidate() {
        evaluationLog.stop()
        scope.cancel()
        super.invalidate()
    }
}
