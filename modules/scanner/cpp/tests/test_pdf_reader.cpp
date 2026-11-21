// renderPdf: page 1 of a PDF rendered at the photo pipeline's size, with its visible text placed on that render.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <utility>
#include <vector>

#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/pdf_reader.h"

namespace {

std::string pdfPath(const std::string& stem) { return fixturesDir() + "/pdf/" + stem + ".pdf"; }

std::string valueOf(const std::string& stem, const std::string& field) {
  return readJson(fixturesDir() + "/expected2307/" + stem + ".json")["values"][field].get<std::string>();
}

// A field's box from the 2307 template (a page 2600 px long at 200 DPI), scaled to a render whose long side is `side`.
cv::Rect2f templateBox(const std::string& field, int side) {
  const auto t = readJson(assetsDir() + "/bir_2307.json");
  const float k = static_cast<float>(side) / t["page"][1].get<float>();
  for (const auto& f : t["fields"]) {
    if (f["name"] != field) continue;
    const auto& b = f["bbox"];
    return {b[0].get<float>() * k, b[1].get<float>() * k, (b[2].get<float>() - b[0].get<float>()) * k,
            (b[3].get<float>() - b[1].get<float>()) * k};
  }
  FAIL("no field " << field);
  return {};
}

void appendUtf8(std::string& out, char32_t c) {
  if (c < 0x80) {
    out += static_cast<char>(c);
  } else if (c < 0x800) {
    out += static_cast<char>(0xC0 | (c >> 6));
    out += static_cast<char>(0x80 | (c & 0x3F));
  } else if (c < 0x10000) {
    out += static_cast<char>(0xE0 | (c >> 12));
    out += static_cast<char>(0x80 | ((c >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (c & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (c >> 18));
    out += static_cast<char>(0x80 | ((c >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((c >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (c & 0x3F));
  }
}

bool isSpace(char32_t c) { return c == ' ' || c == '\r' || c == '\n'; }

// The characters whose centres lie in the box, in pdfium's order, as UTF-8: a run of spaces and line breaks becomes one
// space, and the ends are trimmed.
std::string textIn(const mbm::PdfPage& page, const cv::Rect2f& box) {
  std::string out;
  bool gap = false;
  for (const auto& c : page.chars) {
    if (!box.contains(cv::Point2f(c.box.x + c.box.width / 2, c.box.y + c.box.height / 2))) continue;
    if (isSpace(c.ch)) {
      gap = !out.empty();
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    appendUtf8(out, c.ch);
  }
  return out;
}

// The pixels a box covers, grown by `pad` on each side and kept inside the image.
cv::Rect pixelsOf(const cv::Rect2f& box, int pad, cv::Size size) {
  const cv::Point tl(static_cast<int>(std::floor(box.x)) - pad, static_cast<int>(std::floor(box.y)) - pad);
  const cv::Point br(static_cast<int>(std::ceil(box.x + box.width)) + pad,
                     static_cast<int>(std::ceil(box.y + box.height)) + pad);
  return cv::Rect(tl, br) & cv::Rect(cv::Point(), size);
}

// The PdfError code renderPdf gives, or "read".
std::string codeOf(const std::string& path) {
  try {
    mbm::renderPdf(path);
    return "read";
  } catch (const mbm::PdfError& e) {
    return e.code;
  }
}

void writeFile(const std::string& path, const std::string& bytes) {
  std::ofstream out(path, std::ios::binary);
  out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
  REQUIRE(out.good());
}

// bir2307_text_0.pdf made exactly `size` bytes long: filler after its end, then its startxref and %%EOF again. It still
// opens, so only its size can refuse it.
std::string padded(size_t size) {
  const std::string pdf = readText(pdfPath("bir2307_text_0"));
  const std::string tail = pdf.substr(pdf.rfind("startxref"));
  std::string out = pdf + "%";
  out.append(size - out.size() - 1 - tail.size(), ' ');
  return out + "\n" + tail;
}

// A one-page PDF made here.
struct MadePdf {
  int w = 612, h = 792;     // the page, in points
  int rotate = 0;           // its /Rotate
  bool boxOnPages = false;  // the MediaBox sits on /Pages, and the page only inherits it
  int cropW = 0, cropH = 0;  // when set, the page's own CropBox [0 0 cropW cropH]
  std::string text;         // drawn in 40 pt Helvetica from (100, textY) pt
  int textY = 600;
  int textMode = 0;         // the text's render mode (3: invisible; 7: clip only, also never painted)
  std::string field;        // a filled-in text field within (100, 300)-(400, 360) pt
  bool fieldLook = true;    // its widget draws the value (its own /AP, 30 pt from (110, 318) pt); otherwise the form
                            // leaves that to the reader (/NeedAppearances, the field's /DA in 20 pt)
  bool resourcesOnPages = false;  // the /Resources sit on /Pages, and the page only inherits them
  cv::Rect image;           // when set, an 8 x 8 image of one grey (imageGrey) stretched over this rect, in points
  int imageGrey = 64;
  bool imageOverText = false;  // the image is drawn after the text, over it (else first, under it)
  std::string coded;        // drawn in 40 pt from (100, 200) pt through a font whose /Differences makes the codes of A,
                            // B and C the glyphs 7, 8 and 9 (so "ABC" shows and reads "789")
  bool link = false;        // a Link annotation over (100, 100)-(300, 130) pt, with no appearance
};

std::string makePdf(const MadePdf& p) {
  // 1 the catalog, 2 /Pages, 3 the page, 4 Helvetica, 5 the content; the rest numbered as they are added
  std::vector<std::string> objects(5);
  const auto add = [&objects](const std::string& object) {
    objects.push_back(object);
    return std::to_string(objects.size()) + " 0 R";
  };
  const auto num = [](int n) { return std::to_string(n); };
  const std::string box = "/MediaBox [0 0 " + num(p.w) + " " + num(p.h) + "]";
  const std::string crop = p.cropW > 0 ? " /CropBox [0 0 " + num(p.cropW) + " " + num(p.cropH) + "]" : "";

  std::string fonts = "/F1 4 0 R", images;
  if (!p.coded.empty()) {
    fonts += " /F2 " + add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding "
                           "/BaseEncoding /WinAnsiEncoding /Differences [65 /seven /eight /nine] >> >>");
  }
  if (!p.image.empty()) {
    images = " /XObject << /Im1 " +
             add("<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 "
                 "/Length 64 >>\nstream\n" + std::string(64, static_cast<char>(p.imageGrey)) + "\nendstream") +
             " >>";
  }
  const std::string resources = "/Resources << /Font << " + fonts + " >>" + images + " >>";

  const std::string text = p.text.empty() ? ""
                           : "BT /F1 40 Tf " + (p.textMode != 0 ? num(p.textMode) + " Tr " : std::string()) + "100 " +
                                 num(p.textY) + " Td (" + p.text + ") Tj ET";
  const std::string image = p.image.empty() ? ""
                            : "q " + num(p.image.width) + " 0 0 " + num(p.image.height) + " " + num(p.image.x) + " " +
                                  num(p.image.y) + " cm /Im1 Do Q";
  std::string content = p.imageOverText ? text + "\n" + image : image + "\n" + text;
  if (!p.coded.empty()) content += "\nBT /F2 40 Tf 100 200 Td (" + p.coded + ") Tj ET";

  std::string annots, widget;
  if (!p.field.empty()) {
    const std::string look = "BT /F1 30 Tf 10 18 Td (" + p.field + ") Tj ET";
    const std::string ap = p.fieldLook ? add("<< /Type /XObject /Subtype /Form /BBox [0 0 300 60] /Resources << /Font "
                                             "<< /F1 4 0 R >> >> /Length " + num(static_cast<int>(look.size())) +
                                             " >>\nstream\n" + look + "\nendstream")
                                       : "";
    widget = add("<< /Type /Annot /Subtype /Widget /FT /Tx /T (value) /V (" + p.field +
                 ") /Rect [100 300 400 360] /F 4 /P 3 0 R " +
                 (p.fieldLook ? "/AP << /N " + ap + " >>" : "/DA (/Helv 20 Tf 0 g)") + " >>");
    annots += " " + widget;
  }
  if (p.link) annots += " " + add("<< /Type /Annot /Subtype /Link /Rect [100 100 300 130] /Border [0 0 0] >>");
  const std::string form =
      widget.empty() ? ""
      : p.fieldLook  ? " /AcroForm << /Fields [" + widget + "] >>"
                     : " /AcroForm << /Fields [" + widget +
                          "] /NeedAppearances true /DR << /Font << /Helv 4 0 R >> >> /DA (/Helv 0 Tf 0 g) >>";

  objects[0] = "<< /Type /Catalog /Pages 2 0 R" + form + " >>";
  objects[1] = "<< /Type /Pages /Kids [3 0 R] /Count 1" + (p.boxOnPages ? " " + box : std::string()) +
               (p.resourcesOnPages ? " " + resources : std::string()) + " >>";
  objects[2] = "<< /Type /Page /Parent 2 0 R" + (p.boxOnPages ? std::string() : " " + box) + crop + " /Rotate " +
               num(p.rotate) + (p.resourcesOnPages ? std::string() : " " + resources) + " /Contents 5 0 R" +
               (annots.empty() ? std::string() : " /Annots [" + annots.substr(1) + "]") + " >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Length " + num(static_cast<int>(content.size())) + " >>\nstream\n" + content + "\nendstream";
  std::string pdf = "%PDF-1.4\n";
  std::vector<size_t> at;
  for (size_t i = 0; i < objects.size(); i++) {
    at.push_back(pdf.size());
    pdf += std::to_string(i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const size_t xref = pdf.size();
  pdf += "xref\n0 " + std::to_string(objects.size() + 1) + "\n0000000000 65535 f \n";
  for (size_t offset : at) {
    char entry[32];
    std::snprintf(entry, sizeof entry, "%010zu 00000 n \n", offset);
    pdf += entry;
  }
  return pdf + "trailer\n<< /Size " + std::to_string(objects.size() + 1) + " /Root 1 0 R >>\nstartxref\n" +
         std::to_string(xref) + "\n%%EOF\n";
}

// The page's letters (its characters but spaces and line breaks) in pdfium's order, once each letter's box is checked
// to cover ink of the render and no ink is found outside the letters' boxes.
std::string lettersOnInk(const mbm::PdfPage& page) {
  cv::Mat gray;
  cv::cvtColor(page.bgr, gray, cv::COLOR_BGR2GRAY);
  const cv::Mat ink = gray < 160;
  cv::Mat boxes = cv::Mat::zeros(ink.size(), CV_8U);
  std::string letters;
  for (const auto& c : page.chars) {
    if (isSpace(c.ch)) continue;
    appendUtf8(letters, c.ch);
    CHECK(cv::countNonZero(ink(pixelsOf(c.box, 0, ink.size()))) > 0);
    boxes(pixelsOf(c.box, 3, ink.size())).setTo(255);
  }
  CHECK(cv::countNonZero(ink) > 1000);
  CHECK(cv::countNonZero(ink & ~boxes) == 0);
  return letters;
}

// The box of the page's first character `ch`.
cv::Rect2f boxOf(const mbm::PdfPage& page, char32_t ch) {
  for (const auto& c : page.chars) {
    if (c.ch == ch) return c.box;
  }
  FAIL("no character " << static_cast<int>(ch));
  return {};
}

}  // namespace

TEST_CASE("a text PDF's page and characters") {
  const auto page = mbm::renderPdf(pdfPath("bir2307_text_0"));
  CHECK(page.pageCount == 1);
  CHECK_FALSE(page.picture);
  // The 2307's page is 612 x 936 pt: its long side becomes MAX_SIDE.
  REQUIRE(page.bgr.type() == CV_8UC3);
  CHECK(page.bgr.rows == 2400);
  CHECK(page.bgr.cols == 1569);
  cv::Mat gray;
  cv::cvtColor(page.bgr, gray, cv::COLOR_BGR2GRAY);
  CHECK(cv::countNonZero(gray < 128) > 10000);  // the form is drawn, on white paper
  CHECK(gray.at<uint8_t>(0, 0) == 255);
  CHECK(textIn(page, templateBox("payee_name", page.bgr.rows)) == valueOf("bir2307_text_0", "payee_name"));
}

TEST_CASE("a picture PDF") {
  // A scan saved as a PDF: the page is one image, under an invisible (render mode 3) layer of wrong text, like a scanner
  // app's OCR layer. Nothing of that layer comes through, not even the spaces pdfium puts between its words.
  const auto page = mbm::renderPdf(pdfPath("bir2307_picture_1"));
  CHECK(page.pageCount == 1);
  CHECK(page.picture);
  CHECK(page.chars.empty());
  CHECK(page.bgr.rows == 2400);
  CHECK(page.bgr.cols == 1569);
  CHECK(mbm::renderPdf(pdfPath("bir2307_picture_0")).picture);  // no text layer at all
}

TEST_CASE("the refused PDFs") {
  CHECK(codeOf(pdfPath("broken")) == "broken");
  CHECK(codeOf(pdfPath("password")) == "password");
  CHECK(codeOf(pdfPath("no_such_file")) == "broken");
  // At most 20 MB: bir2307_text_0.pdf padded, which still reads, is refused for its size alone.
  const std::string file = tmpDir() + "/padded.pdf";
  const size_t MB = 1024 * 1024;
  const std::vector<std::pair<size_t, std::string>> sizes = {{21 * MB, "too_big"}, {20 * MB + 1, "too_big"}, {20 * MB, "read"}};
  for (const auto& sizeCode : sizes) {
    const size_t size = sizeCode.first;
    CAPTURE(size);
    writeFile(file, padded(size));
    CHECK(std::filesystem::file_size(file) == size);
    CHECK(codeOf(file) == sizeCode.second);
  }
  std::filesystem::remove(file);
}

TEST_CASE("two pages") {
  const auto page = mbm::renderPdf(pdfPath("two_pages"));
  CHECK(page.pageCount == 2);
  // Page 1, the certificate itself (page 2 is the form's ATC table).
  CHECK(page.bgr.rows == 2400);
  CHECK(page.bgr.cols == 1569);
  CHECK(textIn(page, templateBox("payee_name", page.bgr.rows)) == valueOf("two_pages", "payee_name"));
}

TEST_CASE("a PDF page over 14,400 pt, the PDF format's own limit, is too big") {
  // The page is always rendered 2400 px on its long side, so its size in points costs nothing: any page the format
  // allows (200 inches) reads. A photo saved as a PDF at 1 px = 1 pt (Pillow's default) is a page as big as the photo.
  const std::string dir = tmpDir();
  writeFile(dir + "/14400.pdf", makePdf({14400, 7200}));
  writeFile(dir + "/14401.pdf", makePdf({7200, 14401}));
  writeFile(dir + "/photo.pdf", makePdf({3000, 4000}));  // a 3000 x 4000 px photo, 1 px = 1 pt
  const auto page = mbm::renderPdf(dir + "/14400.pdf");
  CHECK(page.bgr.cols == 2400);
  CHECK(page.bgr.rows == 1200);
  CHECK(page.picture);  // no text at all
  CHECK(codeOf(dir + "/14401.pdf") == "page_too_big");
  const auto photo = mbm::renderPdf(dir + "/photo.pdf");
  CHECK(photo.bgr.cols == 1800);
  CHECK(photo.bgr.rows == 2400);
}

TEST_CASE("a page that inherits its /Resources keeps its image and its fonts, with a link or a field on it") {
  // The final review's I-5: the /Resources on /Pages, a dark image, text through a font whose /Differences makes the
  // codes of A, B and C the glyphs 7, 8 and 9, and one annotation. Flattened in place, the page got a /Resources of its
  // own that hid the one it inherits: the image was gone and the text read "ABC". A link draws nothing, so its page
  // isn't flattened; a field's page is, on a copy of the page holding its own copy of all it inherits.
  for (const bool field : {false, true}) {
    CAPTURE(field);
    MadePdf made;
    made.resourcesOnPages = true;
    made.image = {100, 450, 200, 200};
    made.coded = "ABC";
    made.link = !field;
    if (field) made.field = "FIELD";
    const std::string file = tmpDir() + "/inherits.pdf";
    writeFile(file, makePdf(made));
    const auto page = mbm::renderPdf(file);
    REQUIRE(page.bgr.rows == 2400);
    cv::Mat gray;
    cv::cvtColor(page.bgr, gray, cv::COLOR_BGR2GRAY);
    // the image's rect on the render (612 x 792 pt), 3 px in from its edges: all of it ink
    const float s = 2400.0f / 792;
    const cv::Rect inside = pixelsOf({100 * s, (792 - 650) * s, 200 * s, 200 * s}, -3, gray.size());
    CHECK(cv::countNonZero(gray(inside) < 160) == inside.area());
    std::string letters;
    for (const auto& c : page.chars) {
      if (!isSpace(c.ch)) appendUtf8(letters, c.ch);
    }
    CAPTURE(letters);
    if (field) CHECK((letters == "789FIELD" || letters == "FIELD789"));  // which run comes first is pdfium's choice
    else CHECK(letters == "789");
  }
}

TEST_CASE("text no one sees is left out: clip-only text, and text drawn under a page-size image") {
  // A scan saved as a PDF can carry its scanner app's OCR as text that is never painted (render mode 3, or 7: clip
  // only) or as text drawn first, under the scan's page-size image. Either way it is that app's reading, not what the
  // page shows: the page is a picture. Text drawn on top of a page-size background image is seen, and kept.
  const auto pageWith = [](const std::string& text, int mode, bool imageOver, cv::Rect image) {
    MadePdf made;
    made.text = text;
    made.textMode = mode;
    made.image = image;
    made.imageGrey = 200;  // light: not ink (lettersOnInk counts under 160)
    made.imageOverText = imageOver;
    const std::string file = tmpDir() + "/seen.pdf";
    writeFile(file, makePdf(made));
    return mbm::renderPdf(file);
  };
  const cv::Rect whole(0, 0, 612, 792);
  for (const int mode : {3, 7}) {
    CAPTURE(mode);
    const auto hidden = pageWith("HIDDEN", mode, false, whole);  // over the image, but never painted
    CHECK(hidden.picture);
    CHECK(hidden.chars.empty());
  }
  const auto under = pageWith("HIDDEN", 0, true, whole);
  CHECK(under.picture);
  CHECK(under.chars.empty());
  // most of the page (80% or more of its area) is a page-size image; a smaller one hides nothing
  CHECK(pageWith("HIDDEN", 0, true, {0, 0, 612, 674}).picture);  // 85% of the page
  const auto small = pageWith("SHOWN", 0, true, {0, 0, 612, 594});  // 75%, below the text (its baseline at 600 pt)
  CHECK_FALSE(small.picture);
  CHECK(lettersOnInk(small) == "SHOWN");
  const auto over = pageWith("SHOWN", 0, false, whole);  // a background image, the text drawn on it
  CHECK_FALSE(over.picture);
  CHECK(lettersOnInk(over) == "SHOWN");
}

TEST_CASE("a PDF's characters sit on their own ink, a form field's and a turned page's too") {
  // Each letter's box covers ink of the render, and no ink lies outside the letters' boxes. The field's value is
  // flattened into the page, so it is drawn and read as text like the rest. Each run of text keeps its letters' order;
  // which run comes first is pdfium's choice (on the page turned 90 degrees, the field's).
  for (int rotate : {0, 90, 180, 270}) {
    CAPTURE(rotate);
    MadePdf made;
    made.rotate = rotate;
    made.text = "HELLO";
    made.field = "FIELD";
    const std::string file = tmpDir() + "/hello.pdf";
    writeFile(file, makePdf(made));
    const auto page = mbm::renderPdf(file);
    const bool turned = rotate % 180 != 0;
    CHECK(page.bgr.cols == (turned ? 2400 : 1855));
    CHECK(page.bgr.rows == (turned ? 1855 : 2400));
    CHECK_FALSE(page.picture);
    const std::string letters = lettersOnInk(page);
    CAPTURE(letters);
    CHECK((letters == "HELLOFIELD" || letters == "FIELDHELLO"));
  }
}

TEST_CASE("each character's loose box spans its line, the font's ascent to its descent, on a turned page too") {
  // FPDFText_GetLooseCharBox: across the line, the font's ascent to its descent; along it, the character's advance. So
  // the letters of a line share one band whatever their glyphs, and the band holds the baseline with more of it above
  // than below. A comma's glyph hangs low, near the baseline; its loose box's centre is the line's middle. The loose box
  // is turned with the page, as box is.
  for (int rotate : {0, 90, 180, 270}) {
    CAPTURE(rotate);
    MadePdf made;
    made.rotate = rotate;
    made.text = "Ag, yo";
    const std::string file = tmpDir() + "/loose.pdf";
    writeFile(file, makePdf(made));
    const auto page = mbm::renderPdf(file);
    // A box across the line, as an interval that grows toward the font's ascent (up the page, which /Rotate turns), and
    // along the line.
    const auto up = [rotate](const cv::Rect2f& r) {
      switch (rotate) {
        case 90: return std::make_pair(r.x, r.x + r.width);
        case 180: return std::make_pair(r.y, r.y + r.height);
        case 270: return std::make_pair(-(r.x + r.width), -r.x);
        default: return std::make_pair(-(r.y + r.height), -r.y);
      }
    };
    const auto along = [rotate](const cv::Rect2f& r) {
      return rotate % 180 == 0 ? std::make_pair(r.x, r.x + r.width) : std::make_pair(r.y, r.y + r.height);
    };
    const cv::Rect2f a = boxOf(page, U'A');
    const float baseline = up(a).first;  // "A" stands on the baseline
    const auto band = up(page.chars[0].loose);
    CHECK(band.first < baseline);
    CHECK(band.second > baseline);
    CHECK(band.second - baseline > baseline - band.first);  // more ascent than descent
    CHECK(band.second - band.first > up(a).second - up(a).first);  // taller than a capital's glyph
    std::vector<std::pair<float, float>> advances;
    for (const auto& c : page.chars) {
      if (c.loose.area() == 0) continue;  // a character pdfium adds: no box of either kind
      CAPTURE(static_cast<int>(c.ch));
      CHECK(std::abs(up(c.loose).first - band.first) < 0.5);  // one band for the line
      CHECK(std::abs(up(c.loose).second - band.second) < 0.5);
      if (c.ch != U' ') CHECK((c.loose & c.box).area() > 0);  // over its own glyph
      advances.push_back(along(c.loose));
    }
    CHECK(advances.size() == 6);
    std::sort(advances.begin(), advances.end());  // along the line, each advance starts where the one before ends
    for (size_t i = 1; i < advances.size(); i++) CHECK(std::abs(advances[i].first - advances[i - 1].second) < 0.5);
    const auto comma = up(boxOf(page, U','));
    CHECK((comma.first + comma.second) / 2 < (band.first + band.second) / 2 - 15);  // the glyph well under the middle
  }
}

TEST_CASE("a PDF page keeps the box it shows when its fields are flattened") {
  // Flattening writes a MediaBox and a CropBox onto the page itself, from the boxes the page holds. A page whose box
  // comes from /Pages (here the 2307's 612 x 936 pt) must not fall back to Letter, and a CropBox of its own reaching past
  // its MediaBox must not grow it: the render isn't stretched, and the text near its top stays on it.
  MadePdf inherited;
  inherited.boxOnPages = true;
  MadePdf cropped;
  cropped.cropW = 700;
  cropped.cropH = 1000;
  for (MadePdf made : {inherited, cropped}) {
    CAPTURE(made.boxOnPages);
    made.h = 936;
    made.text = "TOP";
    made.textY = 880;
    made.field = "FIELD";
    const std::string file = tmpDir() + "/boxes.pdf";
    writeFile(file, makePdf(made));
    const auto page = mbm::renderPdf(file);
    CHECK(page.bgr.cols == 1569);
    CHECK(page.bgr.rows == 2400);
    const std::string letters = lettersOnInk(page);
    CAPTURE(letters);
    CHECK((letters == "TOPFIELD" || letters == "FIELDTOP"));
    // The baselines, TOP's at 880 pt and the field value's at 318 pt, lie (936 - y) * 2400 / 936 px down the render.
    const float scale = 2400.0f / 936;
    CHECK(std::abs(boxOf(page, 'T').br().y - (936 - 880) * scale) < 3);
    CHECK(std::abs(boxOf(page, 'F').br().y - (936 - 318) * scale) < 3);
  }
}

TEST_CASE("a PDF's filled field without an appearance of its own is drawn and read") {
  // A form that leaves drawing its fields to the reader (/NeedAppearances, and no /AP on the widget), as some programs
  // that fill forms do: pdfium draws the value from the field's /DA, and it is read like the page's own text.
  MadePdf made;
  made.text = "TOP";
  made.field = "FIELD";
  made.fieldLook = false;
  const std::string file = tmpDir() + "/no_look.pdf";
  writeFile(file, makePdf(made));
  const auto page = mbm::renderPdf(file);
  CHECK_FALSE(page.picture);
  const std::string letters = lettersOnInk(page);
  CAPTURE(letters);
  CHECK((letters == "TOPFIELD" || letters == "FIELDTOP"));
}
