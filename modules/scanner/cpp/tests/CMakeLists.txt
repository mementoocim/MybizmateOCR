# The scanner core's tests, as an Android program run on the emulator by scripts/core-test.mjs.
# OPENCV_DIR and ORT_DIR: the extracted OpenCV 5.1.0 and ONNX Runtime 1.32.0 AARs. PDFIUM_DIR: pdfium chromium/8125, one
# folder per ABI (scripts/fetch-pdfium.mjs).
cmake_minimum_required(VERSION 3.22.1)
project(scanner_tests CXX)

set(OCV ${OPENCV_DIR}/prefab/modules/opencv_java5)
add_library(scanner::opencv SHARED IMPORTED)
set_target_properties(scanner::opencv PROPERTIES
  IMPORTED_LOCATION ${OCV}/libs/android.${ANDROID_ABI}/libopencv_java5.so
  INTERFACE_INCLUDE_DIRECTORIES ${OCV}/include)

add_library(scanner::onnxruntime SHARED IMPORTED)
set_target_properties(scanner::onnxruntime PROPERTIES
  IMPORTED_LOCATION ${ORT_DIR}/jni/${ANDROID_ABI}/libonnxruntime.so
  INTERFACE_INCLUDE_DIRECTORIES ${ORT_DIR}/headers)

add_library(scanner::pdfium SHARED IMPORTED)
set_target_properties(scanner::pdfium PROPERTIES
  IMPORTED_LOCATION ${PDFIUM_DIR}/${ANDROID_ABI}/lib/libpdfium.so
  INTERFACE_INCLUDE_DIRECTORIES ${PDFIUM_DIR}/${ANDROID_ABI}/include)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/.. core)

file(GLOB TEST_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp)
add_executable(scanner_tests ${TEST_SOURCES})
# pdfium too: some tests make their own PDFs with its edit API
target_link_libraries(scanner_tests PRIVATE scanner_core scanner::pdfium)
