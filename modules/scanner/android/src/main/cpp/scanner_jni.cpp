// JNI bridge between NativeScanner.kt and the scanner core (../../../../cpp). Android only; the core stays
// platform-free.
#include <jni.h>

#include <exception>
#include <string>
#include <vector>

#include "core/info.h"
#include "core/result_json.h"
#include "core/scanner.h"

namespace {

std::string toString(JNIEnv* env, jstring s) {
  const char* chars = env->GetStringUTFChars(s, nullptr);
  std::string out(chars);
  env->ReleaseStringUTFChars(s, chars);
  return out;
}

std::vector<uint8_t> toBytes(JNIEnv* env, jbyteArray a) {
  const jsize n = env->GetArrayLength(a);
  std::vector<uint8_t> out(static_cast<size_t>(n));
  env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte*>(out.data()));
  return out;
}

void throwJava(JNIEnv* env, const char* className, const char* message) {
  env->ThrowNew(env->FindClass(className), message);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_scanner_NativeScanner_coreInfo(JNIEnv* env, jobject) {
  return env->NewStringUTF(mbm::coreInfoJson().c_str());
}

extern "C" JNIEXPORT jlong JNICALL Java_expo_modules_scanner_NativeScanner_create(JNIEnv* env, jobject, jbyteArray model,
                                                                                  jstring dict, jstring fieldMap,
                                                                                  jbyteArray formPng,
                                                                                  jstring serviceJson, jint threads) {
  try {
    auto* scanner = new mbm::Scanner(mbm::Assets{toBytes(env, model), toString(env, dict), toString(env, fieldMap),
                                                 toBytes(env, formPng), toString(env, serviceJson),
                                                 static_cast<int>(threads)});
    return reinterpret_cast<jlong>(scanner);
  } catch (const std::exception& e) {
    throwJava(env, "java/lang/RuntimeException", e.what());
    return 0;
  }
}

// The scan result's JSON (ASCII only, so NewStringUTF is safe). An unreadable photo throws
// java.io.IOException("unreadable_image"); any other failure a RuntimeException.
extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_scanner_NativeScanner_scanPhoto(JNIEnv* env, jobject, jlong handle,
                                                                                       jstring path, jstring outDir) {
  try {
    auto* scanner = reinterpret_cast<mbm::Scanner*>(handle);
    return env->NewStringUTF(mbm::toJson(scanner->scanPhoto(toString(env, path), toString(env, outDir))).c_str());
  } catch (const mbm::UnreadableImage&) {
    throwJava(env, "java/io/IOException", "unreadable_image");
  } catch (const std::exception& e) {
    throwJava(env, "java/lang/RuntimeException", e.what());
  }
  return nullptr;
}

extern "C" JNIEXPORT void JNICALL Java_expo_modules_scanner_NativeScanner_destroy(JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<mbm::Scanner*>(handle);
}
