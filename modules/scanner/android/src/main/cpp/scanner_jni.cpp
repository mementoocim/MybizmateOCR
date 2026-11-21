// JNI bridge between NativeScanner.kt and the scanner core (../../../../cpp). Android only; the core stays
// platform-free.
#include <jni.h>

#include <cstdint>
#include <exception>
#include <stdexcept>
#include <string>
#include <vector>

#include <opencv2/imgcodecs.hpp>

#include "core/enhance.h"
#include "core/frame_input.h"
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

// detectFrame's number for a form (AutoCapture.kt's detectionOf reads it back).
float formCode(const std::string& form) {
  if (form == "sales_invoice") return 0;
  if (form == "service_invoice") return 1;
  if (form == "bir_2307") return 2;
  throw std::logic_error("detectFrame has no number for the form " + form);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_scanner_NativeScanner_coreInfo(JNIEnv* env, jobject) {
  return env->NewStringUTF(mbm::coreInfoJson().c_str());
}

extern "C" JNIEXPORT jlong JNICALL Java_expo_modules_scanner_NativeScanner_create(JNIEnv* env, jobject, jbyteArray model,
                                                                                  jstring dict, jstring fieldMap,
                                                                                  jbyteArray formPng,
                                                                                  jstring serviceJson,
                                                                                  jstring bir2307Json, jint threads) {
  try {
    auto* scanner = new mbm::Scanner(mbm::Assets{toBytes(env, model), toString(env, dict), toString(env, fieldMap),
                                                 toBytes(env, formPng), toString(env, serviceJson),
                                                 toString(env, bir2307Json), static_cast<int>(threads)});
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

// One camera frame's grey plane (a direct ByteBuffer). Returns [form (0 sales, 1 service, 2 BIR 2307), the outline's tl,
// tr, br, bl as x, y, sharpness, sharpMin], or null when no form is in view.
extern "C" JNIEXPORT jfloatArray JNICALL Java_expo_modules_scanner_NativeScanner_detectFrame(
    JNIEnv* env, jobject, jlong handle, jobject yPlane, jint width, jint height, jint rowStride, jint rotation) {
  try {
    const auto* y = static_cast<const uint8_t*>(env->GetDirectBufferAddress(yPlane));
    if (y == nullptr) {
      throwJava(env, "java/lang/IllegalArgumentException", "the frame's plane isn't a direct buffer");
      return nullptr;
    }
    const cv::Mat gray = mbm::uprightGray(y, width, height, rowStride, rotation);
    const auto d = reinterpret_cast<const mbm::Scanner*>(handle)->detectFrame(gray);
    if (!d) return nullptr;
    float out[11];
    out[0] = formCode(d->form);
    for (int k = 0; k < 4; k++) {
      out[1 + 2 * k] = d->outline[k].x;
      out[2 + 2 * k] = d->outline[k].y;
    }
    out[9] = static_cast<float>(d->sharpness);
    out[10] = static_cast<float>(d->sharpMin);
    jfloatArray array = env->NewFloatArray(11);
    env->SetFloatArrayRegion(array, 0, 11, out);
    return array;
  } catch (const std::exception& e) {
    throwJava(env, "java/lang/RuntimeException", e.what());
  }
  return nullptr;
}

// The scan view's Enhanced (mode 0, JPEG q92) or B&W (mode 1, PNG) of a saved page.
extern "C" JNIEXPORT void JNICALL Java_expo_modules_scanner_NativeScanner_enhance(JNIEnv* env, jobject, jstring pagePath,
                                                                                 jint mode, jstring outPath) {
  try {
    const cv::Mat page = cv::imread(toString(env, pagePath), cv::IMREAD_COLOR);
    if (page.empty()) throw std::runtime_error("can't open the page");
    const std::string out = toString(env, outPath);
    const bool ok = mode == 1 ? cv::imwrite(out, mbm::blackWhite(page))
                              : cv::imwrite(out, mbm::enhanced(page), {cv::IMWRITE_JPEG_QUALITY, 92});
    if (!ok) throw std::runtime_error("can't write " + out);
  } catch (const std::exception& e) {
    throwJava(env, "java/lang/RuntimeException", e.what());
  }
}

extern "C" JNIEXPORT void JNICALL Java_expo_modules_scanner_NativeScanner_destroy(JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<mbm::Scanner*>(handle);
}
