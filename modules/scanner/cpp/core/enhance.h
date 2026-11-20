// The scan view's clean-ups of a straightened page, for showing and saving it (not for reading the boxes): a port of
// prototype/benchmark/enhance.py (the arbiter) by way of the Android test app's Enhance.java.
#pragma once

#include <opencv2/core.hpp>

namespace mbm {

// Enhanced: flat white paper (shadows and uneven light divided out), deeper ink, a little sharper, colours kept.
cv::Mat enhanced(const cv::Mat& bgr);

// B&W: the same as pure black ink on white (8-bit, single channel, 0 or 255).
cv::Mat blackWhite(const cv::Mat& bgr);

}  // namespace mbm
