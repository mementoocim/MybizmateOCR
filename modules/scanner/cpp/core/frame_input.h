// A camera frame's grey (Y) plane as the core wants it: rows unpadded, turned the right way up.
#pragma once

#include <cstdint>

#include <opencv2/core.hpp>

namespace mbm {

// y: the plane's first byte; rowStride: bytes per row (often wider than width); rotationDegrees: the clockwise turn
// that makes the frame upright (0, 90, 180 or 270; Android's ImageInfo.rotationDegrees). Copies the pixels.
cv::Mat uprightGray(const uint8_t* y, int width, int height, int rowStride, int rotationDegrees);

}  // namespace mbm
