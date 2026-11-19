#include "core/info.h"

#include <onnxruntime_cxx_api.h>
#include <opencv2/core/version.hpp>

#include "nlohmann/json.hpp"

namespace mbm {

std::string coreInfoJson() {
  return nlohmann::json{{"opencv", CV_VERSION}, {"onnxruntime", Ort::GetVersionString()}}.dump();
}

}  // namespace mbm
