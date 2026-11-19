// Straightening the MyBizMate Sales Invoice by its 4 corner squares: a port of Aligner.markers
// (prototype/benchmark/pipelines.py, the arbiter) by way of OcrEngine.markers in the Android test app.
#pragma once

#include <array>
#include <optional>

#include <opencv2/core.hpp>

#include "core/form_template.h"

namespace mbm {

// The homography from the photo (grey) to the page, or nullopt when the 4 corner squares aren't found. 3x3 CV_64F.
std::optional<cv::Mat> findMarkers(const cv::Mat& gray, const FormTemplate& form);

// The page's corner-square centres in the photo: tl, tr, br, bl.
std::array<cv::Point2f, 4> photoCorners(const cv::Mat& H, const FormTemplate& form);

}  // namespace mbm
