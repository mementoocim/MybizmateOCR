#include "core/pdf_reader.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <new>
#include <system_error>
#include <type_traits>
#include <utility>

#include <opencv2/imgproc.hpp>

#include "core/scanner.h"  // MAX_SIDE
#include "cpp/fpdf_scopers.h"
#include "fpdf_annot.h"
#include "fpdf_edit.h"
#include "fpdf_flatten.h"
#include "fpdf_formfill.h"
#include "fpdf_ppo.h"
#include "fpdf_text.h"
#include "fpdf_transformpage.h"
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
                    : code == "page_too_big" ? "the PDF's page 1 is over 14,400 pt long"
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

// Page 1 as the form environment knows it: FORM_OnAfterLoadPage once it is loaded, FORM_OnBeforeClosePage before it is
// closed (both do nothing without an environment).
struct FormPageCloser {
  FPDF_FORMHANDLE form = nullptr;
  void operator()(FPDF_PAGE page) const {
    FORM_OnBeforeClosePage(page, form);
    FPDF_ClosePage(page);
  }
};
using FormPage = std::unique_ptr<std::remove_pointer<FPDF_PAGE>::type, FormPageCloser>;

FormPage loadPage1(FPDF_DOCUMENT doc, FPDF_FORMHANDLE form) {
  FPDF_PAGE page = FPDF_LoadPage(doc, 0);
  if (page) FORM_OnAfterLoadPage(page, form);
  return FormPage(page, FormPageCloser{form});
}

// Whether a page has an annotation that flattening would draw onto it: anything but a link or a popup, such as a form
// field's value, a stamp, or a note typed onto the page (FreeText: how phone PDF editors keep typed values).
bool drawsAnnotation(FPDF_PAGE page) {
  const int count = FPDFPage_GetAnnotCount(page);
  for (int i = 0; i < count; i++) {
    ScopedFPDFAnnotation annot(FPDFPage_GetAnnot(page, i));
    if (!annot) continue;
    const FPDF_ANNOTATION_SUBTYPE type = FPDFAnnot_GetSubtype(annot.get());
    if (type != FPDF_ANNOT_LINK && type != FPDF_ANNOT_POPUP) return true;
  }
  return false;
}

// Which of a page's text objects are seen. Not one drawn in a mode that paints nothing (3, invisible; 7, clip only), nor
// one drawn before a top-level image that covers most of the page (COVER of its area or more), which lies over it: a
// scanner app's OCR text, under the scan's own image. Text drawn after such an image, on top of a background, is seen.
class SeenText {
 public:
  explicit SeenText(FPDF_PAGE page) {
    FS_RECTF box;
    const double area =
        FPDF_GetPageBoundingBox(page, &box) ? std::abs(double(box.right) - box.left) * std::abs(double(box.top) - box.bottom)
                                            : 0;
    const int count = FPDFPage_CountObjects(page);
    for (int i = 0; i < count; i++) {
      FPDF_PAGEOBJECT object = FPDFPage_GetObject(page, i);
      if (!object) continue;
      place(object, i);
      float left = 0, bottom = 0, right = 0, top = 0;
      if (area > 0 && FPDFPageObj_GetType(object) == FPDF_PAGEOBJ_IMAGE &&
          FPDFPageObj_GetBounds(object, &left, &bottom, &right, &top)) {
        // the part of the page the image covers (its bounds, in the page's own space, like the page's box)
        const double w = std::min<double>(right, box.right) - std::max<double>(left, box.left);
        const double h = std::min<double>(top, box.top) - std::max<double>(bottom, box.bottom);
        if (w > 0 && h > 0 && w * h >= COVER * area) cover_ = i;
      }
    }
  }

  bool seen(FPDF_PAGEOBJECT text) const {
    const int mode = FPDFTextObj_GetTextRenderMode(text);
    if (mode == FPDF_TEXTRENDERMODE_INVISIBLE || mode == FPDF_TEXTRENDERMODE_CLIP) return false;
    const auto it = place_.find(text);
    return it == place_.end() || it->second > cover_;
  }

 private:
  static constexpr double COVER = 0.8;

  // An object's place: its top-level object's index on the page, a form's nested objects included (they are drawn
  // when their form is).
  void place(FPDF_PAGEOBJECT object, int top) {
    place_[object] = top;
    if (FPDFPageObj_GetType(object) != FPDF_PAGEOBJ_FORM) return;
    const int count = FPDFFormObj_CountObjects(object);
    for (int k = 0; k < count; k++) {
      if (FPDF_PAGEOBJECT inner = FPDFFormObj_GetObject(object, static_cast<unsigned long>(k))) place(inner, top);
    }
  }

  std::map<FPDF_PAGEOBJECT, int> place_;
  int cover_ = -1;  // the last top-level image covering most of the page, or none
};

