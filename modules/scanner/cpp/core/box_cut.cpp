#include "core/box_cut.h"

#include <algorithm>
#include <cmath>
#include <set>
#include <utility>

#include <opencv2/imgproc.hpp>

#include "core/numpy_compat.h"
#include "core/photo_quality.h"

namespace mbm {

namespace {

constexpr int BRIDGE = 12;  // px: pen on both sides of a rule, within this distance, means a stroke crosses it
constexpr int PAD = 6;
// A comb's tick: the short line standing on a comb box's bottom rule between two digit cells, as measured on the
// 2307's photos and PDF pages once that rule is erased (174 ticks). A typed digit there is 10 px wide or more, at least
// 0.52 of the box's height, and 7 px or more above the rule.
constexpr int TICK_W = 5;         // px: at most this wide (2-4 measured)
constexpr double TICK_H = 0.5;    // of the box's height: at most this tall (0.28-0.35 measured)
constexpr int TICK_FOOT = 4;      // px: its foot within this of a printed horizontal rule's ink (0 measured)

// _rules: the printed rules' ink in a box, horizontal and vertical (0/1). The horizontal kernel is short so a rule
// that bows a few pixels across the page still counts as one.
void findRules(const cv::Mat& ink, int coreW, int coreH, cv::Mat& hz, cv::Mat& vt) {
  const int kx = std::max(40, std::min(static_cast<int>(0.35 * coreW), 120));
  const int ky = std::max(30, static_cast<int>(0.9 * coreH));
  cv::Mat thick;
  cv::dilate(ink, thick, cv::Mat::ones(5, 1, CV_8U));
  cv::morphologyEx(thick, hz, cv::MORPH_OPEN, cv::getStructuringElement(cv::MORPH_RECT, cv::Size(kx, 1)));
  cv::dilate(ink, thick, cv::Mat::ones(1, 5, CV_8U));
  cv::morphologyEx(thick, vt, cv::MORPH_OPEN, cv::getStructuringElement(cv::MORPH_RECT, cv::Size(1, ky)));
  const cv::Mat k3 = cv::Mat::ones(3, 3, CV_8U);
  cv::dilate(hz, hz, k3);
  cv::dilate(vt, vt, k3);
  cv::bitwise_and(hz, ink, hz);
  cv::bitwise_and(vt, ink, vt);
}

// A comb box's ticks (0/1): the strokes in its pen (its ink less the rules) that are thin, short and stand on a printed
// horizontal rule. There is no Python reference: the 2307 is new.
cv::Mat combTicks(const cv::Mat& pen, const cv::Mat& hz, int coreH) {
  cv::Mat labels, stats, cents;
  const int n = cv::connectedComponentsWithStats(pen, labels, stats, cents, 8, CV_32S);
  cv::Mat foot;  // a horizontal rule's ink and the TICK_FOOT px above it
  cv::dilate(hz, foot, cv::Mat::ones(TICK_FOOT + 1, 1, CV_8U), cv::Point(0, 0));
  std::vector<char> standing(n, 0);
  for (int y = 0; y < pen.rows; y++) {
    const int* l = labels.ptr<int>(y);
    const uint8_t* f = foot.ptr<uint8_t>(y);
    for (int x = 0; x < pen.cols; x++) {
      if (l[x] != 0 && f[x] != 0) standing[l[x]] = 1;
    }
  }
  std::vector<char> tick(n, 0);
  for (int i = 1; i < n; i++) {
    tick[i] = standing[i] && stats.at<int>(i, cv::CC_STAT_WIDTH) <= TICK_W &&
              stats.at<int>(i, cv::CC_STAT_HEIGHT) <= TICK_H * coreH;
  }
  cv::Mat ticks = cv::Mat::zeros(pen.size(), CV_8U);
  for (int y = 0; y < pen.rows; y++) {
    const int* l = labels.ptr<int>(y);
    uint8_t* t = ticks.ptr<uint8_t>(y);
    for (int x = 0; x < pen.cols; x++) t[x] = tick[l[x]] ? 1 : 0;
  }
  return ticks;
}

// _reach: 1 where the mask has ink within BRIDGE px up (dy -1), down (dy 1), left (dx -1) or right (dx 1), give or
// take 2 px sideways so a slanted stroke still counts.
cv::Mat reach(const cv::Mat& mask, int dy, int dx) {
  cv::Mat out;
  if (dy != 0) {
    cv::dilate(mask, out, cv::Mat::ones(BRIDGE + 1, 5, CV_8U), cv::Point(2, dy < 0 ? BRIDGE : 0));
  } else {
    cv::dilate(mask, out, cv::Mat::ones(5, BRIDGE + 1, CV_8U), cv::Point(dx < 0 ? BRIDGE : 0, 2));
  }
  return out;
}

// _line_bands: the row ranges of the text lines in a box: one, or two when the strokes' centres form two rows. Two
// lines are cut apart at the emptiest row between them.
std::vector<std::pair<int, int>> lineBands(const cv::Mat& mask, const std::vector<int>& comps, const cv::Mat& stats,
                                           const cv::Mat& cents) {
  std::vector<double> rowInk(mask.rows);
  int first = -1, last = -1;
  for (int y = 0; y < mask.rows; y++) {
    const int n = cv::countNonZero(mask.row(y));
    rowInk[y] = n;
    if (n > 0) {
      if (first < 0) first = y;
      last = y;
    }
  }
  const std::vector<std::pair<int, int>> whole = {{first, last + 1}};
  if (comps.size() < 4) return whole;
  std::vector<double> ys, ws;
  std::vector<int> heights;
  for (int i : comps) {
    ys.push_back(cents.at<double>(i, 1));
    ws.push_back(stats.at<int>(i, cv::CC_STAT_AREA));
    heights.push_back(stats.at<int>(i, cv::CC_STAT_HEIGHT));
  }
  double lo = *std::min_element(ys.begin(), ys.end()), hi = *std::max_element(ys.begin(), ys.end());
  std::vector<char> upper(ys.size());
  auto weights = [&](bool side) {
    std::vector<double> w;
    for (size_t k = 0; k < ys.size(); k++) {
      if ((upper[k] != 0) == side) w.push_back(ws[k]);
    }
    return w;
  };
  auto average = [&](bool side) {  // np.average(ys[side], weights=ws[side])
    std::vector<double> product;
    for (size_t k = 0; k < ys.size(); k++) {
      if ((upper[k] != 0) == side) product.push_back(ys[k] * ws[k]);
    }
    return npSum(product) / npSum(weights(side));
  };
  for (int it = 0; it < 10; it++) {  // two-means on the centre heights, weighted by ink
    bool all = true, any = false;
    for (size_t k = 0; k < ys.size(); k++) {
      upper[k] = std::abs(ys[k] - lo) <= std::abs(ys[k] - hi);
      all = all && upper[k];
      any = any || upper[k];
    }
    if (all || !any) return whole;
    const double newLo = average(true), newHi = average(false);
    lo = newLo;
    hi = newHi;
  }
  std::sort(heights.begin(), heights.end());
  const size_t m = heights.size();
  const double letter = m % 2 ? heights[m / 2] : (heights[m / 2 - 1] + heights[m / 2]) / 2.0;  // np.median
  if (hi - lo < 0.6 * letter || std::min(npSum(weights(true)), npSum(weights(false))) < 0.15 * npSum(ws)) {
    return whole;
  }
  // the rows' ink smoothed over 5 rows: np.convolve(..., np.ones(5) / 5, mode="same"), summed left to right
  const int n = mask.rows;
  const double fifth = 1.0 / 5;
  std::vector<double> prof(n);
  for (int i = 0; i < n; i++) {
    double s = 0;
    for (int j = std::max(0, i - 2); j <= std::min(n - 1, i + 2); j++) s += rowInk[j] * fifth;
    prof[i] = s;
  }
  const int a = static_cast<int>(std::nearbyint(lo)), b = static_cast<int>(std::nearbyint(hi));
  int cut = a;
  for (int y = a + 1; y <= std::min(b, n - 1); y++) {
    if (prof[y] < prof[cut]) cut = y;  // np.argmin: the first of equals
  }
  return {{whole[0].first, cut}, {cut, whole[0].second}};
}

}  // namespace

std::vector<cv::Mat> cropBox(const cv::Mat& page, const ServiceField& field, cv::Vec2i slack) {
  const int x0 = field.box.x, y0 = field.box.y, x1 = field.box.x + field.box.width, y1 = field.box.y + field.box.height;
  const cv::Rect grab = field.grab ? *field.grab : cv::Rect(x0 - 4, y0 - 2, (x1 + 4) - (x0 - 4), (y1 + 2) - (y0 - 2));
  const int gx0 = grab.x, gy0 = grab.y, gx1 = grab.x + grab.width, gy1 = grab.y + grab.height;
  const int ex0 = std::max(0, std::min(x0, gx0) - slack[0]), ey0 = std::max(0, y0 - slack[1]);
  const int ex1 = std::min(page.cols, std::max(x1, gx1) + slack[0]), ey1 = std::min(page.rows, y1 + slack[1]);
  const cv::Mat roi = page(cv::Rect(ex0, ey0, ex1 - ex0, ey1 - ey0));
  cv::Mat gray;
  cv::cvtColor(roi, gray, cv::COLOR_BGR2GRAY);
  const double paper = quality::percentile(gray, 90);
  const double thr = paper - std::max(35.0, paper * 0.2);
  cv::Mat ink(gray.size(), CV_8U);
  for (int y = 0; y < gray.rows; y++) {
    const uint8_t* g = gray.ptr<uint8_t>(y);
    uint8_t* k = ink.ptr<uint8_t>(y);
    for (int x = 0; x < gray.cols; x++) k[x] = g[x] < thr ? 1 : 0;
  }
  const int coreH = y1 - y0;
  cv::Mat hz, vt;
  findRules(ink, x1 - x0, coreH, hz, vt);
  cv::Mat ruled, pen, notRuled;
  cv::bitwise_or(hz, vt, ruled);
  cv::subtract(cv::Scalar(1), ruled, notRuled);
  cv::bitwise_and(ink, notRuled, pen);
  if (field.comb) {
    // A comb's ticks are erased with the rules, and never kept as a crossing (one stands between two digits). A TIN's
    // grey dash cells need nothing more: each is solid ink as tall as the box, so the vertical rules take it whole.
    const cv::Mat ticks = combTicks(pen, hz, coreH);
    cv::bitwise_or(ruled, ticks, ruled);
    pen.setTo(0, ticks);
  }
  cv::Mat across, along, bridge;  // pen on both sides of a rule: a stroke crossing it
  cv::bitwise_and(hz, reach(pen, -1, 0), across);
  cv::bitwise_and(across, reach(pen, 1, 0), across);
  cv::bitwise_and(vt, reach(pen, 0, -1), along);
  cv::bitwise_and(along, reach(pen, 0, 1), along);
  cv::bitwise_or(across, along, bridge);

  cv::Mat labels, stats, cents;
  const int n = cv::connectedComponentsWithStats(pen, labels, stats, cents, 8, CV_32S);
  std::vector<char> big(n), mine(n);
  for (int i = 0; i < n; i++) {
    big[i] = stats.at<int>(i, cv::CC_STAT_HEIGHT) >= 0.3 * coreH || stats.at<int>(i, cv::CC_STAT_AREA) >= 40;
    const double cx = cents.at<double>(i, 0) + ex0, cy = cents.at<double>(i, 1) + ey0;
    mine[i] = big[i] && cx >= gx0 && cx <= gx1 && cy >= gy0 && cy <= gy1;
  }
  mine[0] = false;
  if (std::none_of(mine.begin(), mine.end(), [](char m) { return m != 0; })) return {};

  cv::Mat penOrBridge, joined;
  cv::bitwise_or(pen, bridge, penOrBridge);
  cv::connectedComponents(penOrBridge, joined, 8, CV_32S);
  std::vector<int> group(n, 0);  // each stroke's group once rule crossings are joined
  for (int y = 0; y < labels.rows; y++) {
    const int* l = labels.ptr<int>(y);
    const int* j = joined.ptr<int>(y);
    for (int x = 0; x < labels.cols; x++) {
      if (l[x] != 0) group[l[x]] = j[x];
    }
  }
  std::set<int> myGroups;
  for (int i = 1; i < n; i++) {
    if (mine[i]) myGroups.insert(group[i]);
  }
  for (int i = 1; i < n; i++) {  // the pieces of my strokes that poke past a rule
    const bool overflow =
        !mine[i] && myGroups.count(group[i]) > 0 && stats.at<int>(i, cv::CC_STAT_HEIGHT) <= 0.6 * coreH;
    if (overflow) mine[i] = 1;
  }
  std::vector<char> foreign(n);
  for (int i = 1; i < n; i++) foreign[i] = big[i] && !mine[i];

  const auto paperGray = static_cast<uint8_t>(static_cast<int>(paper));  // int(paper)
  cv::Mat clean = roi.clone();
  cv::Mat mask = cv::Mat::zeros(roi.size(), CV_8U);
  for (int y = 0; y < roi.rows; y++) {
    const int* l = labels.ptr<int>(y);
    const int* j = joined.ptr<int>(y);
    const uint8_t* r = ruled.ptr<uint8_t>(y);
    const uint8_t* b = bridge.ptr<uint8_t>(y);
    cv::Vec3b* c = clean.ptr<cv::Vec3b>(y);
    uint8_t* m = mask.ptr<uint8_t>(y);
    for (int x = 0; x < roi.cols; x++) {
      const bool keepBridge = b[x] > 0 && myGroups.count(j[x]) > 0;
      if ((r[x] > 0 && !keepBridge) || foreign[l[x]]) c[x] = cv::Vec3b(paperGray, paperGray, paperGray);
      m[x] = (mine[l[x]] || keepBridge) ? 1 : 0;
    }
  }

  std::vector<std::pair<int, int>> bands = {{0, roi.rows}};
  if (field.multiline) {
    std::vector<int> comps;
    for (int i = 0; i < n; i++) {
      if (mine[i]) comps.push_back(i);
    }
    bands = lineBands(mask, comps, stats, cents);
  }
  std::vector<cv::Mat> out;
  for (size_t k = 0; k < bands.size(); k++) {
    const auto [r0, r1] = bands[k];
    const cv::Mat sub = mask.rowRange(r0, r1);
    int rowFirst = -1, rowLast = -1;
    for (int y = 0; y < sub.rows; y++) {
      if (cv::countNonZero(sub.row(y)) > 0) {
        if (rowFirst < 0) rowFirst = y;
        rowLast = y;
      }
    }
    if (rowFirst < 0) continue;
    cv::Mat colInk;
    cv::reduce(sub, colInk, 0, cv::REDUCE_MAX);
    int colFirst = -1, colLast = -1;
    for (int x = 0; x < colInk.cols; x++) {
      if (colInk.at<uint8_t>(0, x) > 0) {
        if (colFirst < 0) colFirst = x;
        colLast = x;
      }
    }
    const int ya = std::max(0, r0 + rowFirst - (k == 0 ? PAD : 0));
    const int yb = std::min(roi.rows, r0 + rowLast + 1 + (k == bands.size() - 1 ? PAD : 0));
    const int xa = std::max(0, colFirst - PAD), xb = std::min(roi.cols, colLast + PAD + 1);
    out.push_back(clean(cv::Rect(xa, ya, xb - xa, yb - ya)).clone());
  }
  return out;
}

}  // namespace mbm
