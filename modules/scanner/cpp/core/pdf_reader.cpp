#include "core/pdf_reader.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <mutex>
#include <new>
#include <system_error>
#include <utility>

#include <opencv2/imgproc.hpp>

#include "core/scanner.h"  // MAX_SIDE
#include "cpp/fpdf_scopers.h"
#include "fpdf_edit.h"
#include "fpdf_flatten.h"
#include "fpdf_text.h"
#include "fpdfview.h"

namespace mbm {

PdfError::PdfError(std::string c, const std::string& message) : std::runtime_error(message), code(std::move(c)) {}

namespace {

// pdfium isn't thread-safe: every call into it holds this lock.
std::mutex gPdfium;

// pdfium's set-up, once per process, under gPdfium. This build has no V8, so the config names no isolate or platform.
void initPdfium() {
  static const bool ready = [] {
    FPDF_LIBRARY_CONFIG config{};
    config.version = 2;
    FPDF_InitLibraryWithConfig(&config);
    return true;
  }();
  (void)ready;
}

// The refusal for a code, in plain words (never the file's name or content: the message may be logged).
PdfError refusal(const std::string& code) {
  const char* why = code == "too_big"        ? "the PDF is over 20 MB"
                    : code == "password"     ? "the PDF is locked with a password"
                    : code == "page_too_big" ? "the PDF's page 1 is over 2000 pt long"
                                             : "the PDF can't be read";
  return PdfError(code, why);
}

// Why FPDF_LoadDocument failed, as a refusal code.
std::string loadErrorCode() {
  switch (FPDF_GetLastError()) {
    case FPDF_ERR_PASSWORD:  // a password is needed
    case FPDF_ERR_SECURITY:  // locked by a security scheme pdfium can't open
      return "password";
    default:  // missing, unreadable, damaged past repair, or not a PDF
      return "broken";
  }
}

// Where a point of the page (PDF user space) lands on the render, by pdfium's own transform, the one it renders with:
// the page box's origin and the page's /Rotate count. For an upright page whose box starts at 0,0 that is x * scale,
// (H - y) * scale. pdfium answers in whole pixels, so it is asked at SUB times the render's size.
cv::Point2f onRender(FPDF_PAGE page, cv::Size size, double x, double y) {
  constexpr int SUB = 64;
  int dx = 0, dy = 0;
  FPDF_PageToDevice(page, 0, 0, size.width * SUB, size.height * SUB, 0, x, y, &dx, &dy);
  return {static_cast<float>(dx) / SUB, static_cast<float>(dy) / SUB};
}

// Whether a character puts ink on the page: not a space, a line break or another control character.
bool inks(char32_t c) { return c > 0x20 && !(c >= 0x7F && c <= 0xA0); }

}  // namespace

PdfPage renderPdf(const std::string& path) {
  std::error_code error;
  const std::uintmax_t bytes = std::filesystem::file_size(path, error);
  if (error) throw refusal("broken");
  if (bytes > MAX_PDF_BYTES) throw refusal("too_big");

  std::lock_guard<std::mutex> lock(gPdfium);
  initPdfium();
  ScopedFPDFDocument doc(FPDF_LoadDocument(path.c_str(), nullptr));
  if (!doc) throw refusal(loadErrorCode());
  PdfPage out;
  out.pageCount = FPDF_GetPageCount(doc.get());
  ScopedFPDFPage page(out.pageCount > 0 ? FPDF_LoadPage(doc.get(), 0) : nullptr);
  if (!page) throw refusal("broken");
  const float w = FPDF_GetPageWidthF(page.get()), h = FPDF_GetPageHeightF(page.get());  // as shown, /Rotate applied
  if (!(w > 0 && h > 0)) throw refusal("broken");
  if (std::max(w, h) > MAX_PDF_PAGE_PT) throw refusal("page_too_big");

  // Form fields' values become page content: without a form handle, pdfium neither draws them nor lists their text.
  // The flattened page is read again from the document.
  if (FPDFPage_Flatten(page.get(), FLAT_NORMALDISPLAY) == FLATTEN_SUCCESS) {
    page.reset();
    page.reset(FPDF_LoadPage(doc.get(), 0));
    if (!page) throw refusal("broken");
  }

  const double scale = static_cast<double>(MAX_SIDE) / std::max(w, h);
  const cv::Size size(std::max(1, static_cast<int>(std::lround(w * scale))),
                      std::max(1, static_cast<int>(std::lround(h * scale))));
  ScopedFPDFBitmap bitmap(FPDFBitmap_CreateEx(size.width, size.height, FPDFBitmap_BGRx, nullptr, 0));
  if (!bitmap) throw std::bad_alloc();
  FPDFBitmap_FillRect(bitmap.get(), 0, 0, size.width, size.height, 0xFFFFFFFF);  // white paper
  FPDF_RenderPageBitmap(bitmap.get(), page.get(), 0, 0, size.width, size.height, 0, FPDF_ANNOT);
  const cv::Mat bgrx(size, CV_8UC4, FPDFBitmap_GetBuffer(bitmap.get()),
                     static_cast<size_t>(FPDFBitmap_GetStride(bitmap.get())));
  cv::cvtColor(bgrx, out.bgr, cv::COLOR_BGRA2BGR);

  // The text, in pdfium's order. Invisible text (render mode 3, a scanner app's OCR layer) is left out, and so is a
  // character pdfium adds (a space or a line break) after an invisible one.
  ScopedFPDFTextPage text(FPDFText_LoadPage(page.get()));
  const int count = text ? FPDFText_CountChars(text.get()) : 0;
  bool shown = false;  // whether the last character from the page itself is drawn
  for (int i = 0; i < count; i++) {
    if (FPDFText_IsGenerated(text.get(), i) != 1) {
      FPDF_PAGEOBJECT object = FPDFText_GetTextObject(text.get(), i);
      shown = !object || FPDFTextObj_GetTextRenderMode(object) != FPDF_TEXTRENDERMODE_INVISIBLE;
    }
    double left = 0, right = 0, bottom = 0, top = 0;
    if (!shown || !FPDFText_GetCharBox(text.get(), i, &left, &right, &bottom, &top)) continue;
    // Two opposite corners make the box (on a turned page they swap places).
    out.chars.push_back({static_cast<char32_t>(FPDFText_GetUnicode(text.get(), i)),
                         cv::Rect2f(onRender(page.get(), size, left, top), onRender(page.get(), size, right, bottom))});
  }
  out.picture = std::none_of(out.chars.begin(), out.chars.end(), [](const PdfChar& c) { return inks(c.ch); });
  return out;
}

}  // namespace mbm
