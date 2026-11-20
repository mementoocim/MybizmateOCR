package expo.modules.scanner

import java.io.File
import kotlin.math.max

/**
 * The size Android should decode a photo at when OpenCV can't open it (HEIC, for one): the long side at most maxSide,
 * like the core's own cap, with halves rounded to even as the core rounds them (std::nearbyint). Smaller photos keep
 * their size.
 */
internal fun decodeTarget(width: Int, height: Int, maxSide: Int = 2400): Pair<Int, Int> {
  val long = max(width, height)
  if (long <= maxSide) return width to height
  val s = maxSide / long.toDouble()
  return Math.rint(width * s).toInt() to Math.rint(height * s).toInt()
}

private val RESOURCE_NAME = Regex("[a-z0-9_]+")

/**
 * The drawable name of an image bundled with the app, or null. A release build gives a bundled image (a sample
 * invoice) as its resource name, with no scheme and no folder, the way React Native's Image reads it; files and URIs
 * have a "/" or a ":".
 */
internal fun bundledImageName(uri: String): String? = uri.takeIf { RESOURCE_NAME.matches(it) }

/** The camera's photos wait in cacheDir/camera until they are read. */
internal const val CAPTURE_DIR = "camera"

/** Runs a read of a photo; afterwards, read or not, the photo is deleted when deletePhoto asks for it. */
internal inline fun <T> readThenDelete(deletePhoto: Boolean, delete: () -> Unit, read: () -> T): T =
  try {
    read()
  } finally {
    if (deletePhoto) delete()
  }

/** Deletes every camera photo still waiting in the cache. Called at start, when none can be in use. */
internal fun clearCaptures(cacheDir: File) {
  File(cacheDir, CAPTURE_DIR).deleteRecursively()
}

/** True when file is inside dir once both are resolved (no "..", no links), so nothing outside it gets deleted. */
internal fun isInside(file: File, dir: File): Boolean =
  file.canonicalFile.toPath().startsWith(dir.canonicalFile.toPath())
