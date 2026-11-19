package br.unioeste.pulselab.wearable

object WearMessagePaths {
    // Must match br.unioeste.pulselab.wear.model.MessagePaths.SENSOR_BATCH on the watch app.
    // One message per sensor burst, carrying {"samples":[...]}.
    //
    // The watch moved off the old /sensor/data path when it started batching, so a
    // watch build that predates batching simply stops being heard rather than
    // having its single-sample payload misread as a batch.
    const val SENSOR_BATCH = "/sensor/batch"

    // Must match br.unioeste.pulselab.wear.model.MessagePaths.SENSOR_CAPABILITIES.
    // One message per provider connection, carrying
    // {"providerId": "...", "capabilities": {...}} — not repeated per sample
    // (ESPECIFICACAO-protocolo-payload-v1.md §6.3).
    //
    // Both paths are already covered by the manifest's pathPrefix="/sensor"
    // intent-filter, so no manifest change was needed here.
    const val SENSOR_CAPABILITIES = "/sensor/capabilities"
}
