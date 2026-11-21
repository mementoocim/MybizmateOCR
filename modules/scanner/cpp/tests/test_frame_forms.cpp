// The forms found by their printed border: the Service Invoice and BIR Form 2307 (page 1). Each is found as itself, and
// the 2307's boxes are cut (its comb boxes' ticks erased) and read. The 2307 has no Python reference: what it should
// read is what synth_2307.py wrote into the synthetic fixtures (fixtures/core/expected2307).
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <map>
#include <string>
#include <vector>

#include <opencv2/geometry/2d.hpp>  // OpenCV 5: getPerspectiveTransform
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/pdf_reader.h"
#include "core/photo_quality.h"
#include "core/result_json.h"
#include "core/scanner.h"
#include "core/service_template.h"

namespace {

const std::vector<std::string> kPhotos = {"bir2307_photo_0", "bir2307_photo_1", "bir2307_photo_2"};
const std::vector<std::string> kPictures = {"bir2307_picture_0", "bir2307_picture_1"};  // the picture PDFs' pages

mbm::Scanner& scanner() {
  static mbm::Scanner s(mbm::Assets{readBytes(assetsDir() + "/inference_latin.onnx"), readText(assetsDir() + "/dict.txt"),
                                    readText(assetsDir() + "/field_map.json"), readBytes(assetsDir() + "/form_small.png"),
                                    readText(assetsDir() + "/service_invoice.json"),
                                    readText(assetsDir() + "/bir_2307.json"), 4});
  return s;
}

const mbm::ServiceTemplate& bir2307() {
  static const mbm::ServiceTemplate t = mbm::ServiceTemplate::parse(readText(assetsDir() + "/bir_2307.json"));
  return t;
}

const mbm::ServiceField& field(const mbm::ServiceTemplate& t, const std::string& name) {
  for (const auto& f : t.fields) {
    if (f.name == name) return f;
  }
  throw std::runtime_error("no field " + name);
}

// The values written into a 2307 fixture: {box: text}, its blank boxes left out.
nlohmann::json written(const std::string& stem) {
  return readJson(fixturesDir() + "/expected2307/" + stem + ".json")["values"];
}

// A 2307 photo scanned, or a picture PDF's page 1 (rendered by renderPdf) scanned like a photo; each once per run.
const mbm::ScanResult& scanned(const std::string& stem) {
  static std::map<std::string, mbm::ScanResult> done;
  const auto it = done.find(stem);
  if (it != done.end()) return it->second;
  const bool photo = stem.rfind("bir2307_photo_", 0) == 0;
  mbm::ScanResult r = photo ? scanner().scanPhoto(fixturesDir() + "/bir2307/" + stem + ".jpg", tmpDir())
                            : scanner().scanImage(mbm::renderPdf(fixturesDir() + "/pdf/" + stem + ".pdf").bgr, tmpDir());
  return done.emplace(stem, std::move(r)).first->second;
}

std::map<std::string, std::string> readsOf(const mbm::ScanResult& r) {
  std::map<std::string, std::string> out;
  for (const auto& b : r.reads) out[b.name] = b.text;
  return out;
}

size_t editDistance(const std::string& a, const std::string& b) {
  std::vector<size_t> row(b.size() + 1);
  for (size_t j = 0; j <= b.size(); j++) row[j] = j;
  for (size_t i = 1; i <= a.size(); i++) {
    size_t diagonal = row[0];
    row[0] = i;
    for (size_t j = 1; j <= b.size(); j++) {
      const size_t above = row[j];
      row[j] = std::min({row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] == b[j - 1] ? 0 : 1)});
      diagonal = above;
    }
  }
  return row[b.size()];
}

size_t digitCount(const std::string& s) {
  return static_cast<size_t>(std::count_if(s.begin(), s.end(), [](char c) { return c >= '0' && c <= '9'; }));
}

std::vector<std::string> all2307() {
  std::vector<std::string> stems = kPhotos;
  stems.insert(stems.end(), kPictures.begin(), kPictures.end());
  return stems;
}

}  // namespace

