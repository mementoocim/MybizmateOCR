// Cutting one box out of the straightened page: a port of crop_field (prototype/benchmark/pipelines.py, the arbiter)
// by way of OcrEngine.cropField and inkRatio in the Android test app.
#pragma once

#include <optional>

#include <opencv2/core.hpp>

namespace mbm {

// The box's writing (BGR), padded by 6 px, or nullopt when the box holds no stroke that looks like writing.
// inset: pixels trimmed from each side of the box first (6 for writing boxes).
std::optional<cv::Mat> cropField(const cv::Mat& pageBgr, const cv::Rect& box, int inset);

// The share of dark pixels in a checkbox (inset 3).
double inkRatio(const cv::Mat& pageBgr, const cv::Rect& box, int inset);

}  // namespace mbm
