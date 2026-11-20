// The scan view's Enhanced and B&W images, against the Python's (prototype/benchmark/enhance.py).
#include <string>

#include <opencv2/imgcodecs.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/enhance.h"

namespace {

const char* const kInputs[] = {"inv_0051_page", "svc_0000_paper"};

std::string enhanceFile(const std::string& name) { return fixturesDir() + "/enhance/" + name + ".png"; }

}  // namespace

TEST_CASE("Enhanced matches the Python") {
  for (const char* name : kInputs) {
    CAPTURE(name);
    const cv::Mat src = cv::imread(enhanceFile(name), cv::IMREAD_COLOR);
    const cv::Mat expected = cv::imread(enhanceFile(std::string(name) + "_enhanced"), cv::IMREAD_COLOR);
    REQUIRE_FALSE(src.empty());
    const cv::Mat got = mbm::enhanced(src);
    REQUIRE(got.size() == expected.size());
    REQUIRE(got.type() == expected.type());
    cv::Mat diff;
    cv::absdiff(got, expected, diff);
    const cv::Scalar mean = cv::mean(diff);
    for (int c = 0; c < 3; c++) CHECK(mean[c] <= 0.5);
    cv::Mat channels[3];
    cv::split(diff, channels);
    cv::Mat worst = cv::max(cv::max(channels[0], channels[1]), channels[2]);
    const double within2 = cv::countNonZero(worst <= 2) / static_cast<double>(worst.total());
    CHECK(within2 >= 0.995);
  }
}

TEST_CASE("B&W matches the Python") {
  for (const char* name : kInputs) {
    CAPTURE(name);
    const cv::Mat src = cv::imread(enhanceFile(name), cv::IMREAD_COLOR);
    const cv::Mat expected = cv::imread(enhanceFile(std::string(name) + "_bw"), cv::IMREAD_GRAYSCALE);
    const cv::Mat got = mbm::blackWhite(src);
    REQUIRE(got.size() == expected.size());
    REQUIRE(got.type() == CV_8UC1);
    const double same = cv::countNonZero(got == expected) / static_cast<double>(got.total());
    CHECK(same >= 0.995);
  }
}