TEST_CASE("the 2307 template parses, with its labels, comb boxes and line cap") {
  const auto& t = bir2307();
  CHECK(t.name == "bir_2307");
  CHECK(t.title == "BIR Form 2307");
  CHECK(t.page == cv::Size(1700, 2600));
  CHECK(t.fields.size() == 160);
  CHECK(t.maxLines == 60);  // its ~36 frame-wide rules would crowd its border out of the Service Invoice's 40
  CHECK(field(t, "payee_tin").label == "Payee's TIN");
  CHECK(field(t, "ewt3_tax").label == "Row 3 \xC2\xB7 Tax withheld");
  CHECK(field(t, "ewt1_atc").type == "code");
  CHECK(field(t, "payee_zip").type == "digits");
  std::vector<std::string> combs;
  for (const auto& f : t.fields) {
    CAPTURE(f.name);
    CHECK(f.comb == (f.type == "tin" || f.type == "digits"));  // the comb boxes are its TINs, period and ZIP codes
    if (f.comb) combs.push_back(f.name);
  }
  CHECK(combs == std::vector<std::string>{"period_from", "period_to", "payee_tin", "payee_zip", "payor_tin", "payor_zip"});

  const auto service = mbm::ServiceTemplate::parse(readText(assetsDir() + "/service_invoice.json"));
  CHECK(service.maxLines == 40);  // as the Python reference keeps
  CHECK(field(service, "customer_tin").type == "tin");
  CHECK_FALSE(field(service, "customer_tin").comb);  // a plain box: cut exactly as the Python cuts it
  CHECK(field(service, "date").label.empty());
}

TEST_CASE("each frame form is found as itself") {
  int service = 0;
  for (const auto& entry : std::filesystem::directory_iterator(fixturesDir() + "/expected")) {
    const nlohmann::json e = readJson(entry.path().string());
    if (e["form"] != "service_invoice") continue;
    CAPTURE(entry.path().stem().string());
    CHECK(scanner().scanPhoto(fixturesDir() + "/photos/" + e["photo"].get<std::string>(), tmpDir()).form ==
          "service_invoice");
    service++;
  }
  CHECK(service == 9);
  for (const auto& stem : all2307()) {
    CAPTURE(stem);
    CHECK(scanned(stem).form == "bir_2307");
  }
}

TEST_CASE("the 2307's printed values read right") {
  for (const auto& stem : kPictures) {
    CAPTURE(stem);
    const auto reads = readsOf(scanned(stem));
    const auto values = written(stem);
    int wrong = 0;
    for (const auto& item : values.items()) {
      const std::string name = item.key(), want = item.value().get<std::string>();
      const auto it = reads.find(name);
      const std::string got = it == reads.end() ? std::string() : it->second;
      if (got == want) continue;
      CAPTURE(name);
      CAPTURE(got);
      CHECK(editDistance(got, want) <= 1);  // typed text: a box that misses is off by one character at most
      wrong++;
    }
    CHECK(values.size() >= 36);
    CHECK(wrong <= 2);
  }
}

TEST_CASE("the photos read") {
  size_t boxes = 0, exact = 0;
  for (const auto& stem : kPhotos) {
    const auto reads = readsOf(scanned(stem));
    const auto values = written(stem);
    for (const auto& item : values.items()) {
      boxes++;
      const auto it = reads.find(item.key());
      if (it != reads.end() && it->second == item.value().get<std::string>()) exact++;
    }
  }
  CHECK(boxes == 97);
  CAPTURE(boxes);
  CAPTURE(exact);
  CHECK(exact * 10 >= boxes * 9);  // at least 90% exactly
}

TEST_CASE("ticks don't read as ones") {
  for (const auto& stem : all2307()) {
    const auto values = written(stem);
    for (const auto& b : scanned(stem).reads) {
      if (b.type != "tin" && b.type != "digits") continue;
      CAPTURE(stem);
      CAPTURE(b.name);
      CHECK(digitCount(b.text) <= digitCount(values.value(b.name, std::string())));
    }
  }
}

TEST_CASE("a comb box's crop holds only its digits: the ticks and the TIN's dash cells are gone") {
  for (const auto& stem : kPictures) {
    const auto values = written(stem);
    int combs = 0;
    for (const auto& b : scanned(stem).reads) {
      if (!field(bir2307(), b.name).comb) continue;
      CAPTURE(stem);
      CAPTURE(b.name);
      const cv::Mat crop = cv::imread(b.cropFile, cv::IMREAD_GRAYSCALE);
      REQUIRE_FALSE(crop.empty());
      cv::Mat labels;
      const int parts = cv::connectedComponents(crop < 128, labels, 8) - 1;  // each typed digit is one stroke
      CHECK(parts == static_cast<int>(values[b.name].get<std::string>().size()));
      combs++;
    }
    CHECK(combs == 6);
  }
}

