#include "core/result_json.h"

#include "nlohmann/json.hpp"

namespace mbm {

std::string toJson(const ScanResult& r) {
  using json = nlohmann::ordered_json;
  json j;
  j["aligned"] = r.aligned;
  j["form"] = r.aligned ? json(r.form) : json(nullptr);
  j["photoSize"] = {r.photoSize.width, r.photoSize.height};
  j["turned"] = r.turned;
  if (r.aligned) {
    json corners = json::array();
    for (const auto& c : r.corners) corners.push_back({c.x, c.y});
    j["corners"] = corners;
    j["sharpness"] = r.sharpness;
    j["sharpMin"] = r.sharpMin;
    j["light"] = r.light;
  } else {
    j["corners"] = nullptr;
    j["sharpness"] = nullptr;
    j["sharpMin"] = nullptr;
    j["light"] = nullptr;
  }
  j["terms"] = r.terms ? json(*r.terms) : json(nullptr);
  j["blanks"] = r.blanks;
  json reads = json::array();
  for (const auto& b : r.reads) {
    reads.push_back({{"name", b.name},
                     {"type", b.type},
                     {"text", b.text},
                     {"conf", b.conf},
                     {"alts", b.alts},
                     {"cropSize", {b.cropSize.width, b.cropSize.height}},
                     {"cropFile", b.cropFile}});
  }
  j["reads"] = reads;
  j["pageFile"] = r.pageFile.empty() ? json(nullptr) : json(r.pageFile);
  j["timing"] = {{"alignMs", r.timing.alignMs},
                 {"cropMs", r.timing.cropMs},
                 {"readMs", r.timing.readMs},
                 {"totalMs", r.timing.totalMs}};
  return j.dump();
}

}  // namespace mbm
