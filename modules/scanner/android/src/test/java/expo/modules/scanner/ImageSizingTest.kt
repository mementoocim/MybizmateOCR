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
  fun `a bundled image's resource name is told apart from files and URIs`() {
    // Release builds give a bundled image (a sample invoice) as its drawable's name, with no scheme.
    assertEquals("assets_samples_inv_0001", bundledImageName("assets_samples_inv_0001"))
    assertEquals(null, bundledImageName("file:///data/user/0/com.mybizmate.scan/cache/x.jpg"))
    assertEquals(null, bundledImageName("/data/user/0/com.mybizmate.scan/cache/x.jpg"))
    assertEquals(null, bundledImageName("content://media/external/images/media/46"))
    assertEquals(null, bundledImageName("http://10.0.2.2:8081/assets/x.jpg"))
    assertEquals(null, bundledImageName(""))
    assertEquals(null, bundledImageName("x.jpg"))
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
