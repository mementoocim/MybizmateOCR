# The Android library: the scanner core plus its JNI bridge (libscanner.so).
cmake_minimum_required(VERSION 3.22.1)
project(scanner CXX)

# OpenCV 5.1.0's AAR exports a prefab package (enabled in build.gradle).
find_package(OpenCV REQUIRED CONFIG)
add_library(scanner::opencv INTERFACE IMPORTED)
target_link_libraries(scanner::opencv INTERFACE OpenCV::opencv_java5)

# ONNX Runtime 1.32.0: headers and libraries unpacked from its AAR by the extractOrt task (ORT_DIR).
add_library(scanner::onnxruntime SHARED IMPORTED)
set_target_properties(scanner::onnxruntime PROPERTIES
  IMPORTED_LOCATION ${ORT_DIR}/jni/${ANDROID_ABI}/libonnxruntime.so
  INTERFACE_INCLUDE_DIRECTORIES ${ORT_DIR}/headers)

# pdfium chromium/8125, no V8: headers and library for each ABI, fetched and checked by the fetchPdfium task
# (scripts/fetch-pdfium.mjs) into PDFIUM_DIR. Linked as an imported library, it is packaged into the APK by AGP.
add_library(scanner::pdfium SHARED IMPORTED)
set_target_properties(scanner::pdfium PROPERTIES
  IMPORTED_LOCATION ${PDFIUM_DIR}/${ANDROID_ABI}/lib/libpdfium.so
  INTERFACE_INCLUDE_DIRECTORIES ${PDFIUM_DIR}/${ANDROID_ABI}/include)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../cpp scanner_core)

add_library(scanner SHARED src/main/cpp/scanner_jni.cpp)
target_link_libraries(scanner PRIVATE scanner_core log)
