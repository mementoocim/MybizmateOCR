#include "core/enhance.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

#include <opencv2/imgproc.hpp>

// numpy does the per-pixel maths in float32 (a Python float joining a float32 array stays float32), and astype(uint8)
// truncates; the loops below do the same.
namespace mbm {

namespace {

constexpr float WHITE = 238.0f, BLACK = 20.0f;
constexpr double GAMMA = 1.25;
constexpr double SHARPEN = 0.6;
constexpr float SATURATION = 1.25f;
constexpr int DARK = 110;
constexpr int SPECK = 6;  // black dots this small (px) are dropped from black and white; a pen's dot is bigger

// How bright the bare paper is at every pixel: a large closing (it erases the ink) on a quarter-size copy, smoothed,
// then scaled back up.
cv::Mat paperLight(const cv::Mat& bgr) {
  const int h = bgr.rows, w = bgr.cols;
  cv::Mat small;
  cv::resize(bgr, small, cv::Size(std::max(1, w / 4), std::max(1, h / 4)), 0, 0, cv::INTER_AREA);
  const int k = std::max(15, (std::min(small.rows, small.cols) / 12) | 1);
  cv::Mat bg;
  cv::morphologyEx(small, bg, cv::MORPH_CLOSE, cv::getStructuringElement(cv::MORPH_ELLIPSE, cv::Size(k, k)));
  cv::GaussianBlur(bg, bg, cv::Size(0, 0), k / 2.0);
  cv::Mat out;
  cv::resize(bg, out, cv::Size(w, h), 0, 0, cv::INTER_LINEAR);
  return out;
}

}  // namespace

cv::Mat enhanced(const cv::Mat& bgr) {
  const cv::Mat bg = paperLight(bgr);
  cv::Mat out(bgr.size(), CV_8UC3);
  for (int y = 0; y < bgr.rows; y++) {
    const uint8_t* s = bgr.ptr<uint8_t>(y);
    const uint8_t* b = bg.ptr<uint8_t>(y);
    uint8_t* o = out.ptr<uint8_t>(y);
    for (int i = 0; i < bgr.cols * 3; i++) {
      const float flat = static_cast<float>(s[i]) / std::max(static_cast<float>(b[i]), 1.0f) * 255.0f;  // paper: 255
      const float v = (flat - BLACK) * 255.0f / (WHITE - BLACK);                                       // near-white: white
      o[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, v)));
    }
  }
  cv::Mat lut(1, 256, CV_8U);  // deeper ink
  for (int i = 0; i < 256; i++) {
    const double v = std::pow(i / 255.0, GAMMA) * 255.0;
    lut.at<uint8_t>(i) = static_cast<uint8_t>(std::min(255.0, std::max(0.0, v)));
  }
  cv::LUT(out, lut, out);
  cv::Mat blur;
  cv::GaussianBlur(out, blur, cv::Size(0, 0), 1.2);
  cv::addWeighted(out, 1 + SHARPEN, blur, -SHARPEN, 0, out);  // unsharp mask
  cv::Mat hsv;
  cv::cvtColor(out, hsv, cv::COLOR_BGR2HSV);
  for (int y = 0; y < hsv.rows; y++) {
    cv::Vec3b* p = hsv.ptr<cv::Vec3b>(y);
    for (int x = 0; x < hsv.cols; x++) {
      p[x][1] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, static_cast<float>(p[x][1]) * SATURATION)));
    }
  }
  cv::cvtColor(hsv, out, cv::COLOR_HSV2BGR);
  return out;
}

cv::Mat blackWhite(const cv::Mat& bgr) {
  cv::Mat gray;
  cv::cvtColor(enhanced(bgr), gray, cv::COLOR_BGR2GRAY);
  cv::Mat bw;
  cv::adaptiveThreshold(gray, bw, 255, cv::ADAPTIVE_THRESH_GAUSSIAN_C, cv::THRESH_BINARY, 25, 12);
  bw.setTo(0, gray < DARK);  // solid dark areas (corner squares, a bold logo) stay solid instead of turning hollow
  cv::Mat labels, stats, cents;
  const int n = cv::connectedComponentsWithStats(bw == 0, labels, stats, cents, 8, CV_32S);
  std::vector<char> speck(n, 0);  // lone dots from the paper's grain, not pen dots
  for (int i = 1; i < n; i++) speck[i] = stats.at<int>(i, cv::CC_STAT_AREA) <= SPECK;
  for (int y = 0; y < bw.rows; y++) {
    const int* l = labels.ptr<int>(y);
    uint8_t* p = bw.ptr<uint8_t>(y);
    for (int x = 0; x < bw.cols; x++) {
      if (speck[l[x]]) p[x] = 255;
    }
  }
  return bw;
}

}  // namespace mbm
