package expo.modules.scanner

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageSizingTest {
  @Test
  fun `a photo over 2400 px is decoded at 2400 on its long side`() {
    assertEquals(2400 to 1800, decodeTarget(4032, 3024))
    assertEquals(1800 to 2400, decodeTarget(6120, 8160))
  }

  @Test
  fun `halves round to even, like the core's cap`() {
    assertEquals(1904 to 2400, decodeTarget(3809, 4800))
  }

  @Test
  fun `a photo within 2400 px keeps its size`() {
    assertEquals(1000 to 800, decodeTarget(1000, 800))
    assertEquals(2400 to 1000, decodeTarget(2400, 1000))
  }

  @Test
  fun `only files inside the folder count as inside it`() {
    val cache = File("cache")
    assertTrue(isInside(File("cache/scans/x.jpg"), cache))
    assertFalse(isInside(File("/sdcard/DCIM/x.jpg"), cache))
    assertFalse(isInside(File("cache/../files/x"), cache))
    assertFalse(isInside(File("cache-other/x.jpg"), cache))
  }
}
