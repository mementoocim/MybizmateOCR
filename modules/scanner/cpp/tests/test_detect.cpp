// What the live camera finds in a frame (Scanner::detectFrame), against the Python reference's frames
// (export_core_fixtures.Reference.detect, which mirrors the test app's OcrEngine.detect), and how a camera's grey
// plane is turned upright first.
#include <cmath>
#include <cstdint>
#include <vector>

#include <opencv2/imgcodecs.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/frame_input.h"
#include "core/scanner.h"

namespace {

const mbm::Scanner& liveScanner() {
  static const mbm::Scanner s(mbm::Assets{readBytes(assetsDir() + "/inference_latin.onnx"),
                                          readText(assetsDir() + "/dict.txt"), readText(assetsDir() + "/field_map.json"),
                                          readBytes(assetsDir() + "/form_small.png"),
                                          readText(assetsDir() + "/service_invoice.json"),
                                          readText(assetsDir() + "/bir_2307.json"), 2});
  return s;
}

int at(const cv::Mat& m, int y, int x) { return m.at<uint8_t>(y, x); }

}  // namespace

TEST_CASE("live detection matches the Python on every frame") {
  const auto expected = readJson(fixturesDir() + "/frames/expected.json");
  int found = 0;
  for (const auto& [stem, e] : expected.items()) {
    CAPTURE(stem);
    const cv::Mat frame = cv::imread(fixturesDir() + "/frames/" + stem + ".png", cv::IMREAD_GRAYSCALE);
    REQUIRE_FALSE(frame.empty());
    const auto d = liveScanner().detectFrame(frame);
    if (e.is_null()) {
      CHECK_FALSE(d.has_value());
      continue;
    }
    REQUIRE(d.has_value());
    CHECK(d->form == e["form"].get<std::string>());
    for (int k = 0; k < 4; k++) {
      CHECK(std::abs(d->outline[k].x - e["outline"][k][0].get<double>()) <= 1.0);
      CHECK(std::abs(d->outline[k].y - e["outline"][k][1].get<double>()) <= 1.0);
    }
    CHECK(d->sharpness == doctest::Approx(e["sharpness"].get<double>()).epsilon(0.01));
    CHECK(d->sharpMin == e["sharpMin"].get<double>());
    found++;
  }
  CHECK(found == 4);
}

TEST_CASE("uprightGray turns and unpads a plane") {
  // a 4 x 3 plane holding 0..11, its rows padded to 8 bytes with 255 (a camera's row stride)
  std::vector<uint8_t> plane(8 * 3, 255);
  for (int y = 0; y < 3; y++) {
    for (int x = 0; x < 4; x++) plane[y * 8 + x] = static_cast<uint8_t>(y * 4 + x);
  }
  const cv::Mat r0 = mbm::uprightGray(plane.data(), 4, 3, 8, 0);
  REQUIRE(r0.size() == cv::Size(4, 3));
  CHECK(at(r0, 0, 0) == 0);
  CHECK(at(r0, 0, 3) == 3);
  CHECK(at(r0, 2, 3) == 11);
  const cv::Mat r90 = mbm::uprightGray(plane.data(), 4, 3, 8, 90);
  REQUIRE(r90.size() == cv::Size(3, 4));
  CHECK(at(r90, 0, 0) == 8);
  CHECK(at(r90, 0, 1) == 4);
  CHECK(at(r90, 0, 2) == 0);
  const cv::Mat r180 = mbm::uprightGray(plane.data(), 4, 3, 8, 180);
  REQUIRE(r180.size() == cv::Size(4, 3));
  CHECK(at(r180, 0, 0) == 11);
  CHECK(at(r180, 0, 3) == 8);
  const cv::Mat r270 = mbm::uprightGray(plane.data(), 4, 3, 8, 270);
  REQUIRE(r270.size() == cv::Size(3, 4));
  CHECK(at(r270, 0, 0) == 3);
  CHECK(at(r270, 0, 1) == 7);
  CHECK(at(r270, 0, 2) == 11);
}
