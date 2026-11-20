// Page 1 of a PDF for the scanner, by pdfium (bblanchon/pdfium-binaries chromium/8125, built without V8: no JavaScript,
// no form actions, nothing fetched): rendered at the photo pipeline's size, with its visible text and where each
// character sits on that render.
#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

constexpr std::uintmax_t MAX_PDF_BYTES = 20u * 1024 * 1024;  // a bigger file is refused: "too_big"
constexpr float MAX_PDF_PAGE_PT = 2000;  // a page 1 whose long side is longer (in points) is refused: "page_too_big"

// One character of page 1's text and its box on the render, in pixels. A character pdfium adds itself (a space or a
// line break between two runs of text) has an empty box, just after the character before it.
struct PdfChar {
  char32_t ch;
  cv::Rect2f box;
};

struct PdfPage {
  cv::Mat bgr;                 // page 1, its long side MAX_SIDE (2400) px, on white
  std::vector<PdfChar> chars;  // in pdfium's order, without the invisible text (render mode 3)
  int pageCount = 0;
  bool picture = false;  // page 1 shows no characters (a scan, say): it is read like a photo
};

// A PDF the scanner refuses. code: "too_big" (over MAX_PDF_BYTES), "broken" (missing, unreadable, damaged, not a PDF,
// or no page), "password" (a password or another security scheme locks it) or "page_too_big" (over MAX_PDF_PAGE_PT).
struct PdfError : std::runtime_error {
  PdfError(std::string code, const std::string& message);
  std::string code;
};

// Page 1 of the PDF at `path`, its form fields' values flattened into the page first. Calls run one at a time (pdfium
// isn't thread-safe). Throws PdfError.
PdfPage renderPdf(const std::string& path);

}  // namespace mbm
