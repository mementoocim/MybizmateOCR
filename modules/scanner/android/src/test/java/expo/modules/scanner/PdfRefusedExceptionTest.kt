package expo.modules.scanner

import java.io.FileNotFoundException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PdfRefusedExceptionTest {
  @Test
  fun `a refusal carries its code and plain words only, never the failure behind it`() {
    // a failure behind a refusal can name the file: a FileNotFoundException's message holds its content:// link
    val behind = FileNotFoundException("content://com.android.providers.downloads.documents/document/msf%3A54")
    val refused = PdfRefusedException(PdfInput.codeOf(behind))
    assertEquals("pdf_unreadable", refused.code)
    assertEquals("The PDF couldn't be read.", refused.message)
    assertNull(refused.cause)
  }
}
