// Finding a frame form in a photo by its printed border (the Service Invoice's table border, the BIR 2307's outer
// border): a port of prototype/benchmark/frame_template.py (FrameAligner, the arbiter for the Service Invoice) by way of
// the Android test app's FrameTemplate.java. One aligner per template.
//
// Long straight lines (HoughLinesP) are the candidates for the border's sides: the template's maxLines longest in each
// direction. Every pair of near-horizontal and near-vertical lines that stops at its corners makes a candidate, tried
// in all 4 rotations. Each candidate is scored by how much of the template's printed grid lands on ink, minus the ink
// just beside it. The best one scoring at least 0.75 wins; its sides can then be refitted to the ink at full
// resolution.
#pragma once

#include <array>
#include <optional>
#include <vector>

#include <opencv2/core.hpp>

#include "core/service_template.h"

namespace mbm {

struct FrameFound {
  cv::Matx33d H;                       // photo -> page
  double score = 0;
  std::array<cv::Point2f, 4> corners;  // the border in the photo, as the form's tl, tr, br, bl
};

class FrameAligner {
 public:
  explicit FrameAligner(const ServiceTemplate& t);

  // gray: the photo (8-bit). refit: refine the corners at full resolution (scans); the live camera skips it.
  std::optional<FrameFound> find(const cv::Mat& gray, bool refit = true) const;

 private:
  using Quad = std::array<cv::Point2f, 4>;
  double score(const Quad& q, const cv::Mat& near, const cv::Mat& ink, int step) const;
  Quad refine(const cv::Mat& gray, const Quad& q) const;

  Quad dst_;        // the border's corners on the page (float32, as the Python's)
  float aspect_;    // its width over its height
  size_t maxLines_;  // candidate lines kept per direction (the template's maxLines)
  std::vector<cv::Point2f> on_, beside_;  // points on the printed rules, and OFF px either side of them
};

}  // namespace mbm
