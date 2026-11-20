#include "doctest/doctest.h"
#include "nlohmann/json.hpp"

#include "core/info.h"

TEST_CASE("core info names the library versions") {
  auto j = nlohmann::json::parse(mbm::coreInfoJson());
  CHECK(j["opencv"] == "5.1.0");
  CHECK(j["onnxruntime"] == "1.32.0");
}
