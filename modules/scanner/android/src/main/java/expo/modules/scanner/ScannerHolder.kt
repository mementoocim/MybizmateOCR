package expo.modules.scanner

/** Thrown when a scan is asked for after the module was destroyed (React was torn down). */
internal class ScannerClosedException : IllegalStateException("The scanner was closed")

/**
 * Owns the one native scanner. Each use holds the lock for its whole length, so close() waits for a scan in flight
 * instead of freeing the scanner under it (a native crash), and a use after close() fails instead of creating a
 * scanner that nothing would free. Scans already run one at a time (Expo's queue and the core's mutex), so the lock
 * costs nothing; close() waits for at most one scan.
 */
internal class ScannerHolder<H : Any>(private val create: () -> H, private val destroy: (H) -> Unit) {
  private val lock = Any()
  private var handle: H? = null
  private var closed = false

  /** How long creating the scanner took (ms), once it has been created: the speed test's "Starting the scanner". */
  @Volatile
  var loadMs: Double? = null
    private set

  fun <T> use(block: (H) -> T): T = synchronized(lock) {
    if (closed) throw ScannerClosedException()
    block(
      handle ?: run {
        val t0 = System.nanoTime()
        create().also {
          handle = it
          loadMs = (System.nanoTime() - t0) / 1e6
        }
      },
    )
  }

  fun close() = synchronized(lock) {
    closed = true
    handle?.let(destroy)
    handle = null
  }
}
