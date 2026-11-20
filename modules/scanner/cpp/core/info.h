#pragma once

#include <string>

namespace mbm {

// The libraries the core was built with, as JSON: {"opencv":"5.1.0","onnxruntime":"1.32.0"}.
std::string coreInfoJson();

}  // namespace mbm
