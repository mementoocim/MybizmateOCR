package expo.modules.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DisplayNameTest {
  /** The question to the file's app, for a link that must never be asked about. */
  private val notAsked: () -> String? = { throw AssertionError("asked the file's app for its name") }

  @Test
  fun `a content link takes the name its app gives, never the link's own id`() {
    // Android's Downloads hands over .../document/msf%3A54: its last segment is an id, not the file's name
    assertEquals("sales_text_0.pdf", DisplayName.choose("content", "msf:54") { "sales_text_0.pdf" })
    assertNull(DisplayName.choose("content", "msf:54") { null })
  }

  @Test
  fun `a file path takes its last segment, without asking`() {
    assertEquals("sales_text_0.pdf", DisplayName.choose("file", "sales_text_0.pdf", notAsked))
  }

  @Test
  fun `nothing else has a name`() {
    assertNull(DisplayName.choose("content", "msf:54") { "  " }) // a blank name is none
    assertNull(DisplayName.choose("content", "msf:54") { "" })
    assertNull(DisplayName.choose("file", null, notAsked))
    assertNull(DisplayName.choose("https", "x.pdf", notAsked))
    assertNull(DisplayName.choose(null, "x.pdf", notAsked))
  }
}
