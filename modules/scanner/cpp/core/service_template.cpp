#include "core/service_template.h"

#include "nlohmann/json.hpp"

namespace mbm {

namespace {

cv::Rect rectOf(const nlohmann::json& b) {
  const int x0 = b[0].get<int>(), y0 = b[1].get<int>(), x1 = b[2].get<int>(), y1 = b[3].get<int>();
  return {x0, y0, x1 - x0, y1 - y0};
}

cv::Point2f pointOf(const nlohmann::json& p) { return {p[0].get<float>(), p[1].get<float>()}; }

}  // namespace

ServiceTemplate ServiceTemplate::parse(const std::string& json) {
  const auto j = nlohmann::json::parse(json);
  ServiceTemplate t;
  t.name = j.at("name").get<std::string>();
  t.title = j.at("title").get<std::string>();
  t.page = {j.at("page")[0].get<int>(), j.at("page")[1].get<int>()};
  const auto& fr = j.at("frame");
  t.frame = {pointOf(fr.at("tl")), pointOf(fr.at("tr")), pointOf(fr.at("br")), pointOf(fr.at("bl"))};
  for (const auto& r : j.at("grid").at("h")) t.gridH.emplace_back(r[0].get<float>(), r[1].get<float>(), r[2].get<float>());
  for (const auto& r : j.at("grid").at("v")) t.gridV.emplace_back(r[0].get<float>(), r[1].get<float>(), r[2].get<float>());
  t.maxLines = j.value("max_lines", t.maxLines);
  t.refitFinalists = j.value("refit_finalists", t.refitFinalists);
  t.besideClear = j.value("beside_clear", t.besideClear);
  const auto& slack = j.at("slack");
  t.slackHeader = {slack.at("header")[0].get<int>(), slack.at("header")[1].get<int>()};
  t.slackTable = {slack.at("table")[0].get<int>(), slack.at("table")[1].get<int>()};
  t.paper = rectOf(j.at("paper"));
  for (const auto& f : j.at("fields")) {
    ServiceField field;
    field.name = f.at("name").get<std::string>();
    field.type = f.at("type").get<std::string>();
    field.label = f.value("label", std::string());
    field.box = rectOf(f.at("bbox"));
    if (f.contains("grab")) field.grab = rectOf(f.at("grab"));
    field.multiline = f.value("multiline", false);
    field.comb = f.value("comb", false);
    t.fields.push_back(std::move(field));
  }
  return t;
}

}  // namespace mbm
