// scanPdf: page 1 of a PDF rendered (renderPdf), then found and straightened like a photo; each box with writing then
// takes the PDF's own text inside it (textInBoxes), exact, instead of the model's reading. A picture page (a scan) is
// read like a photo: the hidden text a scanner app lays over it is its own OCR. There is no Python reference: what each
// PDF should read is what synth_2307.py wrote into it (fixtures/core/expected2307), and the Sales Invoice's picture PDF
// holds photos/inv_0007.jpg itself.
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <string>
#include <vector>

#include <opencv2/geometry/2d.hpp>  // OpenCV 5: getPerspectiveTransform
#include <opencv2/imgcodecs.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/pdf_reader.h"
#include "core/result_json.h"
#include "core/scanner.h"
#include "core/service_template.h"

namespace {

const std::vector<std::string> kText2307 = {"bir2307_text_0", "bir2307_text_1", "bir2307_text_2"};

mbm::Scanner& scanner() {
  static mbm::Scanner s(mbm::Assets{readBytes(assetsDir() + "/inference_latin.onnx"), readText(assetsDir() + "/dict.txt"),
                                    readText(assetsDir() + "/field_map.json"), readBytes(assetsDir() + "/form_small.png"),
                                    readText(assetsDir() + "/service_invoice.json"),
                                    readText(assetsDir() + "/bir_2307.json"), 4});
  return s;
}

std::string pdfPath(const std::string& stem) { return fixturesDir() + "/pdf/" + stem + ".pdf"; }

nlohmann::json expected(const std::string& stem) { return readJson(fixturesDir() + "/expected2307/" + stem + ".json"); }

// A fixture PDF scanned, once per run.
const mbm::ScanResult& scanned(const std::string& stem) {
  static std::map<std::string, mbm::ScanResult> done;
  const auto it = done.find(stem);
  if (it != done.end()) return it->second;
  return done.emplace(stem, scanner().scanPdf(pdfPath(stem), tmpDir())).first->second;
}

// Every value written is read from the PDF's own text, exactly: conf 1, no backup readings, and its crop still cut
// from the rendered page. No other box is read, so nothing the form itself prints gets into an empty box.
void checkReadFromText(const mbm::ScanResult& r, const nlohmann::json& values) {
  std::map<std::string, const mbm::BoxRead*> reads;
  for (const auto& b : r.reads) reads[b.name] = &b;
  CHECK(r.reads.size() == values.size());
  for (const auto& item : values.items()) {
    const std::string name = item.key();
    CAPTURE(name);
    const auto it = reads.find(name);
    REQUIRE(it != reads.end());
    const mbm::BoxRead& b = *it->second;
    CHECK(b.text == item.value().get<std::string>());
    CHECK(b.fromText);
    CHECK(b.conf == 1.0f);
    CHECK(b.alts.empty());
    const cv::Mat crop = cv::imread(b.cropFile);
    REQUIRE_FALSE(crop.empty());
    CHECK(crop.size() == b.cropSize);
  }
}

// A box on the page, as it lies on a render that H (render -> page) maps onto the page.
cv::Rect2f onRender(const cv::Rect2f& onPage, const cv::Matx33d& H) {
  const std::vector<cv::Point2f> corners = {onPage.tl(), {onPage.x + onPage.width, onPage.y}, onPage.br(),
                                            {onPage.x, onPage.y + onPage.height}};
  std::vector<cv::Point2f> q;
  cv::perspectiveTransform(corners, q, cv::Mat(H.inv()));
  float x0 = q[0].x, y0 = q[0].y, x1 = q[0].x, y1 = q[0].y;
  for (const auto& p : q) {
    x0 = std::min(x0, p.x);
    y0 = std::min(y0, p.y);
    x1 = std::max(x1, p.x);
    y1 = std::max(y1, p.y);
  }
  return {x0, y0, x1 - x0, y1 - y0};
}

// A run of text on the page as renderPdf gives it on the render: characters in 20 x 30 px cells from (x, y), each its
// glyph's box and its loose box alike, then the line break pdfium adds after a run (an empty box just after its last
// character).
std::vector<mbm::PdfChar> run(const std::u32string& text, float x, float y, const cv::Matx33d& H) {
  std::vector<mbm::PdfChar> out;
  for (char32_t c : text) {
    const cv::Rect2f cell = onRender({x, y, 20, 30}, H);
    out.push_back({c, cell, cell});
    x += 20;
  }
  for (char32_t c : {U'\r', U'\n'}) {
    const cv::Rect2f none = onRender({x, y + 30, 0, 0}, H);
    out.push_back({c, none, none});
  }
  return out;
}

// A line of text on the page in 20 px type, a 20 px advance per character, on its baseline: each character's glyph box
// as its shape makes it (capitals, small letters, descenders, a comma hanging under the baseline), and its loose box,
// the font's ascent (15.6 px) to its descent (4.4 px) for every character alike. Then pdfium's line break.
std::vector<mbm::PdfChar> line(const std::u32string& text, float x, float baseline, const cv::Matx33d& H) {
  const std::u32string descenders = U"gjpqy", tall = U"ABCDEFGHIJKLMNOPQRSTUVWXYZbdfhklt0123456789";
  std::vector<mbm::PdfChar> out;
  for (char32_t c : text) {
    float top = baseline - 10.4f, bottom = baseline;  // a small letter
    if (tall.find(c) != std::u32string::npos) top = baseline - 14.4f;
    if (descenders.find(c) != std::u32string::npos) bottom = baseline + 4.2f;
    if (c == U'(' || c == U')') {
      top = baseline - 15;
      bottom = baseline + 4;
    }
    if (c == U',') {
      top = baseline - 2;
      bottom = baseline + 8;
    }
    const bool space = c == U' ';
    const cv::Rect2f glyph = space ? cv::Rect2f(x, baseline, 0, 0) : cv::Rect2f(x + 2, top, 16, bottom - top);
    out.push_back({c, onRender(glyph, H), onRender({x, baseline - 15.6f, 20, 20}, H)});
    x += 20;
  }
  for (char32_t c : {U'\r', U'\n'}) {
    const cv::Rect2f none = onRender({x, baseline, 0, 0}, H);
    out.push_back({c, none, none});
  }
  return out;
}

// The render seen at a slant: H maps it onto a page of this size, as a found form's homography does.
cv::Matx33d slanted(float pageW, float pageH) {
  const std::vector<cv::Point2f> render = {{60, 40}, {pageW * 0.9f, 90}, {pageW * 0.88f, pageH * 0.92f}, {20, pageH * 0.89f}};
  const std::vector<cv::Point2f> page = {{0, 0}, {pageW, 0}, {pageW, pageH}, {0, pageH}};
  return cv::getPerspectiveTransform(render, page);
}

void writeFile(const std::string& path, const std::string& bytes) {
  std::ofstream out(path, std::ios::binary);
  out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
  REQUIRE(out.good());
}

// A PDF with one span of its text replaced by another of the same length, so every offset in it stays right.
std::string patched(std::string pdf, const std::string& from, const std::string& to) {
  REQUIRE(from.size() == to.size());
  const size_t at = pdf.find(from);
  REQUIRE(at != std::string::npos);
  REQUIRE(pdf.find(from, at + 1) == std::string::npos);
  return pdf.replace(at, from.size(), to);
}

}  // namespace

