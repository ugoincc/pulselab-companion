package br.unioeste.pulselab.wearable

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

// Bridges the WearableListenerService (runs on a binder thread, no React context)
// to WearBridgeModule (collects on its own coroutine scope and emits to JS).
object HeartRateEventBus {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val events: SharedFlow<String> = _events

    /**
     * Capability announcements travel on their own flow rather than being
     * multiplexed onto [events] with a discriminator: they arrive once per
     * provider connection, not per sample, and merging them would put a branch
     * in the hot path for a message that shows up once a run.
     *
     * `replay = 1` because the announcement is sent when the watch starts
     * collecting, which can be before React Native has finished starting and
     * before WearBridgeModule exists to hear it. Without the replay that
     * declaration would be lost for the whole session, and every sample of the
     * run would arrive with no way to tell a structurally-absent field from a
     * momentarily-missing one.
     */
    private val _capabilities = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 4)
    val capabilities: SharedFlow<String> = _capabilities

    fun publish(rawJson: String) {
        _events.tryEmit(rawJson)
    }

    fun publishCapabilities(rawJson: String) {
        _capabilities.tryEmit(rawJson)
    }
}
