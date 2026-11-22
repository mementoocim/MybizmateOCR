package expo.modules.scanner

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Test

class PickedAccessTest {
  private val file = "content://com.android.providers.downloads.documents/document/msf%3A54"
  private val other = "content://com.android.providers.downloads.documents/document/msf%3A55"

  @Test
  fun `what is given up is what is held for that file, read and write as granted`() {
    assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, PickedAccess.READ)
    assertEquals(Intent.FLAG_GRANT_WRITE_URI_PERMISSION, PickedAccess.WRITE)
    val read = PickedAccess.Held(file, read = true, write = false)
    val both = PickedAccess.Held(file, read = true, write = true)
    assertEquals(PickedAccess.READ, PickedAccess.toRelease(file, listOf(read)))
    assertEquals(PickedAccess.READ or PickedAccess.WRITE, PickedAccess.toRelease(file, listOf(both)))
    assertEquals(PickedAccess.WRITE, PickedAccess.toRelease(file, listOf(PickedAccess.Held(file, read = false, write = true))))
    // another file's grant is never given up
    assertEquals(PickedAccess.READ, PickedAccess.toRelease(file, listOf(PickedAccess.Held(other, true, true), read)))
  }

  @Test
  fun `nothing held for that file, nothing to give up`() {
    assertEquals(0, PickedAccess.toRelease(file, emptyList()))
    assertEquals(0, PickedAccess.toRelease(file, listOf(PickedAccess.Held(other, read = true, write = true))))
    assertEquals(0, PickedAccess.toRelease(file, listOf(PickedAccess.Held(file, read = false, write = false))))
  }
}
