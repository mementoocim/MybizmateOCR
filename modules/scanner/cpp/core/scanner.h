// One invoice photo in, every box's reading out: the port of OcrEngine.scan (Android test app) with the Python
// reference as the arbiter. That reference is prototype/benchmark: pipelines.ApproachB with the demo's photo cap, and
// frame_template.FrameReader for the Service Invoice. The MyBizMate Sales Invoice is found by its corner squares;
// failing that, a frame form by its printed border: the Service Invoice by its table border, or BIR Form 2307 (page 1;
// no Python reference) by its outer border, whichever is found with the higher score.
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

constexpr int MAX_SIDE = 2400;       // a photo's long side is shrunk to this before reading (the demo's cap)
constexpr int PAGE_SHOW = 1200;      // the saved page's width, for showing the scan
constexpr int ORIGINAL_SHOW = 900;   // the saved photo's width, for the scan view's Original

// What the scanner loads once: the recognizer, its characters, the forms' templates, the small blank form.
struct Assets {
  std::vector<uint8_t> model;    // inference_latin.onnx
  std::string dict;              // dict.txt
  std::string fieldMap;          // field_map.json (the MyBizMate Sales Invoice)
  std::vector<uint8_t> formPng;  // form_small.png (grey, 425 x 550)
  std::string serviceJson;       // service_invoice.json (the Service Invoice)
  std::string bir2307Json;       // bir_2307.json (BIR Form 2307, page 1)
  int threads = 4;
};

struct BoxRead {
  std::string name, type, text;
  float conf = 0;
  std::vector<std::string> alts;  // backup readings, most likely first
  cv::Size cropSize;              // the crop as the model saw it (a box read in 2 lines: the lines stacked)
  std::string cropFile;           // that crop, as a PNG in the scan's folder
};

struct Timing {
  double alignMs = 0, cropMs = 0, readMs = 0, totalMs = 0;
};

struct ScanResult {
  bool aligned = false;
  std::string form;  // "sales_invoice", "service_invoice", "bir_2307", or empty when no form was found
  cv::Size photoSize;  // after the MAX_SIDE cap
  bool turned = false;  // the page was upside down and was turned back (the Sales Invoice; a frame form's finder
                        // handles any turn itself)
  std::array<cv::Point2f, 4> corners{};  // in the photo, tl, tr, br, bl: the corner squares, or the frame's border
  double sharpness = 0, sharpMin = 0, light = 0, darkMax = 0;
  std::optional<std::string> terms;  // "cash", "account", or none when the ticks are unclear
  int blanks = 0;  // boxes with no writing (not counting the checkboxes): they aren't read
  std::vector<BoxRead> reads;  // in field order
  std::string pageFile;  // the straightened page (JPEG), or empty when not aligned
  std::string originalFile;  // the photo with the found outline drawn (JPEG), when files are kept
  std::string scanDir;  // the folder of the scan's files, or empty when they aren't kept
  Timing timing;
};

// What the live camera finds in one grey, upright frame: which form, the whole sheet's outline, and how sharp the
// frame is (straightened onto the form's page) against that form's live minimum.
struct FrameDetection {
  std::string form;                         // "sales_invoice", "service_invoice" or "bir_2307"
  std::array<cv::Point2f, 4> outline{};     // the sheet in the frame: tl, tr, br, bl
  double sharpness = 0, sharpMin = 0;
};

// The file isn't a photo OpenCV can open (missing, broken, not an image, or a format like HEIC).
struct UnreadableImage : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// Decodes a photo, applying its EXIF rotation; a long side over MAX_SIDE is shrunk (INTER_AREA) to the size a full
// decode would give. A JPEG over twice the cap is first decoded smaller by the JPEG decoder itself (jpegReduction).
// Throws UnreadableImage.
cv::Mat decodePhoto(const std::string& path);

// The size a JPEG's frame header gives (as stored, before any EXIF turn), read without decoding the photo; none for
// any other file.
std::optional<cv::Size> jpegSize(const std::string& path);

// How much smaller the JPEG decoder should decode a photo of this stored size: 1, 2, 4 or 8, the most that keeps its
// long side over MAX_SIDE. Only a photo over twice the cap is decoded smaller (a 50 MP photo in full needs about
// 150 MB); the rest decode in full, exactly as the Python reference does.
int jpegReduction(cv::Size stored);

class Scanner {
 public:
  explicit Scanner(const Assets& assets);
  ~Scanner();
  Scanner(const Scanner&) = delete;
  Scanner& operator=(const Scanner&) = delete;

  // decodePhoto, then scanImage. outDir receives page.jpg, original.jpg and one <name>.png per read; it is created
  // when missing. An empty outDir writes nothing.
  ScanResult scanPhoto(const std::string& photoPath, const std::string& outDir);

  // An already decoded and capped photo (BGR). Scans run one at a time.
  ScanResult scanImage(const cv::Mat& bgr, const std::string& outDir);

  // The live camera's check of one frame (grey, upright; see frame_input.h): the corner squares first, else the frame
  // forms' borders, as a scan finds them but without the corner refit (the test app's OcrEngine.detect). The outline
  // is the found form's sheet (a frame form's paper). Reads only what the scanner loaded, so it never waits for a scan.
  std::optional<FrameDetection> detectFrame(const cv::Mat& gray) const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace mbm
