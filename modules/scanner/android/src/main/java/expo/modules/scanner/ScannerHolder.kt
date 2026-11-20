package expo.modules.scanner

import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/** Thrown when a scan is asked for after the module was destroyed (React was torn down). */
internal class ScannerClosedException : IllegalStateException("The scanner was closed")

/**
 * Owns the one native scanner. Uses share a lock that close() takes alone, so close() waits for every scan or frame
 * check in flight instead of freeing the scanner under it (a native crash), and a use after close() fails instead of
 * creating a scanner that nothing would free. Uses don't wait for each other: the camera's frame checks run while a
 * scan reads (the core keeps scans one at a time with its own mutex; a frame check touches nothing a scan changes).
 */
internal class ScannerHolder<H : Any>(private val create: () -> H, private val destroy: (H) -> Unit) {
  private val lock = ReentrantReadWriteLock()
  private val creating = Any()
  @Volatile private var handle: H? = null
  private var closed = false  // written only under the write lock

  /** How long creating the scanner took (ms), once it has been created: the speed test's "Starting the scanner". */
  @Volatile
  var loadMs: Double? = null
    private set

  fun <T> use(block: (H) -> T): T = lock.read {
    if (closed) throw ScannerClosedException()
    block(handle ?: synchronized(creating) { handle ?: created() })
  }

  private fun created(): H {
    val t0 = System.nanoTime()
    return create().also {
      handle = it
      loadMs = (System.nanoTime() - t0) / 1e6
    }
  }

  fun close() = lock.write {
    closed = true
    handle?.let(destroy)
    handle = null
  }
}
