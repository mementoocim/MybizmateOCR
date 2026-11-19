#include "core/form_template.h"

#include "nlohmann/json.hpp"

namespace mbm {

FormTemplate FormTemplate::parse(const std::string& fieldMapJson) {
  auto j = nlohmann::json::parse(fieldMapJson);
  FormTemplate t;
  const char* keys[] = {"tl", "tr", "br", "bl"};
  for (int i = 0; i < 4; i++) {
    const auto& p = j.at("markers").at(keys[i]);
    t.markers[i] = cv::Point2f(p.at(0).get<float>(), p.at(1).get<float>());
  }
  for (const auto& f : j.at("fields")) {
    const auto& b = f.at("bbox");
    int x0 = b.at(0), y0 = b.at(1), x1 = b.at(2), y1 = b.at(3);
    t.fields.push_back({f.at("name"), f.at("type"), cv::Rect(x0, y0, x1 - x0, y1 - y0)});
  }
  return t;
}

}  // namespace mbm
