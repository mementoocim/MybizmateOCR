// Page 1 of a PDF for the scanner, by pdfium (bblanchon/pdfium-binaries chromium/8125, built without V8: no JavaScript,
// nothing fetched): rendered at the photo pipeline's size, with its visible text and where each character sits on that
// render. A form environment with no callbacks lets pdfium draw a filled form field that has no appearance of its own;
// it is never sent a form action or an input event. The person's file is only ever read.
#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

constexpr std::uintmax_t MAX_PDF_BYTES = 20u * 1024 * 1024;  // a bigger file is refused: "too_big"
// A page 1 whose long side is longer (in points) is refused: "page_too_big". It is the PDF format's own limit (200
// inches); within it, any size costs the same, since the page is always rendered MAX_SIDE px on its long side (a photo
// saved as a PDF at 1 px = 1 pt makes a page as big as the photo).
constexpr float MAX_PDF_PAGE_PT = 14400;

// One character of page 1's text and its boxes on the render, in pixels. A character pdfium adds itself (a space or a
// line break between two runs of text) has an empty box of both kinds, just after the character before it.
struct PdfChar {
  char32_t ch;
  cv::Rect2f box;    // its glyph's own box (the ink it draws)
  cv::Rect2f loose;  // its loose box: its advance along the line, the font's ascent to its descent across it
                     // (FPDFText_GetLooseCharBox), so its centre is the line's middle whatever the glyph; its glyph's
                     // box when pdfium gives none with an area (a character pdfium adds)
};

struct PdfPage {
  cv::Mat bgr;                 // page 1, its long side MAX_SIDE (2400) px, on white
  std::vector<PdfChar> chars;  // in pdfium's order, without the text no one sees: text in render mode 3 (invisible) or
                               // 7 (clip only), and text drawn before a page-size image (80% of the page or more)
  int pageCount = 0;
  bool picture = false;  // page 1 shows no characters (a scan, say): it is read like a photo
};

// A PDF the scanner refuses. code: "too_big" (over MAX_PDF_BYTES), "broken" (missing, unreadable, damaged, not a PDF,
// or no page), "password" (a password or another security scheme locks it) or "page_too_big" (over MAX_PDF_PAGE_PT).
struct PdfError : std::runtime_error {
  PdfError(std::string code, const std::string& message);
  std::string code;
};

// Page 1 of the PDF at `path`. When it has an annotation that draws something (a form field's value, a FreeText note, a
// stamp: anything but a link or a popup), a copy of the page is read instead, the annotations flattened into it: the
// copy holds its own copy of everything the page inherits (its /Resources, its boxes) and keeps the box the page shows.
// Calls run one at a time (pdfium isn't thread-safe). Throws PdfError.
PdfPage renderPdf(const std::string& path);

}  // namespace mbm
