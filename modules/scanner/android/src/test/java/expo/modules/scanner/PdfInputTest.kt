package expo.modules.scanner

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PdfInputTest {
  private val mb20 = 20L * 1024 * 1024
  private val pdf = "%PDF-1.7 made up".toByteArray()

  /** A stream of `size` zero bytes, made as it is read. */
  private fun zeros(size: Long) = object : InputStream() {
    private var left = size
    override fun read(): Int = if (left-- > 0) 0 else -1
    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (left <= 0) return -1
      val n = minOf(len.toLong(), left).toInt()
      b.fill(0, off, off + n)
      left -= n
      return n
    }
  }

  private fun <T> inWork(block: (File) -> T): T {
    val work = kotlin.io.path.createTempDirectory("scan-work").toFile()
    try {
      return block(work)
    } finally {
      work.deleteRecursively()
    }
  }

  @Test
  fun `sizeOk takes 20 MB and refuses 20 MB and 1 byte`() {
    assertTrue(PdfInput.sizeOk(mb20))
    assertFalse(PdfInput.sizeOk(mb20 + 1))
    assertTrue(PdfInput.sizeOk(0))
  }

  @Test
  fun `the work copy is removed after a read`() = inWork { work ->
    var copy: File? = null
    val json = PdfInput.readCopy(work, open = { ByteArrayInputStream(pdf) }) {
      copy = it
      assertTrue(isInside(it, work))
      assertArrayEquals(pdf, it.readBytes())  // the core reads the copy, byte for byte
      "{}"
    }
    assertEquals("{}", json)
    assertFalse(copy!!.exists())
    assertEquals(0, work.listFiles()!!.size)
  }

  @Test
  fun `the work copy is removed after a failure`() = inWork { work ->
    var copy: File? = null
    val failure = assertThrows(IOException::class.java) {
      PdfInput.readCopy(work, open = { ByteArrayInputStream(pdf) }) {
        copy = it
        throw IOException("pdf_broken")
      }
    }
    assertEquals("pdf_broken", failure.message)  // the failure still reaches the caller
    assertFalse(copy!!.exists())
    assertEquals(0, work.listFiles()!!.size)
  }

  @Test
  fun `a file of 20 MB is copied whole, one that turns out longer is refused while copying`() = inWork { work ->
    // a file whose size its app doesn't report: the copy itself stops at the limit
    assertEquals(mb20, PdfInput.readCopy(work, open = { zeros(mb20) }) { it.length() })
    var read = false
    val failure = assertThrows(IOException::class.java) {
      PdfInput.readCopy(work, open = { zeros(mb20 + 1) }) { read = true }
    }
    assertEquals("pdf_too_big", failure.message)
    assertFalse(read)
    assertEquals(0, work.listFiles()!!.size)
  }

  @Test
  fun `a refusal keeps its code, any other failure is pdf_unreadable`() {
    for (code in listOf("pdf_too_big", "pdf_broken", "pdf_password", "pdf_page_too_big", "pdf_unreadable")) {
      assertEquals(code, PdfInput.codeOf(IOException(code)))  // as the core's JNI throws them
    }
    assertEquals("pdf_unreadable", PdfInput.codeOf(IOException("open failed: ENOENT (No such file or directory)")))
    assertEquals("pdf_unreadable", PdfInput.codeOf(IOException()))
    assertEquals("pdf_unreadable", PdfInput.codeOf(IOException("broken")))
    assertEquals("pdf_unreadable", PdfInput.codeOf(RuntimeException("pdf_broken")))  // only the core's IOException
    assertEquals("pdf_unreadable", PdfInput.codeOf(SecurityException("no access to the file")))
    assertEquals("pdf_unreadable", PdfInput.codeOf(OutOfMemoryError()))
  }
}
