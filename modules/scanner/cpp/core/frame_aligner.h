// Finding a frame form in a photo by its printed border (the Service Invoice's table border, the BIR 2307's outer
// border): a port of prototype/benchmark/frame_template.py (FrameAligner, the arbiter for the Service Invoice) by way of
// the Android test app's FrameTemplate.java. One aligner per template.
//
// Long straight lines (HoughLinesP) are the candidates for the border's sides: the template's maxLines longest in each
// direction. They are found once per photo (findFrameLines) and shared by every frame form's aligner. Every pair of
// near-horizontal and near-vertical lines that stops at its corners makes a candidate, tried in all 4 rotations. Each
// candidate is scored by how much of the template's printed grid lands on ink, minus the ink just beside it. The best
// one scoring at least 0.75 wins; its sides can then be refitted to the ink at full resolution.
//
// A template can ask for two changes to the scoring (the BIR 2307 does; the Service Invoice keeps the Python's): its
// finalists' corners refitted before their full score (refitFinalists), and the points beside a rule that lie on
// another of its rules left out (besideClear).
#pragma once

#include <array>
#include <optional>
#include <vector>

#include <opencv2/core.hpp>

#include "core/service_template.h"

namespace mbm {

// A straight line in a photo: its weighted centre, unit direction, and how much of it the merged segments cover.
struct FrameLine {
  cv::Vec2d c, d;
  double covered = 0;
};

// One photo's long straight lines, found once for every frame form: the threshold, HoughLinesP and the merge. They lie
// on the work copy (the photo shrunk so its long side is at most 1400 px), longest first, each covering at least 0.15
// of the work copy's short side.
struct FrameLines {
  double scale = 1;                             // the work copy's size over the photo's
  cv::Mat ink, near;                            // the work copy's ink (0 or 255), and that ink dilated 5 x 5
  std::vector<FrameLine> horizontal, vertical;  // longest first
};

// None when the photo is too small to hold a form or has no long straight line.
std::optional<FrameLines> findFrameLines(const cv::Mat& gray);

struct FrameFound {
  cv::Matx33d H;                       // photo -> page
  double score = 0;
  std::array<cv::Point2f, 4> corners;  // the border in the photo, as the form's tl, tr, br, bl
};

class FrameAligner {
 public:
  explicit FrameAligner(const ServiceTemplate& t);

  // gray: the photo (8-bit). refit: refine the corners at full resolution (scans); the live camera skips it, unless the
  // template refits its finalists anyway (its score depends on it).
  std::optional<FrameFound> find(const cv::Mat& gray, bool refit = true) const;

  // The same, on gray's lines already found by findFrameLines (so the frame forms share one line search).
  std::optional<FrameFound> find(const FrameLines& lines, const cv::Mat& gray, bool refit) const;

 private:
  using Quad = std::array<cv::Point2f, 4>;
  struct FullInk;  // the photo's ink at full size, which corners are refitted to
  double score(const Quad& q, const cv::Mat& near, const cv::Mat& ink, int step) const;
  Quad refine(const FullInk& ink, const Quad& q) const;

  Quad dst_;               // the border's corners on the page (float32, as the Python's)
  float aspect_;           // its width over its height
  size_t maxLines_;        // candidate lines kept per direction (the template's maxLines)
  bool refitFinalists_;    // the template's refitFinalists
  std::vector<cv::Point2f> on_, beside_;  // points on the printed rules, and OFF px either side of them
};

}  // namespace mbm
