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

/** True when file is inside dir once both are resolved (no "..", no links), so nothing outside it gets deleted. */
internal fun isInside(file: File, dir: File): Boolean =
  file.canonicalFile.toPath().startsWith(dir.canonicalFile.toPath())
