package expo.modules.scanner

import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ScannerHolderTest {
  @Test
  fun closeWaitsForAScanInFlight() {
    val events = Collections.synchronizedList(mutableListOf<String>())
    val holder = ScannerHolder(create = { events += "create"; 1L }, destroy = { events += "destroy" })
    val inScan = CountDownLatch(1)
    val release = CountDownLatch(1)
    val scan = thread {
      holder.use {
        inScan.countDown()
        release.await(5, TimeUnit.SECONDS)
        events += "scan done"
      }
    }
    assertTrue(inScan.await(5, TimeUnit.SECONDS))
    val closer = thread { holder.close() }
    closer.join(300)  // a close() that doesn't wait would have destroyed the scanner by now
    assertEquals(listOf("create"), events.toList())
    release.countDown()
    scan.join()
    closer.join()
    assertEquals(listOf("create", "scan done", "destroy"), events.toList())
  }

  @Test
  fun aFrameCheckDoesNotWaitForAScan() {
    val holder = ScannerHolder(create = { 1L }, destroy = {})
    val inScan = CountDownLatch(1)
    val release = CountDownLatch(1)
    val scan = thread {
      holder.use {
        inScan.countDown()
        release.await(5, TimeUnit.SECONDS)
      }
    }
    assertTrue(inScan.await(5, TimeUnit.SECONDS))
    val checked = CountDownLatch(1)
    val frame = thread { holder.use { checked.countDown() } }
    assertTrue("the frame check waited for the scan", checked.await(1, TimeUnit.SECONDS))
    release.countDown()
    scan.join()
    frame.join()
  }

  @Test
  fun twoUsesAtOnceCreateTheScannerOnce() {
    val created = java.util.concurrent.atomic.AtomicInteger()
    val holder = ScannerHolder(create = { Thread.sleep(200); created.incrementAndGet().toLong() }, destroy = {})
    val start = CountDownLatch(1)
    val users = List(2) { thread { start.await(); holder.use { } } }
    start.countDown()
    users.forEach { it.join() }
    assertEquals(1, created.get())
  }

  @Test
  fun useAfterCloseFailsWithoutCreatingAScanner() {
    var created = 0
    val holder = ScannerHolder(create = { created++; 1L }, destroy = {})
    holder.close()
    assertThrows(ScannerClosedException::class.java) { holder.use { } }
    assertEquals(0, created)
  }

  @Test
  fun createsTheScannerOnce() {
    var created = 0
    val holder = ScannerHolder(create = { created++; 7L }, destroy = {})
    assertEquals(7L, holder.use { it })
    assertEquals(7L, holder.use { it })
    assertEquals(1, created)
  }
}
