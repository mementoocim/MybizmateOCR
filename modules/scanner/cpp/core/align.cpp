#include "core/align.h"

#include <algorithm>
#include <climits>
#include <cmath>
#include <vector>

#include <opencv2/opencv.hpp>  // OpenCV 5 keeps the contour functions in its geometry module

namespace mbm {

namespace {

float dist(const cv::Point2f& a, const cv::Point2f& b) { return std::hypot(a.x - b.x, a.y - b.y); }

}  // namespace

std::optional<cv::Mat> findMarkers(const cv::Mat& gray, const FormTemplate& form) {
  const int h = gray.rows, w = gray.cols;
  const double mn = std::min(h, w);
  cv::Mat blur, th;
  cv::GaussianBlur(gray, blur, cv::Size(5, 5), 0);
  const int block = static_cast<int>(mn * 0.06) | 1;
  if (block < 3) return std::nullopt;  // an image this small (short side under 34 px) can't show the corner squares
  cv::adaptiveThreshold(blur, th, 255, cv::ADAPTIVE_THRESH_MEAN_C, cv::THRESH_BINARY_INV, block, 25);
  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(th, contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);

  const double lo = std::pow(mn * 0.012, 2), hi = std::pow(mn * 0.06, 2);
  std::vector<cv::Point2d> cands;
  for (const auto& c : contours) {
    const double area = cv::contourArea(c);
    if (!(lo < area && area < hi)) continue;
    const cv::Rect r = cv::boundingRect(c);
    const double ar = r.width / static_cast<double>(r.height);
    if (!(0.6 < ar && ar < 1.6) || area / (static_cast<double>(r.width) * r.height) < 0.6) continue;
    std::vector<cv::Point> hull;
    cv::convexHull(c, hull);
    if (area / std::max(cv::contourArea(hull), 1.0) < 0.85) continue;
    cv::Mat mask = cv::Mat::zeros(r.height, r.width, CV_8U);
    cv::drawContours(mask, std::vector<std::vector<cv::Point>>{c}, -1, cv::Scalar(255), cv::FILLED, cv::LINE_8,
                     cv::noArray(), INT_MAX, cv::Point(-r.x, -r.y));
    if (cv::mean(gray(r), mask)[0] > 100) continue;  // a corner square is solid dark ink
    const cv::Moments m = cv::moments(c);
    cands.emplace_back(m.m10 / m.m00, m.m01 / m.m00);
  }
  if (cands.size() < 4) return std::nullopt;

  // tl: smallest x+y, br: largest x+y, tr: largest x-y, bl: smallest x-y; the first wins ties, like numpy.
  size_t tl = 0, tr = 0, br = 0, bl = 0;
  for (size_t i = 1; i < cands.size(); i++) {
    const double s = cands[i].x + cands[i].y, d = cands[i].x - cands[i].y;
    if (s < cands[tl].x + cands[tl].y) tl = i;
    if (s > cands[br].x + cands[br].y) br = i;
    if (d > cands[tr].x - cands[tr].y) tr = i;
    if (d < cands[bl].x - cands[bl].y) bl = i;
  }
  // The Python keeps the quad as float32.
  std::vector<cv::Point2f> quad = {cv::Point2f(cands[tl]), cv::Point2f(cands[tr]), cv::Point2f(cands[br]),
                                   cv::Point2f(cands[bl])};
  for (int i = 0; i < 4; i++)
    for (int j = i + 1; j < 4; j++)
      if (quad[i] == quad[j]) return std::nullopt;
  if (!cv::isContourConvex(quad)) return std::nullopt;

  const auto& dst = form.markers;
  const float wq = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const float hq = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const float ref = (dst[1].x - dst[0].x) / (dst[3].y - dst[0].y);
  if (hq == 0 || std::abs(wq / hq - ref) / ref > 0.25f || wq * hq < 0.2 * h * w) return std::nullopt;
  return cv::getPerspectiveTransform(quad, std::vector<cv::Point2f>(dst.begin(), dst.end()));
}

std::array<cv::Point2f, 4> photoCorners(const cv::Mat& H, const FormTemplate& form) {
  std::vector<cv::Point2f> page(form.markers.begin(), form.markers.end()), photo;
  cv::perspectiveTransform(page, photo, H.inv());
  return {photo[0], photo[1], photo[2], photo[3]};
}

}  // namespace mbm
