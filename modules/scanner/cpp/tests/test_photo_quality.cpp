#include <cmath>

#include <opencv2/imgcodecs.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/photo_quality.h"

using namespace mbm::quality;

TEST_CASE("percentile matches numpy") {
  uint8_t values[] = {0, 10, 20, 30};
  cv::Mat m(2, 2, CV_8UC1, values);
  CHECK(percentile(m, 90) == doctest::Approx(27.0));
  CHECK(percentile(m, 0) == doctest::Approx(0.0));
  CHECK(percentile(m, 100) == doctest::Approx(30.0));
}

TEST_CASE("page measures match the Python") {
  cv::Mat ref = inkMap(cv::imread(assetsDir() + "/form_small.png", cv::IMREAD_GRAYSCALE));
  CHECK(ref.rows == 220);
  CHECK(ref.cols == 170);
  auto expected = readJson(fixturesDir() + "/pages/expected.json");
  CHECK(expected.size() == 2);
  for (auto& [file, exp] : expected.items()) {
    CAPTURE(file);
    cv::Mat gray = cv::imread(fixturesDir() + "/pages/" + file, cv::IMREAD_GRAYSCALE);
    REQUIRE_FALSE(gray.empty());
    CHECK(sharpness(gray) == doctest::Approx(exp["sharpness"].get<double>()).epsilon(0.01));
    CHECK(std::abs(paperLight(gray) - exp["light"].get<double>()) <= 1.0);
    CHECK(upsideDown(gray, ref) == exp["upsideDown"].get<bool>());
  }
}