TEST_CASE("a text 2307 reads exactly from its text") {
  for (const auto& stem : kText2307) {
    CAPTURE(stem);
    const auto& r = scanned(stem);
    CHECK(r.source == "pdf");
    CHECK(r.pageCount == 1);
    CHECK(r.picture == false);
    REQUIRE(r.aligned);
    CHECK(r.form == "bir_2307");
    const nlohmann::json values = expected(stem)["values"];
    CHECK(values.size() >= 28);
    checkReadFromText(r, values);
  }
  // Each box's crop is cut from the rendered page just as for a photo: the same pixels as its page scanned as an image.
  const auto& r = scanned("bir2307_text_0");
  const auto photo = scanner().scanImage(mbm::renderPdf(pdfPath("bir2307_text_0")).bgr, tmpDir());
  REQUIRE(photo.reads.size() == r.reads.size());
  for (size_t i = 0; i < r.reads.size(); i++) {
    CAPTURE(r.reads[i].name);
    CHECK(photo.reads[i].name == r.reads[i].name);
    CHECK_FALSE(photo.reads[i].fromText);
    const cv::Mat a = cv::imread(r.reads[i].cropFile), b = cv::imread(photo.reads[i].cropFile);
    REQUIRE(a.size() == b.size());
    CHECK(cv::norm(a, b, cv::NORM_INF) == 0);
  }
}

