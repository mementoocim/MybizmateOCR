package expo.modules.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoCaptureTest {
  private val width = 960
  private val outline = floatArrayOf(100f, 100f, 860f, 100f, 860f, 1180f, 100f, 1180f)

  private fun sales(sharp: Boolean = true, moveTl: Float = 0f) = Detection(
    "sales_invoice",
    outline.copyOf().also { it[0] += moveTl },
    if (sharp) 1.5 else 0.9,
    1.2,
  )

  @Test
  fun `no form looks and starts over`() {
    val a = AutoCapture()
    a.onFrame(sales(), width, 0, auto = true)
    a.onFrame(sales(), width, 500, auto = true)
    val none = a.onFrame(null, width, 600, auto = true)
    assertEquals(CameraStatus.LOOKING, none.status)
    assertEquals(0f, none.held)
    val again = a.onFrame(sales(), width, 1000, auto = true)
    assertEquals(CameraStatus.HOLDING, again.status)
    assertEquals(0f, again.held)
  }

  @Test
  fun `takes the photo after 800 ms and 3 still sharp frames`() {
    val a = AutoCapture()
    assertEquals(CameraStatus.HOLDING, a.onFrame(sales(), width, 0, auto = true).status)
    val half = a.onFrame(sales(), width, 400, auto = true)
    assertEquals(CameraStatus.HOLDING, half.status)
    assertEquals(0.5f, half.held, 1e-6f)
    val now = a.onFrame(sales(), width, 800, auto = true)
    assertEquals(CameraStatus.CAPTURE, now.status)
    assertTrue(now.capture)
  }

  @Test
  fun `2 frames aren't enough, even after 800 ms`() {
    val a = AutoCapture()
    a.onFrame(sales(), width, 0, auto = true)
    val second = a.onFrame(sales(), width, 900, auto = true)
    assertEquals(CameraStatus.HOLDING, second.status)
    assertFalse(second.capture)
    assertTrue(a.onFrame(sales(), width, 950, auto = true).capture)
  }

  @Test
  fun `a move of 3 percent of the frame width starts the hold again`() {
    val moved = AutoCapture()
    moved.onFrame(sales(), width, 0, auto = true)
    val far = moved.onFrame(sales(moveTl = 29f), width, 600, auto = true)  // 29 >= 0.03 x 960 = 28.8
    assertEquals(CameraStatus.HOLDING, far.status)
    assertEquals(0f, far.held)
    val kept = AutoCapture()
    kept.onFrame(sales(), width, 0, auto = true)
    assertEquals(0.75f, kept.onFrame(sales(moveTl = 28f), width, 600, auto = true).held, 1e-6f)
  }

  @Test
  fun `not sharp - blurry until 2_8 s, then takes it anyway`() {
    val a = AutoCapture()
    var t = 0L
    while (t < 800) {
      assertEquals(CameraStatus.HOLDING, a.onFrame(sales(sharp = false), width, t, auto = true).status)
      t += 100
    }
    while (t < 2800) {
      val step = a.onFrame(sales(sharp = false), width, t, auto = true)
      assertEquals(CameraStatus.BLURRY, step.status)
      assertFalse(step.capture)
      t += 100
    }
    assertTrue(a.onFrame(sales(sharp = false), width, 2800, auto = true).capture)
  }

  @Test
  fun `manual mode never takes the photo`() {
    val a = AutoCapture()
    var t = 0L
    while (t <= 5000) {
      val step = a.onFrame(sales(), width, t, auto = false)
      assertEquals(CameraStatus.FOUND, step.status)
      assertFalse(step.capture)
      t += 100
    }
  }

  @Test
  fun `another form starts the hold again`() {
    val a = AutoCapture()
    a.onFrame(sales(), width, 0, auto = true)
    val service = a.onFrame(Detection("service_invoice", outline.copyOf(), 1.0, 0.7), width, 400, auto = true)
    assertEquals(CameraStatus.HOLDING, service.status)
    assertEquals(0f, service.held)
  }

  @Test
  fun `nothing more after a capture until reset`() {
    val a = AutoCapture()
    a.onFrame(sales(), width, 0, auto = true)
    a.onFrame(sales(), width, 400, auto = true)
    assertTrue(a.onFrame(sales(), width, 800, auto = true).capture)
    assertFalse(a.onFrame(sales(), width, 900, auto = true).capture)
    assertFalse(a.onFrame(sales(), width, 5000, auto = true).capture)
    a.reset()
    val fresh = a.onFrame(sales(), width, 6000, auto = true)
    assertEquals(CameraStatus.HOLDING, fresh.status)
    assertEquals(0f, fresh.held)
  }
}