// The characters of a page rendered at this size, in pdfium's order, without the text no one sees (SeenText), nor a
// character pdfium adds itself (a space or a line break) right after one of those.
std::vector<PdfChar> charsOf(FPDF_PAGE page, cv::Size size) {
  std::vector<PdfChar> out;
  ScopedFPDFTextPage text(FPDFText_LoadPage(page));
  const int count = text ? FPDFText_CountChars(text.get()) : 0;
  const SeenText seenText(page);
  bool shown = false;  // whether the last character from the page itself is seen
  for (int i = 0; i < count; i++) {
    if (FPDFText_IsGenerated(text.get(), i) != 1) {
      FPDF_PAGEOBJECT object = FPDFText_GetTextObject(text.get(), i);
      shown = !object || seenText.seen(object);
    }
    double left = 0, right = 0, bottom = 0, top = 0;
    if (!shown || !FPDFText_GetCharBox(text.get(), i, &left, &right, &bottom, &top)) continue;
    // Two opposite corners make a box (on a turned page they swap places).
    const cv::Rect2f glyph(onRender(page, size, left, top), onRender(page, size, right, bottom));
    // The loose box, mapped as the glyph's box is. When it has no area (pdfium gives a character it adds its empty
    // glyph box), the glyph's box stands in.
    cv::Rect2f loose = glyph;
    FS_RECTF l;
    if (FPDFText_GetLooseCharBox(text.get(), i, &l)) {
      const cv::Rect2f r(onRender(page, size, l.left, l.top), onRender(page, size, l.right, l.bottom));
      if (r.width > 0 && r.height > 0) loose = r;
    }
    out.push_back({static_cast<char32_t>(FPDFText_GetUnicode(text.get(), i)), glyph, loose});
  }
  return out;
}

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
  // A form environment with no callbacks. Loading the page under it has pdfium draw an appearance for a filled field
  // that has none of its own (a form marked /NeedAppearances), so flattening keeps that value too. Nothing ever sends it
  // a form action or an input event, and this build runs no JavaScript. formInfo must outlive the environment.
  FPDF_FORMFILLINFO formInfo{};
  formInfo.version = 1;
  ScopedFPDFFormHandle form(FPDFDOC_InitFormFillEnvironment(doc.get(), &formInfo));
  PdfPage out;
  out.pageCount = FPDF_GetPageCount(doc.get());
  if (out.pageCount < 1) throw refusal("broken");
  FormPage page = loadPage1(doc.get(), form.get());
  if (!page) throw refusal("broken");
  const float w = FPDF_GetPageWidthF(page.get()), h = FPDF_GetPageHeightF(page.get());  // as shown, /Rotate applied
  if (!(w > 0 && h > 0)) throw refusal("broken");
  if (std::max(w, h) > MAX_PDF_PAGE_PT) throw refusal("page_too_big");

  // An annotation's contents become page content when it is flattened: FPDF_RenderPageBitmap doesn't draw a form field's
  // value, and the text page lists no annotation's text. A page with nothing to flatten (no annotation, or only links
  // and popups, which draw nothing) is read as it is. Any other is flattened on a copy, never in place: flattening gives
  // a page that inherits its /Resources from /Pages a /Resources of its own, which hides the inherited one (its images
  // and fonts are gone). A copy made with FPDF_ImportPagesByIndex holds its own copy of everything the page inherits
  // (its /Resources, its boxes, its /Rotate), and the fields' appearances the form environment drew above. Flattening
  // then writes the copy's MediaBox and CropBox from the boxes the copy itself holds (a CropBox past the MediaBox would
  // grow it), so the box it shows is written onto it first; the flattened copy, read again, must still have that size.
  ScopedFPDFDocument copy;
  ScopedFPDFPage flat;  // page 1's flattened copy, in `copy`
  if (drawsAnnotation(page.get())) {
    copy.reset(FPDF_CreateNewDocument());
    const int first = 0;
    if (!copy || !FPDF_ImportPagesByIndex(copy.get(), doc.get(), &first, 1, 0)) throw refusal("broken");
    flat.reset(FPDF_LoadPage(copy.get(), 0));
    if (!flat) throw refusal("broken");
    FS_RECTF box;
    if (FPDF_GetPageBoundingBox(flat.get(), &box)) {
      FPDFPage_SetMediaBox(flat.get(), box.left, box.bottom, box.right, box.top);
      FPDFPage_SetCropBox(flat.get(), box.left, box.bottom, box.right, box.top);
    }
    if (FPDFPage_Flatten(flat.get(), FLAT_NORMALDISPLAY) == FLATTEN_SUCCESS) {
      flat.reset();  // closed before it is read again
      flat.reset(FPDF_LoadPage(copy.get(), 0));
      if (!flat) throw refusal("broken");
    }
    if (std::abs(FPDF_GetPageWidthF(flat.get()) - w) > 0.01f || std::abs(FPDF_GetPageHeightF(flat.get()) - h) > 0.01f) {
      throw refusal("broken");
    }
  }
  FPDF_PAGE read = flat ? flat.get() : page.get();  // the page rendered and read

  const double scale = static_cast<double>(MAX_SIDE) / std::max(w, h);
  const cv::Size size(std::max(1, static_cast<int>(std::lround(w * scale))),
                      std::max(1, static_cast<int>(std::lround(h * scale))));
  ScopedFPDFBitmap bitmap(FPDFBitmap_CreateEx(size.width, size.height, FPDFBitmap_BGRx, nullptr, 0));
  if (!bitmap) throw std::bad_alloc();
  FPDFBitmap_FillRect(bitmap.get(), 0, 0, size.width, size.height, 0xFFFFFFFF);  // white paper
  FPDF_RenderPageBitmap(bitmap.get(), read, 0, 0, size.width, size.height, 0, FPDF_ANNOT);
  const cv::Mat bgrx(size, CV_8UC4, FPDFBitmap_GetBuffer(bitmap.get()),
                     static_cast<size_t>(FPDFBitmap_GetStride(bitmap.get())));
  cv::cvtColor(bgrx, out.bgr, cv::COLOR_BGRA2BGR);

  out.chars = charsOf(read, size);
  out.picture = std::none_of(out.chars.begin(), out.chars.end(), [](const PdfChar& c) { return inks(c.ch); });
  return out;
}

}  // namespace mbm