TEST_CASE("text goes to the box that holds its centre") {
  const cv::Matx33d H = slanted(1700, 2600);  // a 2307's page
  const std::vector<mbm::TextBox> boxes = {
      {cv::Rect(611, 1014, 200, 38), "amount"},  // a 2307 row's 1st month
      {cv::Rect(811, 1014, 206, 38), "amount"},  // its 2nd month, which shares that edge
      {cv::Rect(94, 456, 1551, 44), "text"},     // the payee's name, under its printed caption
  };
  std::vector<mbm::PdfChar> chars;
  const auto add = [&chars](const std::vector<mbm::PdfChar>& more) { chars.insert(chars.end(), more.begin(), more.end()); };
  // The 1st month's value runs past its right edge: its last character lies 40% over it, inside the 2nd month's box
  // (x 799-819), with its centre still in the 1st month. pdfium's line break after it lands in the 2nd month.
  add(run(U"1,500.00", 659, 1018, H));
  add(run(U"250.00", 887, 1018, H));  // the 2nd month's own value, right-aligned in it
  // The caption printed above the name reaches 40% into the name's box (y 438-468), each character's centre above it.
  add(run(U"Payee's Name (Last Name, First Name)", 100, 438, H));
  add(run(U"Dela Cruz, Juan", 110, 468, H));
  const std::vector<std::string> texts = mbm::textInBoxes(chars, H, boxes);
  REQUIRE(texts.size() == 3);
  CHECK(texts[0] == "1,500.00");
  CHECK(texts[1] == "250.00");
  CHECK(texts[2] == "Dela Cruz, Juan");
}

TEST_CASE("a caption's comma stays out of the box below it, though its glyph hangs into the box") {
  // A character goes by its loose box's centre: its line's middle, whatever its glyph's shape. A caption set close
  // above a box (a 2307's "Last Name, First Name, ...") has commas whose glyphs hang under its baseline, into the box.
  const cv::Matx33d H = slanted(1700, 2600);
  const std::vector<mbm::TextBox> boxes = {{cv::Rect(94, 456, 1551, 44), "text"}};  // the payee's name
  std::vector<mbm::PdfChar> chars;
  const auto add = [&chars](const std::vector<mbm::PdfChar>& more) { chars.insert(chars.end(), more.begin(), more.end()); };
  add(line(U"Name (Last, First)", 100, 455, H));  // its baseline 1 px over the box: its comma's glyph is y 453-463
  add(line(U"Dela Cruz, Juan", 110, 486, H));      // the name on its line in the box, its comma's glyph too
  const std::vector<std::string> texts = mbm::textInBoxes(chars, H, boxes);
  REQUIRE(texts.size() == 1);
  CHECK(texts[0] == "Dela Cruz, Juan");
  // Placed by its glyph's own box instead, the caption's comma would go in: the case the loose box is for.
  std::vector<mbm::PdfChar> byGlyph = chars;
  for (auto& c : byGlyph) c.loose = c.box;
  CHECK(mbm::textInBoxes(byGlyph, H, boxes).at(0) == ",Dela Cruz, Juan");
}

