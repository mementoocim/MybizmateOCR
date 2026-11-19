// JNI bridge between NativeScanner.kt and the scanner core (../../../../cpp). Android only; the core stays
// platform-free.
#include <jni.h>

#include "core/info.h"

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_scanner_NativeScanner_coreInfo(JNIEnv* env, jobject) {
  return env->NewStringUTF(mbm::coreInfoJson().c_str());
}
