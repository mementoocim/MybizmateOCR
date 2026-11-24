package expo.modules.scanner

/** One window of the camera's form checks: how many there were, how long it lasted, and whether a read ran in it. */
internal data class CheckWindow(val checks: Int, val elapsedMs: Long, val reading: Boolean)

/**
 * The camera's form checks, counted per window of at least windowMs, for debug builds: the camera-first design's §5
 * compares the rate while a photo or PDF is read with the rate while none is. Figures only, never what a check found. A
 * window ends at the first check windowMs or more after its start, so a stall shows as one long window.
 */
internal class CheckRate(private val windowMs: Long = 1000) {
  private var start: Long? = null  // the window's first check; null before any check
  private var checks = 0
  private var readRan = false

  /** Counts a check. Once a window has passed, returns it, and this check starts the next one; otherwise null. */
  fun onCheck(nowMs: Long, reading: Boolean): CheckWindow? {
    val began = start
    val window = if (began != null && nowMs - began >= windowMs) CheckWindow(checks, nowMs - began, readRan) else null
    if (began == null || window != null) {
      start = nowMs
      checks = 0
      readRan = false
    }
    checks++
    readRan = readRan || reading
    return window
  }
}
