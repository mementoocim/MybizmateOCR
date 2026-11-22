package expo.modules.scanner

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream

/**
 * A PDF on its way to the core (readPdf): its size limit, the work copy a picked file is read through, and the code a
 * failed read rejects with.
 */
internal object PdfInput {
  /** The core's own limit (pdf_reader.h MAX_PDF_BYTES): a bigger file is refused, pdf_too_big. */
  const val MAX_BYTES = 20L * 1024 * 1024

  const val TOO_BIG = "pdf_too_big"
  const val UNREADABLE = "pdf_unreadable"

  /** The codes a read rejects with: the core's refusals, "pdf_" first (scanner_jni.cpp), and pdf_unreadable. */
  val CODES = setOf(TOO_BIG, "pdf_broken", "pdf_password", "pdf_page_too_big", UNREADABLE)

  fun sizeOk(bytes: Long): Boolean = bytes <= MAX_BYTES

  /**
   * Reads a PDF through a copy in the work folder, then deletes the copy, read or not: the person's own file is only
   * ever read from. A file longer than MAX_BYTES (one whose size its app didn't give) is refused, pdf_too_big, as soon
   * as the copy passes the limit, and is never read.
   */
  fun <T> readCopy(work: File, open: () -> InputStream, read: (File) -> T): T {
    val copy = File(work, "input.pdf")
    try {
      open().use { source -> FileOutputStream(copy).use { copyAtMost(source, it) } }
      return read(copy)
    } finally {
      copy.delete()
    }
  }

  /**
   * The code a failed read rejects with: a refusal's own (an IOException named for its code: the core's, through JNI,
   * or the copy's pdf_too_big), else pdf_unreadable.
   */
  fun codeOf(e: Throwable): String = (e as? IOException)?.message?.takeIf { it in CODES } ?: UNREADABLE

  private fun copyAtMost(source: InputStream, sink: FileOutputStream) {
    val buffer = ByteArray(64 * 1024)
    var total = 0L
    while (true) {
      val n = source.read(buffer)
      if (n < 0) return
      total += n
      if (!sizeOk(total)) throw IOException(TOO_BIG)
      sink.write(buffer, 0, n)
    }
  }
}
