package expo.modules.scanner

import java.nio.ByteBuffer

/** The scanner core's JNI functions (libscanner.so: src/main/cpp/scanner_jni.cpp). */
internal object NativeScanner {
  init {
    System.loadLibrary("scanner")
  }

  /** {"opencv": "...", "onnxruntime": "..."}: the libraries the core was built with. */
  external fun coreInfo(): String

  /** Loads the model and both forms once; returns a handle for scanPhoto, detectFrame and destroy. */
  external fun create(
    model: ByteArray,
    dict: String,
    fieldMap: String,
    formPng: ByteArray,
    serviceJson: String,
    threads: Int,
  ): Long

  /**
   * Reads one photo; writes page.jpg, original.jpg and one PNG per read into outDir (nothing when outDir is "").
   * Returns the scan result's JSON. Throws java.io.IOException("unreadable_image") when OpenCV can't open the file.
   */
  external fun scanPhoto(handle: Long, path: String, outDir: String): String

  /**
   * One camera frame's grey plane (a direct buffer, rows rowStride bytes apart, turned rotation degrees clockwise from
   * upright). Returns [form (0 sales, 1 service), tl, tr, br, bl as x, y in the upright frame, sharpness, sharpMin], or
   * null when no form is in view. Never waits for a scan.
   */
  external fun detectFrame(handle: Long, y: ByteBuffer, width: Int, height: Int, rowStride: Int, rotation: Int): FloatArray?

  /** The scan view's Enhanced (mode 0, JPEG) or B&W (mode 1, PNG) of a saved page, written to outPath. */
  external fun enhance(pagePath: String, mode: Int, outPath: String)

  external fun destroy(handle: Long)
}
