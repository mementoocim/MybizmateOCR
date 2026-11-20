# The scanner core: platform-free C++ (OpenCV + ONNX Runtime), shared by the Android module, the iOS module and the
# tests. Each caller defines the targets scanner::opencv and scanner::onnxruntime before adding this directory.
file(GLOB SCANNER_CORE_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/core/*.cpp)
add_library(scanner_core STATIC ${SCANNER_CORE_SOURCES})
target_include_directories(scanner_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
target_compile_features(scanner_core PUBLIC cxx_std_17)
set_target_properties(scanner_core PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries(scanner_core PUBLIC scanner::opencv scanner::onnxruntime)
