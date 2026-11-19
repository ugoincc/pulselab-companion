package br.unioeste.pulselab.wearable

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val TAG = "EvaluationLog"

/**
 * The received-sample register of the evaluation — the set `R` of
 * cap6-avaliacao.tex §6.3.2, the counterpart of the watch's `EmissionLog`.
 *
 * One JSON object per line, appended as samples arrive. Written under the app's
 * external files dir so `adb pull` reaches it without root, mirroring where the
 * watch writes its emission log.
 *
 * The file is written natively but the *timestamps in it are stamped in
 * JavaScript*, and that split is the whole point rather than an implementation
 * detail: the protocol's scope ends where the data becomes usable by the
 * application (cap4 §4.1), so end-to-end latency has to close at the JS layer.
 * Persisting from Kotlin only avoids adding a filesystem dependency to a
 * JS-side collector; it does not move the measurement point.
 */
class EvaluationLog(private val context: Context) {

    private var writer: FileWriter? = null
    private var path: String? = null

    /**
     * Opens a new run file and returns its absolute path. Closes any previous
     * one — a run that silently kept appending to the last run's file would
     * produce a set `R` spanning two experimental conditions.
     */
    @Synchronized
    fun start(): String {
        stop()
        val dir = File(context.getExternalFilesDir(null), "eval").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val file = File(dir, "received-$stamp.ndjson")
        writer = FileWriter(file, true)
        path = file.absolutePath
        Log.i(TAG, "Recording received samples to ${file.absolutePath}")
        return file.absolutePath
    }

    /**
     * Appends one already-serialised sample. Flushed per line: a run that ends
     * with the process being killed still leaves every sample it acknowledged
     * on disk, which matters because an unflushed tail is indistinguishable
     * from transport loss when the two registers are reconciled.
     */
    @Synchronized
    fun append(line: String) {
        val target = writer ?: return
        try {
            target.write(line)
            target.write("\n")
            target.flush()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to append evaluation sample", e)
        }
    }

    @Synchronized
    fun stop(): String? {
        val finished = path
        try {
            writer?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close evaluation log", e)
        }
        writer = null
        path = null
        if (finished != null) Log.i(TAG, "Closed evaluation log $finished")
        return finished
    }

    @Synchronized
    fun isRecording(): Boolean = writer != null
}
