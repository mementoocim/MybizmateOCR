package expo.modules.scanner

/** The scanner core's JNI functions (libscanner.so: src/main/cpp/scanner_jni.cpp). */
internal object NativeScanner {
  init {
    System.loadLibrary("scanner")
  }

  /** {"opencv": "...", "onnxruntime": "..."}: the libraries the core was built with. */
  external fun coreInfo(): String

  /** Loads the model and the form once; returns a handle for scanPhoto and destroy. */
  external fun create(model: ByteArray, dict: String, fieldMap: String, formPng: ByteArray, threads: Int): Long

  /**
   * Reads one photo; writes page.jpg and one PNG per read into outDir. Returns the scan result's JSON.
   * Throws java.io.IOException("unreadable_image") when OpenCV can't open the file.
   */
  external fun scanPhoto(handle: Long, path: String, outDir: String): String

  external fun destroy(handle: Long)
}
