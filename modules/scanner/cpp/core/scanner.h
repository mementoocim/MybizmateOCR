// One photo of a MyBizMate Sales Invoice in, every box's reading out: the port of OcrEngine.scan (Android test app)
// with the Python reference (prototype/benchmark: pipelines.ApproachB with the demo's photo cap) as the arbiter.
#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

constexpr int MAX_SIDE = 2400;   // a photo's long side is shrunk to this before reading (the demo's cap)
constexpr int PAGE_SHOW = 1200;  // the saved page's width, for showing the scan

// What the scanner loads once: the recognizer, its characters, the form's field map, the small blank form.
struct Assets {
  std::vector<uint8_t> model;    // inference_latin.onnx
  std::string dict;              // dict.txt
  std::string fieldMap;          // field_map.json
  std::vector<uint8_t> formPng;  // form_small.png (grey, 425 x 550)
  int threads = 4;
};

struct BoxRead {
  std::string name, type, text;
  float conf = 0;
  std::vector<std::string> alts;  // backup readings, most likely first
  cv::Size cropSize;              // the crop as the model saw it
  std::string cropFile;           // that crop, as a PNG in the scan's folder
};

struct Timing {
  double alignMs = 0, cropMs = 0, readMs = 0, totalMs = 0;
};

struct ScanResult {
  bool aligned = false;
  std::string form;  // "sales_invoice", or empty when no form was found
  cv::Size photoSize;  // after the MAX_SIDE cap
  bool turned = false;  // the page was upside down and was turned back
  std::array<cv::Point2f, 4> corners{};  // the corner squares in the photo: tl, tr, br, bl
  double sharpness = 0, sharpMin = 0, light = 0;
  std::optional<std::string> terms;  // "cash", "account", or none when the ticks are unclear
  int blanks = 0;  // boxes with no writing (not counting the checkboxes)
  std::vector<BoxRead> reads;  // in field order
  std::string pageFile;  // the straightened page (JPEG), or empty when not aligned
  Timing timing;
};

// The file isn't a photo OpenCV can open (missing, broken, not an image, or a format like HEIC).
struct UnreadableImage : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// Decodes a photo, applying its EXIF rotation; a long side over MAX_SIDE is shrunk (INTER_AREA). Throws
// UnreadableImage.
cv::Mat decodePhoto(const std::string& path);

class Scanner {
 public:
  explicit Scanner(const Assets& assets);
  ~Scanner();
  Scanner(const Scanner&) = delete;
  Scanner& operator=(const Scanner&) = delete;

  // decodePhoto, then scanImage. outDir receives page.jpg and one <name>.png per read; it is created when missing.
  ScanResult scanPhoto(const std::string& photoPath, const std::string& outDir);

  // An already decoded and capped photo (BGR). Scans run one at a time.
  ScanResult scanImage(const cv::Mat& bgr, const std::string& outDir);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace mbm
