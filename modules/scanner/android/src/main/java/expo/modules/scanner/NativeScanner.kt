package expo.modules.scanner

/** The scanner core's JNI functions (libscanner.so: src/main/cpp/scanner_jni.cpp). */
internal object NativeScanner {
  init {
    System.loadLibrary("scanner")
  }

  /** {"opencv": "...", "onnxruntime": "..."}: the libraries the core was built with. */
  external fun coreInfo(): String
}
