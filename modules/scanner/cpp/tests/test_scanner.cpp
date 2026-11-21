#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/result_json.h"
#include "core/scanner.h"

namespace {

const std::vector<std::string> kSamples = {"inv_0001", "inv_0007", "inv_0011", "inv_0017",
                                           "inv_0027", "inv_0041", "inv_0051", "inv_0091"};

mbm::Scanner& scanner() {
  static mbm::Scanner s(mbm::Assets{readBytes(assetsDir() + "/inference_latin.onnx"), readText(assetsDir() + "/dict.txt"),
                                    readText(assetsDir() + "/field_map.json"), readBytes(assetsDir() + "/form_small.png"),
                                    readText(assetsDir() + "/service_invoice.json"),
                                    readText(assetsDir() + "/bir_2307.json"), 4});
  return s;
}

nlohmann::json expected(const std::string& stem) { return readJson(fixturesDir() + "/expected/" + stem + ".json"); }

std::string photoPath(const std::string& file) { return fixturesDir() + "/photos/" + file; }

mbm::ScanResult scanFixture(const std::string& stem) {
  return scanner().scanPhoto(photoPath(expected(stem)["photo"].get<std::string>()), tmpDir());
}

std::vector<std::string> texts(const mbm::ScanResult& r) {
  std::vector<std::string> out;
  for (const auto& b : r.reads) out.push_back(b.name + "=" + b.text);
  return out;
}

void checkParity(const mbm::ScanResult& r, const nlohmann::json& exp) {
  CHECK(r.aligned == exp["aligned"].get<bool>());
  CHECK(r.form == (exp["form"].is_null() ? std::string() : exp["form"].get<std::string>()));
  CHECK(r.photoSize.width == exp["photoSize"][0].get<int>());
  CHECK(r.photoSize.height == exp["photoSize"][1].get<int>());
  CHECK(r.turned == exp["turned"].get<bool>());
  CHECK(r.blanks == exp["blanks"].get<int>());
  CHECK(r.terms.has_value() == !exp["terms"].is_null());
  if (r.terms && !exp["terms"].is_null()) CHECK(*r.terms == exp["terms"].get<std::string>());
  if (r.aligned && exp["aligned"].get<bool>()) {
    for (int i = 0; i < 4; i++) {
      CHECK(std::abs(r.corners[i].x - exp["corners"][i][0].get<double>()) <= 0.5);
      CHECK(std::abs(r.corners[i].y - exp["corners"][i][1].get<double>()) <= 0.5);
    }
    CHECK(r.sharpness == doctest::Approx(exp["sharpness"].get<double>()).epsilon(0.01));
    CHECK(r.sharpMin == exp["sharpMin"].get<double>());
    CHECK(std::abs(r.light - exp["light"].get<double>()) <= 1.0);
  }
  REQUIRE(r.reads.size() == exp["reads"].size());
  for (size_t i = 0; i < r.reads.size(); i++) {
    const auto& e = exp["reads"][i];
    CAPTURE(e["name"].get<std::string>());
    CHECK(r.reads[i].name == e["name"].get<std::string>());
    CHECK(r.reads[i].type == e["type"].get<std::string>());
    CHECK(r.reads[i].text == e["text"].get<std::string>());
    CHECK(r.reads[i].alts == e["alts"].get<std::vector<std::string>>());
    CHECK(std::abs(r.reads[i].conf - e["conf"].get<float>()) <= 0.002f);
    CHECK(r.reads[i].cropSize == cv::Size(e["cropSize"][0].get<int>(), e["cropSize"][1].get<int>()));
  }
}

}  // namespace

TEST_CASE("parity on every fixture photo") {
  int photos = 0;
  for (const auto& entry : std::filesystem::directory_iterator(fixturesDir() + "/expected")) {
    const std::string stem = entry.path().stem().string();
    CAPTURE(stem);
    checkParity(scanFixture(stem), expected(stem));
    photos++;
  }
  CHECK(photos == 27);
}

TEST_CASE("a Service Invoice's page is its paper") {
  const auto r = scanFixture("svc_0000");
  REQUIRE(r.aligned);
  CHECK(r.form == "service_invoice");
  const cv::Mat page = cv::imread(r.pageFile);
  CHECK(page.cols == 1108);
  CHECK(page.rows == 1618);
}

TEST_CASE("the original view is written, at most 900 px wide") {
  for (const char* stem : {"inv_0007", "blank_page"}) {
    CAPTURE(stem);
    const auto r = scanFixture(stem);
    REQUIRE_FALSE(r.originalFile.empty());
    const cv::Mat img = cv::imread(r.originalFile);
    REQUIRE_FALSE(img.empty());
    CHECK(img.cols <= 900);
  }
}

TEST_CASE("json version 2") {
  const auto aligned = nlohmann::json::parse(mbm::toJson(scanFixture("inv_0007")));
  CHECK(aligned["darkMax"] == 50);
  CHECK(aligned["originalFile"].is_string());
  CHECK(aligned["scanDir"].is_string());
  const auto none = nlohmann::json::parse(mbm::toJson(scanFixture("blank_page")));
  CHECK(none["darkMax"].is_null());
  CHECK(none["originalFile"].is_string());
  CHECK(none["scanDir"].is_string());
}

