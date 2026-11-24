package expo.modules.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CheckRateTest {
  @Test
  fun `counts each second's checks, and whether a read ran in it`() {
    val rate = CheckRate()
    for (t in 0L until 1000L step 100L) assertNull(rate.onCheck(t, reading = false))
    assertEquals(CheckWindow(10, 1000, false), rate.onCheck(1000, reading = false))
    for (t in 1100L until 2000L step 100L) assertNull(rate.onCheck(t, reading = t == 1500L))
    assertEquals(CheckWindow(10, 1000, true), rate.onCheck(2000, reading = false))
  }

  @Test
  fun `nothing is reported before a second has passed`() {
    val rate = CheckRate()
    for (t in 0L until 1000L) assertNull(rate.onCheck(t, reading = false))
  }

  @Test
  fun `a stall is one window as long as the stall`() {
    val rate = CheckRate()
    rate.onCheck(0, reading = true)
    rate.onCheck(100, reading = false)
    assertEquals(CheckWindow(2, 3500, true), rate.onCheck(3500, reading = false))
  }
}
