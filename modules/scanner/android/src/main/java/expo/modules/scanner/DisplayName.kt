package expo.modules.scanner

/**
 * The name a picked file shows the person (an imported PDF's label), chosen without opening the file: a content://
 * link's name as its app gives it (asked only for such a link), or a file://'s last path segment. A content link's own
 * last segment is never used: Android's Downloads hands over ids like msf:54. Anything else, or a blank name, is none.
 */
internal object DisplayName {
  fun choose(scheme: String?, lastPathSegment: String?, asked: () -> String?): String? {
    val name = when (scheme) {
      "content" -> asked()
      "file" -> lastPathSegment
      else -> null
    }
    return name?.takeIf { it.isNotBlank() }
  }
}