TEST_CASE("a tiny image finds no form instead of failing") {
  cv::Mat tiny(30, 30, CV_8UC3, cv::Scalar(245, 245, 245));  // too small for the corner squares' threshold block
  mbm::ScanResult r;
  CHECK_NOTHROW(r = scanner().scanImage(tiny, tmpDir()));
  CHECK_FALSE(r.aligned);
  CHECK(r.reads.empty());
}

TEST_CASE("the 8 samples read 243 boxes") {
  size_t boxes = 0;
  for (const auto& stem : kSamples) boxes += scanFixture(stem).reads.size();
  CHECK(boxes == 243);
}

TEST_CASE("exif photo reads upright") {
  auto sideways = scanFixture("inv_0051_exif6");
  auto straight = scanFixture("inv_0051");
  CHECK(sideways.aligned);
  CHECK_FALSE(sideways.turned);
  CHECK(sideways.photoSize == straight.photoSize);
}

TEST_CASE("unreadable file throws UnreadableImage") {
  CHECK_THROWS_AS(scanner().scanPhoto(photoPath("not_an_image.jpg"), tmpDir()), mbm::UnreadableImage);
  CHECK_THROWS_AS(scanner().scanPhoto(photoPath("no_such_file.jpg"), tmpDir()), mbm::UnreadableImage);
}

TEST_CASE("large photo is capped") {
  cv::Mat img = cv::imread(photoPath("inv_0007.jpg"), cv::IMREAD_COLOR), big;
  cv::resize(img, big, cv::Size(), 3.5, 3.5, cv::INTER_LINEAR);
  const std::string dir = tmpDir(), path = dir + "/large.jpg";
  REQUIRE(cv::imwrite(path, big, {cv::IMWRITE_JPEG_QUALITY, 90}));
  auto r = scanner().scanPhoto(path, dir);
  CHECK(std::max(r.photoSize.width, r.photoSize.height) == mbm::MAX_SIDE);
  CHECK(r.aligned);
  CHECK(r.reads.size() >= 40);  // the page still reads; exact parity isn't expected at another scale
}

// The same JPEG with an EXIF Orientation of 6 (turn 90 degrees clockwise to show it), added by hand: OpenCV writes no
// EXIF. An APP1 segment right after the start marker: "Exif", a big-endian TIFF header and one IFD entry (0x0112).
static std::vector<uchar> withOrientation6(const std::vector<uchar>& jpeg) {
  static const uchar app1[] = {0xFF, 0xE1, 0x00, 0x22, 'E', 'x', 'i', 'f', 0, 0, 'M', 'M', 0x00, 0x2A, 0x00, 0x00,
                               0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06,
                               0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  std::vector<uchar> out(jpeg.begin(), jpeg.begin() + 2);
  out.insert(out.end(), std::begin(app1), std::end(app1));
  out.insert(out.end(), jpeg.begin() + 2, jpeg.end());
  return out;
}

// What a full decode capped the reference's way gives: the photo's own decode, shrunk with INTER_AREA.
static cv::Mat fullDecodeCapped(const std::string& path) {
  cv::Mat full = cv::imread(path, cv::IMREAD_COLOR), capped;
  const double s = mbm::MAX_SIDE / static_cast<double>(std::max(full.cols, full.rows));
  cv::resize(full, capped,
             cv::Size(static_cast<int>(std::nearbyint(full.cols * s)), static_cast<int>(std::nearbyint(full.rows * s))),
             0, 0, cv::INTER_AREA);
  return capped;
}

static double meanDifference(const cv::Mat& a, const cv::Mat& b) {
  return cv::norm(a, b, cv::NORM_L1) / static_cast<double>(a.total() * a.channels());
}

TEST_CASE("the JPEG header gives the stored size; other files give none") {
  CHECK(mbm::jpegSize(photoPath("inv_0007_large.jpg")) == cv::Size(3809, 4800));
  CHECK_FALSE(mbm::jpegSize(photoPath("not_an_image.jpg")).has_value());
  CHECK_FALSE(mbm::jpegSize(assetsDir() + "/form_small.png").has_value());
  CHECK_FALSE(mbm::jpegSize(photoPath("no_such_file.jpg")).has_value());
}

TEST_CASE("only a JPEG over twice the cap is decoded smaller, and never below the cap") {
  CHECK(mbm::jpegReduction(cv::Size(3809, 4800)) == 1);    // the fixtures' large photos: in full, as the Python does
  CHECK(mbm::jpegReduction(cv::Size(8160, 6120)) == 2);    // 50 MP
  CHECK(mbm::jpegReduction(cv::Size(12000, 9000)) == 4);   // 108 MP
  CHECK(mbm::jpegReduction(cv::Size(16320, 12240)) == 4);  // 200 MP: an eighth would be under the cap
  CHECK(mbm::jpegReduction(cv::Size(20000, 15000)) == 8);
}

TEST_CASE("a JPEG over twice the cap decodes to a full decode's size, and reads") {
  cv::Mat img = cv::imread(photoPath("inv_0007.jpg"), cv::IMREAD_COLOR), big;
  cv::resize(img, big, cv::Size(), 3.0, 3.0, cv::INTER_LINEAR);  // 5190 x 6537
  const std::string dir = tmpDir(), path = dir + "/huge.jpg";
  REQUIRE(cv::imwrite(path, big, {cv::IMWRITE_JPEG_QUALITY, 90}));
  REQUIRE(mbm::jpegReduction(big.size()) == 2);
  const cv::Mat want = fullDecodeCapped(path), got = mbm::decodePhoto(path);
  REQUIRE(got.size() == want.size());
  CHECK(meanDifference(got, want) > 0.0);  // decoded smaller first: close to a full decode, not the same
  CHECK(meanDifference(got, want) < 2.0);
  auto r = scanner().scanPhoto(path, dir);
  CHECK(r.aligned);
  CHECK(r.reads.size() >= 40);
}

TEST_CASE("a turned JPEG over twice the cap comes out upright, at a full decode's size") {
  cv::Mat img = cv::imread(photoPath("inv_0007.jpg"), cv::IMREAD_COLOR), big, stored;
  cv::resize(img, big, cv::Size(), 3.0, 3.0, cv::INTER_LINEAR);
  cv::rotate(big, stored, cv::ROTATE_90_COUNTERCLOCKWISE);  // stored on its side, as phones store portrait photos
  REQUIRE(mbm::jpegReduction(stored.size()) == 2);
  std::vector<uchar> jpeg;
  REQUIRE(cv::imencode(".jpg", stored, jpeg, {cv::IMWRITE_JPEG_QUALITY, 90}));
  jpeg = withOrientation6(jpeg);
  const std::string path = tmpDir() + "/huge_exif6.jpg";
  {
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(jpeg.data()), static_cast<std::streamsize>(jpeg.size()));
  }
  const cv::Mat want = fullDecodeCapped(path), got = mbm::decodePhoto(path);
  REQUIRE(want.rows > want.cols);  // OpenCV read the EXIF turn
  REQUIRE(got.size() == want.size());
  CHECK(meanDifference(got, want) > 0.0);  // decoded smaller first: close to a full decode, not the same
  CHECK(meanDifference(got, want) < 2.0);
}

