#include "core/photo_quality.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

#include <opencv2/imgproc.hpp>

namespace mbm::quality {

namespace {

double meanSquare(const cv::Mat& m) { return cv::mean(m.mul(m))[0]; }

const std::array<cv::Mat, 4>& kernels() {
  // OpenCV 5 has no `Mat_ << a, b, c` initializer: build each kernel from an array.
  static const std::array<cv::Mat, 4> k = [] {
    static float x[] = {1, -2, 1};
    static float d1[] = {1, 0, 0, 0, -2, 0, 0, 0, 1};
    static float d2[] = {0, 0, 1, 0, -2, 0, 1, 0, 0};
    return std::array<cv::Mat, 4>{cv::Mat(1, 3, CV_32F, x).clone(), cv::Mat(3, 1, CV_32F, x).clone(),
                                  cv::Mat(3, 3, CV_32F, d1).clone(), cv::Mat(3, 3, CV_32F, d2).clone()};
  }();
  return k;
}

// The value at sorted position k of an 8-bit image, from its histogram.
int kth(const std::array<long long, 256>& hist, long long k) {
  long long seen = 0;
  for (int v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen > k) return v;
  }
  return 255;
}

}  // namespace

double sharpness(const cv::Mat& gray) {
  // Python: round(425 * h / w), which rounds halves to even, as std::nearbyint does.
  int w = 425, h = static_cast<int>(std::nearbyint(425.0 * gray.rows / gray.cols));
  cv::Mat small, g, blur;
  cv::resize(gray, small, cv::Size(w, h), 0, 0, cv::INTER_AREA);
  small.convertTo(g, CV_32F);
  cv::GaussianBlur(g, blur, cv::Size(0, 0), 3);
  cv::Mat hp = g - blur;
  double mid = meanSquare(hp) + 1e-6, weakest = std::numeric_limits<double>::max();
  for (const cv::Mat& k : kernels()) {
    cv::Mat f;
    cv::filter2D(g, f, -1, k);
    weakest = std::min(weakest, meanSquare(f));
  }
  return weakest / mid;
}

double percentile(const cv::Mat& gray8, double q) {
  CV_Assert(gray8.type() == CV_8UC1 && !gray8.empty());
  std::array<long long, 256> hist{};
  for (int r = 0; r < gray8.rows; r++) {
    const uint8_t* row = gray8.ptr<uint8_t>(r);
    for (int c = 0; c < gray8.cols; c++) hist[row[c]]++;
  }
  long long n = static_cast<long long>(gray8.total());
  double pos = q / 100.0 * static_cast<double>(n - 1);
  long long lo = static_cast<long long>(std::floor(pos));
  double frac = pos - static_cast<double>(lo);
  int vlo = kth(hist, lo), vhi = kth(hist, std::min(lo + 1, n - 1));
  return vlo + (vhi - vlo) * frac;
}

double paperLight(const cv::Mat& gray) { return percentile(gray, 90); }

cv::Mat inkMap(const cv::Mat& gray) {
  cv::Mat s, th, small, m;
  cv::resize(gray, s, cv::Size(425, 550), 0, 0, cv::INTER_AREA);
  cv::adaptiveThreshold(s, th, 255, cv::ADAPTIVE_THRESH_MEAN_C, cv::THRESH_BINARY_INV, 25, 10);
  cv::resize(th, small, cv::Size(170, 220), 0, 0, cv::INTER_AREA);
  small.convertTo(m, CV_32F);
  m -= cv::mean(m)[0];
  double norm = cv::norm(m) + 1e-6;
  m.convertTo(m, CV_32F, 1.0 / norm);
  return m;
}

bool upsideDown(const cv::Mat& gray, const cv::Mat& ref) {
  cv::Mat m = inkMap(gray), turned;
  cv::flip(m, turned, -1);
  return turned.dot(ref) - m.dot(ref) > TURN_MARGIN;
}

}  // namespace mbm::quality
