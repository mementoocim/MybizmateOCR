#include "core/frame_input.h"

namespace mbm {

cv::Mat uprightGray(const uint8_t* y, int width, int height, int rowStride, int rotationDegrees) {
  const cv::Mat plane(height, width, CV_8UC1, const_cast<uint8_t*>(y), static_cast<size_t>(rowStride));
  cv::Mat out;
  switch (((rotationDegrees % 360) + 360) % 360) {
    case 90:
      cv::rotate(plane, out, cv::ROTATE_90_CLOCKWISE);
      break;
    case 180:
      cv::rotate(plane, out, cv::ROTATE_180);
      break;
    case 270:
      cv::rotate(plane, out, cv::ROTATE_90_COUNTERCLOCKWISE);
      break;
    default:
      out = plane.clone();
  }
  return out;
}

}  // namespace mbm
