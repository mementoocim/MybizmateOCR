package expo.modules.scanner

import kotlin.math.hypot
import kotlin.math.min

/** One camera frame's detection (NativeScanner.detectFrame), in the upright frame's pixels. */
internal class Detection(val form: String, val outline: FloatArray, val sharpness: Double, val sharpMin: Double) {
  val sharp: Boolean
    get() = sharpness >= sharpMin
}

/** The forms NativeScanner.detectFrame gives by number, in its order (scanner_jni.cpp). */
private val FRAME_FORMS = listOf("sales_invoice", "service_invoice", "bir_2307")

/** NativeScanner.detectFrame's result, [form, the outline's tl, tr, br, bl as x, y, sharpness, sharpMin], as a Detection. */
internal fun detectionOf(f: FloatArray) =
  Detection(FRAME_FORMS[f[0].toInt()], f.copyOfRange(1, 9), f[9].toDouble(), f[10].toDouble())

/** TAKEN: a photo went out, and Auto waits for that sheet to leave the frame (TypeScript's "taken"). */
internal enum class CameraStatus { LOOKING, HOLDING, BLURRY, FOUND, CAPTURE, TAKEN }

/** What one frame means: the status to show, how settled the outline is (0..1), and whether to take the photo now. */
internal data class Step(val status: CameraStatus, val held: Float, val capture: Boolean)

/**
 * When the camera takes the photo by itself: a port of the test app's CameraActivity.onDetection (:460-506). The
 * outline settles once it has held still (every corner within shift x the frame's width of where it settled, same
 * form) for holdMs and at least minFrames frames. It then takes the photo on a sharp frame, or anyway sharpWaitMs
 * later (the scan then flags a blurry photo). After a photo it waits for photoTaken() or reset(). Once a photo has gone
 * to TypeScript (photoTaken), the camera keeps shooting: Auto takes the next sheet only after no outline has shown for
 * clearMs, so it never takes the same sheet twice while the person swaps it.
 */
internal class AutoCapture(
  private val shift: Double = 0.03,
  private val holdMs: Long = 800,
  private val minFrames: Int = 3,
  private val sharpWaitMs: Long = 2000,
  private val clearMs: Long = 500,
) {
  private var anchor: FloatArray? = null
  private var form: String? = null
  private var steady = 0
  private var since = 0L
  private var taken = false
  private var waiting = false
  private var clearSince: Long? = null  // while waiting: when this stretch with no outline began

  fun onFrame(d: Detection?, frameWidth: Int, nowMs: Long, auto: Boolean): Step {
    if (taken) return Step(CameraStatus.CAPTURE, 1f, false)
    if (waiting) {  // a photo went out: the sheet must leave the frame first
      if (d != null) {
        clearSince = null
        return Step(if (auto) CameraStatus.TAKEN else CameraStatus.FOUND, 0f, false)
      }
      val gone = clearSince ?: nowMs.also { clearSince = it }
      if (nowMs - gone < clearMs) return Step(CameraStatus.LOOKING, 0f, false)
      waiting = false  // gone long enough: look as at the start
      clearSince = null
    }
    if (d == null) {
      anchor = null
      form = null
      steady = 0
      return Step(CameraStatus.LOOKING, 0f, false)
    }
    val a = anchor
    var still = a != null && d.form == form
    if (still) {
      for (k in 0 until 4) {
        val moved = hypot((d.outline[2 * k] - a!![2 * k]).toDouble(), (d.outline[2 * k + 1] - a[2 * k + 1]).toDouble())
        if (moved >= shift * frameWidth) still = false
      }
    }
    if (still) {
      steady++
    } else {  // moved (or just found): it settles here
      steady = 1
      anchor = d.outline.copyOf()
      since = nowMs
    }
    form = d.form
    val held = min(1f, (nowMs - since) / holdMs.toFloat())
    val settled = held >= 1f && steady >= minFrames
    if (!auto) return Step(CameraStatus.FOUND, held, false)
    if (settled && (d.sharp || nowMs - since >= holdMs + sharpWaitMs)) {
      taken = true
      return Step(CameraStatus.CAPTURE, held, true)
    }
    return Step(if (settled) CameraStatus.BLURRY else CameraStatus.HOLDING, held, false)
  }

  /** The photo went to TypeScript: Auto takes no other until no outline has shown for clearMs. */
  fun photoTaken() {
    reset()
    waiting = true
  }

  /** The hold starts over; a photo's wait stays, so a stop and start never retakes the sheet in view. */
  fun reset() {
    anchor = null
    form = null
    steady = 0
    since = 0L
    taken = false
    clearSince = null  // the time the camera was off isn't time without the sheet
  }
}
