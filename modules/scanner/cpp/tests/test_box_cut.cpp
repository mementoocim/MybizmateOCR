// Cutting the Service Invoice's boxes (frame_template.crop_box), against the Python's crops of svc_0000. The page is
// straightened with the Python's own corners, so this compares the cutting alone.
#include <array>

#include <opencv2/geometry/2d.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/box_cut.h"
#include "core/scanner.h"
#include "core/service_template.h"

TEST_CASE("cuts svc_0000's boxes like the Python") {
  const auto t = mbm::ServiceTemplate::parse(readText(assetsDir() + "/service_invoice.json"));
  const auto e = readJson(fixturesDir() + "/expected/svc_0000.json");
  std::array<cv::Point2f, 4> corners;
  for (int k = 0; k < 4; k++) corners[k] = {e["corners"][k][0].get<float>(), e["corners"][k][1].get<float>()};
  const cv::Mat H = cv::getPerspectiveTransform(corners.data(), t.frame.data());
  cv::Mat page;
  cv::warpPerspective(mbm::decodePhoto(fixturesDir() + "/photos/svc_0000.jpg"), page, H, t.page, cv::INTER_LINEAR,
                      cv::BORDER_CONSTANT, cv::Scalar(255, 255, 255));
  const auto sizes = readJson(fixturesDir() + "/crops/svc_0000/expected.json");
  size_t checked = 0;
  for (const auto& f : t.fields) {
    if (f.type == "checkbox") continue;
    CAPTURE(f.name);
    const cv::Vec2i slack = f.box.y < t.frame[0].y ? t.slackHeader : t.slackTable;
    const auto parts = mbm::cropBox(page, f, slack);
    if (!sizes.contains(f.name)) {
      CHECK(parts.empty());
      continue;
    }
    REQUIRE(parts.size() == sizes[f.name].size());
    for (size_t k = 0; k < parts.size(); k++) {
      const cv::Mat png = cv::imread(fixturesDir() + "/crops/svc_0000/" + f.name + "_" + std::to_string(k) + ".png",
                                     cv::IMREAD_UNCHANGED);
      REQUIRE(parts[k].size() == png.size());
      REQUIRE(parts[k].type() == png.type());
      CHECK(cv::norm(parts[k], png, cv::NORM_INF) == 0);
    }
    checked++;
  }
  CHECK(checked == sizes.size());
}
