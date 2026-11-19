package br.unioeste.pulselab.wearable

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class WearableHeartRateListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == WearMessagePaths.SENSOR_CAPABILITIES) {
            // Not stamped with a receipt instant: a capability declaration is
            // not a sample, carries no sequence number, and takes no part in the
            // latency or loss metrics.
            HeartRateEventBus.publishCapabilities(String(event.data, Charsets.UTF_8))
            return
        }
        if (event.path == WearMessagePaths.SENSOR_BATCH) {
            // ESPECIFICACAO-protocolo-payload-v1.md §4: phoneReceivedAt is stamped
            // here, at message processing — not at the later native→JS handoff in
            // WearBridgeModule (§7 covers that boundary separately, as a possible
            // future jsReceivedAt). One receipt instant per message, applied to
            // every sample in the batch — the message arrived once, even if it
            // carries several samples from a burst.
            val phoneReceivedAt = System.currentTimeMillis()
            HeartRateEventBus.publish(withPhoneReceivedAt(String(event.data, Charsets.UTF_8), phoneReceivedAt))
        }
    }

    private fun withPhoneReceivedAt(rawJson: String, phoneReceivedAt: Long): String {
        val root = try {
            JSONObject(rawJson)
        } catch (e: Exception) {
            return rawJson
        }
        val samples = root.optJSONArray("samples") ?: return rawJson
        for (i in 0 until samples.length()) {
            samples.optJSONObject(i)?.put("phoneReceivedAt", phoneReceivedAt)
        }
        return root.toString()
    }
}
