# The scanner core: platform-free C++ (OpenCV + ONNX Runtime + pdfium), shared by the Android module, the iOS module
# and the tests. Each caller defines the targets scanner::opencv, scanner::onnxruntime and scanner::pdfium before adding
# this directory.
file(GLOB SCANNER_CORE_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/core/*.cpp)
add_library(scanner_core STATIC ${SCANNER_CORE_SOURCES})
target_include_directories(scanner_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
target_compile_features(scanner_core PUBLIC cxx_std_17)
set_target_properties(scanner_core PROPERTIES POSITION_INDEPENDENT_CODE ON)
# The same arithmetic on every phone: no fused multiply-adds. arm64 would fuse them and x86_64 (the emulator, where
# the parity tests run) can't, so without this a phone could compute the core's own maths slightly differently.
target_compile_options(scanner_core PRIVATE -ffp-contract=off)
target_link_libraries(scanner_core PUBLIC scanner::opencv scanner::onnxruntime)
# pdfium's headers stay inside the core (only pdf_reader.cpp includes them); its library still reaches every link.
target_link_libraries(scanner_core PRIVATE scanner::pdfium)