TEST_CASE("the amount in words over two lines: one reading, the PDF's own text only when both lines are") {
  // The Service Invoice writes its amount in words over two boxes, a line each: amount_words, then amount_words2. From a
  // PDF's text each line is its box's text, and joinLines makes the two the one reading the scan gives.
  const auto t = mbm::ServiceTemplate::parse(readText(assetsDir() + "/service_invoice.json"));
  std::vector<mbm::TextBox> boxes;
  for (const char* name : {"amount_words", "amount_words2"}) {
    for (const auto& f : t.fields) {
      if (f.name == name) boxes.push_back({f.box, f.type});
    }
  }
  REQUIRE(boxes.size() == 2);
  const cv::Matx33d H = slanted(1160, 1860);  // the Service Invoice's page
  std::vector<mbm::PdfChar> chars;
  const auto add = [&chars](const std::vector<mbm::PdfChar>& more) { chars.insert(chars.end(), more.begin(), more.end()); };
  add(run(U"Twenty-four thousand three hundred", 420, 735, H));  // in amount_words (x 412-1140, y 722-778)
  add(run(U"seventy-seven pesos only", 80, 795, H));             // in amount_words2 (x 72-700, y 782-838)
  const std::vector<std::string> texts = mbm::textInBoxes(chars, H, boxes);
  REQUIRE(texts.size() == 2);
  CHECK(texts[0] == "Twenty-four thousand three hundred");
  CHECK(texts[1] == "seventy-seven pesos only");
  const std::string words = "Twenty-four thousand three hundred seventy-seven pesos only";

  // Each line as the scan takes a box's PDF text: exact, conf 1, no backup readings. Both lines so: the PDF's own.
  const mbm::BoxReading first{texts[0], 1.0f, {}, true}, second{texts[1], 1.0f, {}, true};
  const auto both = mbm::joinLines({&first, &second});
  REQUIRE(both.has_value());
  CHECK(both->text == words);
  CHECK(both->fromText);
  CHECK(both->conf == 1.0f);
  CHECK(both->alts.empty());

  // One line from the text and the other read by the model, either way round: not the PDF's own, the lower conf.
  const mbm::BoxReading model1{texts[0], 0.91f, {"Twenty-four thousand three hundrcd"}, false};
  const mbm::BoxReading model2{texts[1], 0.93f, {"seventy-seven pesos 0nly"}, false};
  const auto textThenModel = mbm::joinLines({&first, &model2});
  REQUIRE(textThenModel.has_value());
  CHECK(textThenModel->text == words);
  CHECK_FALSE(textThenModel->fromText);
  CHECK(textThenModel->conf == 0.93f);
  CHECK(textThenModel->alts.empty());
  const auto modelThenText = mbm::joinLines({&model1, &second});
  REQUIRE(modelThenText.has_value());
  CHECK(modelThenText->text == words);
  CHECK_FALSE(modelThenText->fromText);
  CHECK(modelThenText->conf == 0.91f);

  // One line only (the other box blank): its own reading, the PDF's own text. Neither line: no reading.
  const auto one = mbm::joinLines({&first, nullptr});
  REQUIRE(one.has_value());
  CHECK(one->text == texts[0]);
  CHECK(one->fromText);
  CHECK_FALSE(mbm::joinLines({nullptr, nullptr}).has_value());
}

TEST_CASE("each box keeps only what its type allows from the PDF's text") {
  // One box per type, each holding its text as pdfium gives it: a comb box's digits one per cell with spaces between
  // them, a 2307 TIN box's own printed dashes before its digits, line breaks between runs.
  struct Case {
    std::string type;
    std::u32string text;
    std::string want;
  };
  const std::vector<Case> cases = {
      {"digits", U"1 0 0 1 2 0 2 6", "10012026"},
      {"tin", U"- - -\r\n2 1 1 3 0 5 4 1 8 0 0 0 0 0", "21130541800000"},
      {"code", U"WC 158", "WC158"},
      {"amount", U"P1,500.00", "1,500.00"},
      {"printed_digits", U"No. 0000888", "0000888"},
      {"number", U"1  1/2 pcs", "1 1/2"},
      {"date", U"27 Sep\r\n2026", "27 Sep 2026"},
      {"text", U"  Pe\xF1" U"aflor,  Ma.\r\nTeresa  ", "Pe\xC3\xB1" "aflor, Ma. Teresa"},
  };
  const cv::Matx33d same = cv::Matx33d::eye();
  std::vector<mbm::TextBox> boxes;
  std::vector<mbm::PdfChar> chars;
  for (const auto& c : cases) {
    const int y = 100 + 60 * static_cast<int>(boxes.size());
    boxes.push_back({cv::Rect(100, y, 800, 40), c.type});
    const auto more = run(c.text, 110, static_cast<float>(y + 5), same);
    chars.insert(chars.end(), more.begin(), more.end());
  }
  const std::vector<std::string> texts = mbm::textInBoxes(chars, same, boxes);
  REQUIRE(texts.size() == cases.size());
  for (size_t i = 0; i < cases.size(); i++) {
    CAPTURE(cases[i].type);
    CHECK(texts[i] == cases[i].want);
  }
}

