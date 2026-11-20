#include <cmath>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/align.h"
#include "core/crop.h"
#include "core/form_template.h"

namespace {

const std::vector<std::string> kSamples = {"inv_0001", "inv_0007", "inv_0011", "inv_0017",
                                           "inv_0027", "inv_0041", "inv_0051", "inv_0091"};

mbm::FormTemplate form() { return mbm::FormTemplate::parse(readText(assetsDir() + "/field_map.json")); }

nlohmann::json expected(const std::string& stem) { return readJson(fixturesDir() + "/expected/" + stem + ".json"); }

cv::Mat photo(const nlohmann::json& exp) {
  cv::Mat img = cv::imread(fixturesDir() + "/photos/" + exp["photo"].get<std::string>(), cv::IMREAD_COLOR);
  REQUIRE_FALSE(img.empty());
  return img;
}

cv::Mat gray(const cv::Mat& bgr) {
  cv::Mat g;
  cv::cvtColor(bgr, g, cv::COLOR_BGR2GRAY);
  return g;
}

// The straightened page (none of these photos is upside down).
cv::Mat page(const cv::Mat& bgr, const mbm::FormTemplate& t) {
  auto H = mbm::findMarkers(gray(bgr), t);
  REQUIRE(H.has_value());
  cv::Mat p;
  cv::warpPerspective(bgr, p, *H, cv::Size(mbm::PAGE_W, mbm::PAGE_H), cv::INTER_LINEAR);
  return p;
}

}  // namespace

TEST_CASE("corners match the Python") {
  auto t = form();
  std::vector<std::string> stems = kSamples;
  stems.push_back("inv_0051_exif6");
  for (const auto& stem : stems) {
    CAPTURE(stem);
    auto exp = expected(stem);
    auto H = mbm::findMarkers(gray(photo(exp)), t);
    REQUIRE(H.has_value());
    auto corners = mbm::photoCorners(*H, t);
    for (int i = 0; i < 4; i++) {
      CAPTURE(i);
      CHECK(std::abs(corners[i].x - exp["corners"][i][0].get<double>()) <= 0.5);
      CHECK(std::abs(corners[i].y - exp["corners"][i][1].get<double>()) <= 0.5);
    }
  }
}

TEST_CASE("no form, no corners") {
  auto exp = expected("blank_page");
  CHECK_FALSE(mbm::findMarkers(gray(photo(exp)), form()).has_value());
}

TEST_CASE("crops match the Python") {
  auto t = form();
  auto exp = expected("inv_0007");
  cv::Mat p = page(photo(exp), t);
  std::set<std::string> want, got;
  for (const auto& r : exp["reads"]) want.insert(r["name"].get<std::string>());
  for (const auto& f : t.fields) {
    if (f.type == "checkbox") continue;
    auto crop = mbm::cropField(p, f.box, 6);
    if (!crop) continue;
    got.insert(f.name);
    for (const auto& r : exp["reads"]) {
      if (r["name"] != f.name) continue;
      CAPTURE(f.name);
      CHECK(std::abs(crop->cols - r["cropSize"][0].get<int>()) <= 2);
      CHECK(std::abs(crop->rows - r["cropSize"][1].get<int>()) <= 2);
    }
  }
  CHECK(got == want);
  CHECK(got.size() == 45);
}

TEST_CASE("terms tick matches") {
  auto t = form();
  for (const auto& stem : kSamples) {
    CAPTURE(stem);
    auto exp = expected(stem);
    cv::Mat p = page(photo(exp), t);
    double cash = 0, account = 0;
    for (const auto& f : t.fields) {
      if (f.name == "terms_cash") cash = mbm::inkRatio(p, f.box, 3);
      if (f.name == "terms_account") account = mbm::inkRatio(p, f.box, 3);
    }
    std::optional<std::string> terms;
    if (!(std::max(cash, account) < 0.04 || std::abs(cash - account) < 0.02)) terms = cash > account ? "cash" : "account";
    if (exp["terms"].is_null()) {
      CHECK_FALSE(terms.has_value());
    } else {
      REQUIRE(terms.has_value());
      CHECK(*terms == exp["terms"].get<std::string>());
    }
  }
}