TEST_CASE("a 2307's blank boxes aren't read") {
  for (const auto& stem : kPictures) {
    CAPTURE(stem);
    const auto& r = scanned(stem);
    const auto values = written(stem);
    CHECK(r.reads.size() == values.size());
    CHECK(r.blanks == static_cast<int>(bir2307().fields.size() - values.size()));
    for (const auto& b : r.reads) CHECK(values.contains(b.name));
  }
}

TEST_CASE("a 2307 scan: the Service Invoice's photo checks, its paper as the page, and the JSON") {
  const auto& r = scanned("bir2307_picture_0");
  REQUIRE(r.aligned);
  CHECK_FALSE(r.turned);
  CHECK(r.sharpMin == mbm::quality::SERVICE_SHARP_MIN);
  CHECK(r.darkMax == mbm::quality::DARK_MAX);
  CHECK(r.sharpness >= r.sharpMin);
  CHECK_FALSE(r.terms.has_value());
  const cv::Mat page = cv::imread(r.pageFile);
  CHECK(page.cols == 1200);  // the paper (1660 x 2437 on the template's page), at most 1200 wide
  CHECK(page.rows == 1762);
  const auto j = nlohmann::json::parse(mbm::toJson(r));
  CHECK(j["form"] == "bir_2307");
  CHECK(j["reads"][0]["name"] == "period_from");
  CHECK(j["reads"][0]["type"] == "digits");
}

TEST_CASE("the camera finds a 2307: its paper's outline and the Service Invoice's live minimum") {
  // A 2307 photo as a camera frame: fitted, kept in shape, on a 960 x 1280 grey frame (as the camera's test image is).
  // Its border scores 0.81 there. (photo_0, the most tilted, scores 0.72 at this size, under the finder's 0.75: the
  // camera misses it, though the scan finds it at 0.77.)
  const std::string stem = "bir2307_photo_2";
  const cv::Mat photo = mbm::decodePhoto(fixturesDir() + "/bir2307/" + stem + ".jpg");
  cv::Mat gray, small;
  cv::cvtColor(photo, gray, cv::COLOR_BGR2GRAY);
  const double s = std::min(960.0 / gray.cols, 1280.0 / gray.rows);
  cv::resize(gray, small, cv::Size(static_cast<int>(std::lround(gray.cols * s)), static_cast<int>(std::lround(gray.rows * s))),
             0, 0, cv::INTER_AREA);
  cv::Mat frame(1280, 960, CV_8U, cv::Scalar(128));
  const cv::Point at((960 - small.cols) / 2, (1280 - small.rows) / 2);
  small.copyTo(frame(cv::Rect(at, small.size())));

  const auto d = scanner().detectFrame(frame);
  REQUIRE(d.has_value());
  CHECK(d->form == "bir_2307");
  CHECK(d->sharpMin == mbm::quality::SERVICE_LIVE_MIN);
  // the outline is the 2307's paper: where the scan's border puts it, give or take the scan's corner refit
  const auto& r = scanned(stem);
  REQUIRE(r.aligned);
  const auto& t = bir2307();
  const cv::Mat H = cv::getPerspectiveTransform(r.corners.data(), t.frame.data());  // photo -> page
  const auto x0 = static_cast<float>(t.paper.x), y0 = static_cast<float>(t.paper.y);
  const auto x1 = static_cast<float>(t.paper.x + t.paper.width), y1 = static_cast<float>(t.paper.y + t.paper.height);
  std::vector<cv::Point2f> paper;
  cv::perspectiveTransform(std::vector<cv::Point2f>{{x0, y0}, {x1, y0}, {x1, y1}, {x0, y1}}, paper, H.inv());
  for (int k = 0; k < 4; k++) {
    CAPTURE(k);
    const cv::Point2f want(static_cast<float>(paper[k].x * s + at.x), static_cast<float>(paper[k].y * s + at.y));
    CHECK(std::hypot(d->outline[k].x - want.x, d->outline[k].y - want.y) <= 8.0);
  }
}