TEST_CASE("a scan's hidden text is ignored") {
  // bir2307_picture_1.pdf: a scan saved as a PDF, under an invisible layer (render mode 3) of wrong text, like a scanner
  // app's OCR. It is read like a photo of its page: the same reads and the same photo checks, none from text, and the
  // layer's text nowhere.
  const auto& r = scanned("bir2307_picture_1");
  CHECK(r.source == "pdf");
  CHECK(r.pageCount == 1);
  CHECK(r.picture == true);
  const auto photo = scanner().scanImage(mbm::renderPdf(pdfPath("bir2307_picture_1")).bgr, tmpDir());
  REQUIRE(r.aligned);
  CHECK(r.form == "bir_2307");
  CHECK(photo.form == "bir_2307");
  CHECK(r.sharpness == photo.sharpness);
  CHECK(r.sharpMin == photo.sharpMin);
  CHECK(r.light == photo.light);
  CHECK(r.darkMax == photo.darkMax);
  CHECK(r.blanks == photo.blanks);
  REQUIRE(r.reads.size() == photo.reads.size());
  CHECK(r.reads.size() >= 36);
  const nlohmann::json hidden = expected("bir2307_picture_1")["hidden"];
  REQUIRE(hidden.size() >= 36);
  for (size_t i = 0; i < r.reads.size(); i++) {
    const auto& b = r.reads[i];
    CAPTURE(b.name);
    CHECK(b.name == photo.reads[i].name);
    CHECK(b.text == photo.reads[i].text);
    CHECK(b.conf == photo.reads[i].conf);
    CHECK(b.alts == photo.reads[i].alts);
    CHECK_FALSE(b.fromText);
    std::string layer;  // any of the hidden layer's values found in this read
    for (const auto& h : hidden.items()) {
      if (b.text.find(h.value().get<std::string>()) != std::string::npos) layer = h.value().get<std::string>();
    }
    CHECK(layer.empty());
  }
}

TEST_CASE("an invoice PDF reads like its photo") {
  {
    // sales_picture_0.pdf holds photos/inv_0007.jpg on its page. Rendering resamples it, so (Ruling P3) the same form
    // is found, and at least 90% of the boxes (read in either) read the same text as the photo itself.
    const auto& pdf = scanned("sales_picture_0");
    const std::string photoFile = expected("sales_picture_0")["photo"].get<std::string>();
    const auto photo = scanner().scanPhoto(fixturesDir() + "/photos/" + photoFile, tmpDir());
    CHECK(pdf.source == "pdf");
    CHECK(pdf.picture == true);
    REQUIRE(pdf.aligned);
    CHECK(pdf.form == "sales_invoice");
    CHECK(photo.form == "sales_invoice");
    std::map<std::string, std::string> fromPdf, fromPhoto;
    std::set<std::string> names;
    for (const auto& b : pdf.reads) {
      CHECK_FALSE(b.fromText);
      fromPdf[b.name] = b.text;
      names.insert(b.name);
    }
    for (const auto& b : photo.reads) {
      fromPhoto[b.name] = b.text;
      names.insert(b.name);
    }
    size_t same = 0;
    for (const auto& name : names) {
      if (fromPdf.count(name) && fromPhoto.count(name) && fromPdf[name] == fromPhoto[name]) same++;
    }
    CAPTURE(same);
    CAPTURE(names.size());
    CHECK(names.size() >= 40);
    CHECK(same * 10 >= names.size() * 9);
  }

  // sales_text_0.pdf: the blank Sales Invoice as a picture, with 8 values typed on it as text. Each comes from its text.
  const auto& typed = scanned("sales_text_0");
  CHECK(typed.picture == false);
  REQUIRE(typed.aligned);
  CHECK(typed.form == "sales_invoice");
  CHECK_FALSE(typed.turned);
  const nlohmann::json values = expected("sales_text_0")["values"];
  CHECK(values.size() == 8);
  checkReadFromText(typed, values);
}