TEST_CASE("concurrent scans") {
  const std::string a = photoPath("inv_0007.jpg"), b = photoPath("inv_0051.jpg");
  auto wantA = texts(scanner().scanPhoto(a, tmpDir())), wantB = texts(scanner().scanPhoto(b, tmpDir()));
  std::vector<std::string> gotA, gotB;
  const std::string dirA = tmpDir(), dirB = tmpDir();
  std::thread ta([&] { gotA = texts(scanner().scanPhoto(a, dirA)); });
  std::thread tb([&] { gotB = texts(scanner().scanPhoto(b, dirB)); });
  ta.join();
  tb.join();
  CHECK(gotA == wantA);
  CHECK(gotB == wantB);
}

TEST_CASE("writes the page and the crops") {
  const std::string dir = tmpDir();
  auto r = scanner().scanPhoto(photoPath("inv_0007.jpg"), dir);
  REQUIRE(r.aligned);
  cv::Mat page = cv::imread(r.pageFile, cv::IMREAD_COLOR);
  REQUIRE_FALSE(page.empty());
  CHECK(page.cols == 1200);
  CHECK(page.rows == 1553);
  REQUIRE(r.reads.size() == 45);
  for (const auto& b : r.reads) {
    CAPTURE(b.name);
    cv::Mat crop = cv::imread(b.cropFile, cv::IMREAD_COLOR);
    REQUIRE_FALSE(crop.empty());
    CHECK(crop.size() == b.cropSize);
  }
}

TEST_CASE("json follows the contract") {
  auto read = nlohmann::json::parse(mbm::toJson(scanFixture("inv_0007")));
  for (const char* key : {"aligned", "form", "photoSize", "turned", "corners", "sharpness", "sharpMin", "light", "terms",
                          "blanks", "reads", "pageFile", "timing"}) {
    CAPTURE(key);
    CHECK(read.contains(key));
  }
  CHECK(read["form"] == "sales_invoice");
  CHECK(read["corners"].size() == 4);
  REQUIRE(read["reads"].size() == 45);
  for (const char* key : {"name", "type", "text", "conf", "alts", "cropSize", "cropFile"}) {
    CAPTURE(key);
    CHECK(read["reads"][0].contains(key));
  }
  CHECK(read["reads"][0]["name"] == "invoice_no");
  CHECK(read["reads"][0]["text"] == "0007655");
  for (const char* key : {"alignMs", "cropMs", "readMs", "totalMs"}) CHECK(read["timing"].contains(key));

  auto none = nlohmann::json::parse(mbm::toJson(scanFixture("blank_page")));
  CHECK(none["aligned"] == false);
  for (const char* key : {"form", "corners", "sharpness", "sharpMin", "light", "pageFile", "terms"}) {
    CAPTURE(key);
    CHECK(none[key].is_null());
  }
  CHECK(none["reads"].is_array());
  CHECK(none["reads"].empty());
}
