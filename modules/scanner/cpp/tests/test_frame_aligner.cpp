// The Service Invoice's template and its table-border finder, against the Python reference (frame_template.py).
#include <cmath>
#include <filesystem>
#include <string>

#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/frame_aligner.h"
#include "core/scanner.h"
#include "core/service_template.h"

namespace {

const mbm::ServiceTemplate& serviceTemplate() {
  static const mbm::ServiceTemplate t = mbm::ServiceTemplate::parse(readText(assetsDir() + "/service_invoice.json"));
  return t;
}

const mbm::ServiceField& field(const mbm::ServiceTemplate& t, const std::string& name) {
  for (const auto& f : t.fields) {
    if (f.name == name) return f;
  }
  throw std::runtime_error("no field " + name);
}

cv::Mat grayOf(const std::string& photoFile) {
  cv::Mat gray;
  cv::cvtColor(mbm::decodePhoto(fixturesDir() + "/photos/" + photoFile), gray, cv::COLOR_BGR2GRAY);
  return gray;
}

}  // namespace

TEST_CASE("the Service Invoice template parses") {
  const auto& t = serviceTemplate();
  CHECK(t.name == "service_invoice");
  CHECK(t.title == "Service Invoice");
  CHECK(t.fields.size() == 42);
  CHECK(t.page == cv::Size(1160, 1860));
  CHECK(t.frame[0] == cv::Point2f(69.5f, 843.5f));
  CHECK(t.frame[2] == cv::Point2f(1070.5f, 1619.5f));
  CHECK(t.gridH.size() == 21);
  CHECK(t.gridV.size() == 8);
  CHECK(t.slackHeader == cv::Vec2i(30, 18));
  CHECK(t.slackTable == cv::Vec2i(20, 22));
  CHECK(t.paper == cv::Rect(22, 186, 1108, 1618));
  CHECK(field(t, "customer_address").multiline);
  CHECK_FALSE(field(t, "date").multiline);
  REQUIRE(field(t, "item1_description").grab.has_value());
  CHECK(field(t, "item1_description").grab->x == 40);
  CHECK_FALSE(field(t, "date").grab.has_value());
  CHECK(field(t, "terms_cash").type == "checkbox");
}

TEST_CASE("finds every Service Invoice fixture like the Python") {
  const mbm::FrameAligner aligner(serviceTemplate());
  int found = 0;
  for (const auto& entry : std::filesystem::directory_iterator(fixturesDir() + "/expected")) {
    const nlohmann::json e = readJson(entry.path().string());
    if (e["form"] != "service_invoice") continue;
    const std::string stem = entry.path().stem().string();
    CAPTURE(stem);
    const auto f = aligner.find(grayOf(e["photo"].get<std::string>()), true);
    REQUIRE(f.has_value());
    for (int k = 0; k < 4; k++) {
      CHECK(std::abs(f->corners[k].x - e["corners"][k][0].get<double>()) <= 0.5);
      CHECK(std::abs(f->corners[k].y - e["corners"][k][1].get<double>()) <= 0.5);
    }
    CHECK(std::abs(f->score - e["score"].get<double>()) <= 0.005);
    found++;
  }
  CHECK(found == 9);
}

TEST_CASE("finds no Service Invoice in a Sales Invoice, a blank page or half a form") {
  const mbm::FrameAligner aligner(serviceTemplate());
  for (const char* photo : {"inv_0007.jpg", "blank_page.png", "svc_0000_top.jpg"}) {
    CAPTURE(photo);
    CHECK_FALSE(aligner.find(grayOf(photo), true).has_value());
  }
}