TEST_CASE("page 1 of 2") {
  // two_pages.pdf: the certificate, then the form's page 2 (its ATC table). Page 1 is read, and the count says 2.
  const auto& r = scanned("two_pages");
  CHECK(r.pageCount == 2);
  CHECK(r.picture == false);
  REQUIRE(r.aligned);
  CHECK(r.form == "bir_2307");
  const nlohmann::json values = expected("two_pages")["values"];
  checkReadFromText(r, values);
  CHECK(nlohmann::json::parse(mbm::toJson(r))["pageCount"] == 2);
}

TEST_CASE("a turned PDF page still gives each box its own text") {
  // A page shown turned (its /Rotate): the Sales Invoice upside down, which the scan turns back, and the 2307 on its
  // side, which its finder takes in any turn. Each box still takes the text that lies in it.
  const std::string dir = tmpDir();
  // sales_text_0.pdf's page given /Rotate 180 (two optional spaces dropped from its dictionary make room)
  writeFile(dir + "/sales_180.pdf",
            patched(readText(pdfPath("sales_text_0")),
                    "/FXE1 5 0 R >>/Font<</FXF1 7 0 R >>/XObject<</FXX1 6 0 R >>>>/Rotate 0/",
                    "/FXE1 5 0 R>>/Font<</FXF1 7 0 R>>/XObject<</FXX1 6 0 R >>>>/Rotate 180/"));
  const auto sales = scanner().scanPdf(dir + "/sales_180.pdf", tmpDir());
  REQUIRE(sales.aligned);
  CHECK(sales.form == "sales_invoice");
  CHECK(sales.turned);
  const nlohmann::json salesValues = expected("sales_text_0")["values"];
  checkReadFromText(sales, salesValues);

  // bir2307_text_0.pdf's page given /Rotate 90 (in place of its /StructParents, which only tagged PDF readers use)
  writeFile(dir + "/bir_90.pdf",
            patched(readText(pdfPath("bir2307_text_0")), "/StructParents 0", "/Rotate 90      "));
  const auto bir = scanner().scanPdf(dir + "/bir_90.pdf", tmpDir());
  CHECK(bir.photoSize == cv::Size(2400, 1569));  // on its side
  REQUIRE(bir.aligned);
  CHECK(bir.form == "bir_2307");
  const nlohmann::json birValues = expected("bir2307_text_0")["values"];
  checkReadFromText(bir, birValues);
}

TEST_CASE("a PDF scan's JSON: its source, page count and picture, and which reads are its own text") {
  // at(): a key that is missing throws (and fails the check) instead of being read past
  const auto text = nlohmann::json::parse(mbm::toJson(scanned("bir2307_text_0")));
  CHECK(text.at("source") == "pdf");
  CHECK(text.at("pageCount") == 1);
  CHECK(text.at("picture") == false);
  REQUIRE(text.at("reads").size() >= 28);
  for (const auto& b : text.at("reads")) {
    CHECK(b.at("fromText") == true);
    CHECK(b.at("conf") == 1.0);
    CHECK(b.at("alts").empty());
  }
  const auto picture = nlohmann::json::parse(mbm::toJson(scanned("bir2307_picture_1")));
  CHECK(picture.at("source") == "pdf");
  CHECK(picture.at("picture") == true);
  REQUIRE(picture.at("reads").size() >= 36);
  for (const auto& b : picture.at("reads")) CHECK(b.at("fromText") == false);
}

TEST_CASE("a PDF that can't be read is refused with its code, and nothing is written") {
  const std::vector<std::pair<std::string, std::string>> refused = {{"broken", "broken"},
                                                                     {"password", "password"},
                                                                     {"no_such_file", "broken"}};
  for (const auto& stemCode : refused) {
    CAPTURE(stemCode.first);
    const std::string dir = tmpDir() + "/scan";
    std::string code = "read";
    try {
      scanner().scanPdf(pdfPath(stemCode.first), dir);
    } catch (const mbm::PdfError& e) {
      code = e.code;
    }
    CHECK(code == stemCode.second);
    CHECK_FALSE(std::filesystem::exists(dir));
  }
}
