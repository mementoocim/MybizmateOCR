#include "core/crop.h"

#include <algorithm>
#include <vector>

#include <opencv2/imgproc.hpp>

#include "core/photo_quality.h"

namespace mbm {

namespace {

struct Ink {
  cv::Mat roi;   // the box's pixels (BGR), a view into the page
  cv::Mat mask;  // 1 where a pixel is darker than the paper by enough to be ink (CV_8U)
  int count = 0;
};

// Ink: darker than the paper's 90th percentile by max(35, 20% of it), compared exactly like numpy's `gray < thr`.
Ink inkOf(const cv::Mat& pageBgr, const cv::Rect& box, int inset) {
  Ink ink;
  ink.roi = pageBgr(cv::Rect(box.x + inset, box.y + inset, box.width - 2 * inset, box.height - 2 * inset));
  cv::Mat gray;
  cv::cvtColor(ink.roi, gray, cv::COLOR_BGR2GRAY);
  const double paper = quality::percentile(gray, 90);
  const double thr = paper - std::max(35.0, paper * 0.2);
  ink.mask = cv::Mat::zeros(gray.size(), CV_8U);
  for (int y = 0; y < gray.rows; y++) {
    const uint8_t* g = gray.ptr<uint8_t>(y);
    uint8_t* m = ink.mask.ptr<uint8_t>(y);
    for (int x = 0; x < gray.cols; x++) {
      if (g[x] < thr) {
        m[x] = 1;
        ink.count++;
      }
    }
  }
  return ink;
}

}  // namespace

double inkRatio(const cv::Mat& pageBgr, const cv::Rect& box, int inset) {
  Ink ink = inkOf(pageBgr, box, inset);
  return ink.count / static_cast<double>(ink.mask.total());
}

std::optional<cv::Mat> cropField(const cv::Mat& pageBgr, const cv::Rect& box, int inset) {
  Ink ink = inkOf(pageBgr, box, inset);
  const int h = ink.mask.rows, w = ink.mask.cols;
  cv::Mat labels, stats, centroids;
  const int n = cv::connectedComponentsWithStats(ink.mask, labels, stats, centroids, 8, CV_32S);
  // Keep strokes that look like writing (tall enough or big enough), so a thin "1" counts and specks don't.
  std::vector<bool> keep(n, false);
  bool any = false;
  for (int i = 1; i < n; i++) {
    if (stats.at<int>(i, cv::CC_STAT_HEIGHT) >= 0.3 * h || stats.at<int>(i, cv::CC_STAT_AREA) >= 40) {
      keep[i] = true;
      any = true;
    }
  }
  if (!any) return std::nullopt;
  int minX = w, maxX = -1, minY = h, maxY = -1;
  for (int y = 0; y < h; y++) {
    const int* lab = labels.ptr<int>(y);
    for (int x = 0; x < w; x++) {
      if (!keep[lab[x]]) continue;
      minX = std::min(minX, x);
      maxX = std::max(maxX, x);
      minY = std::min(minY, y);
      maxY = std::max(maxY, y);
    }
  }
  const int pad = 6;
  const int xa = std::max(0, minX - pad), xb = std::min(w, maxX + pad + 1);
  const int ya = std::max(0, minY - pad), yb = std::min(h, maxY + pad + 1);
  return ink.roi(cv::Rect(xa, ya, xb - xa, yb - ya)).clone();
}

}  // namespace mbm
