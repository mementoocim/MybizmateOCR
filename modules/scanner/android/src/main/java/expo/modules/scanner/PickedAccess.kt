package expo.modules.scanner

import android.content.Intent

/**
 * A picked file's lasting access. expo-file-system's picker takes a persistable grant on every file it hands over (read,
 * and write when offered), and nothing gives it up, so the app would keep access to every file ever imported. Once the
 * app has read the file it needs none: it gives up all it holds for that file, and nothing else. The file itself is
 * never touched.
 */
internal object PickedAccess {
  const val READ = Intent.FLAG_GRANT_READ_URI_PERMISSION
  const val WRITE = Intent.FLAG_GRANT_WRITE_URI_PERMISSION

  /** A lasting grant the app holds (ContentResolver.persistedUriPermissions): its file, and what it allows. */
  data class Held(val uri: String, val read: Boolean, val write: Boolean)

  /** What to give up for the file: the flags of every grant held for it; 0 when none is. */
  fun toRelease(uri: String, held: List<Held>): Int =
    held.filter { it.uri == uri }.fold(0) { flags, h -> flags or (if (h.read) READ else 0) or (if (h.write) WRITE else 0) }
}
