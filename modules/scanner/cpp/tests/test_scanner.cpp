#include <algorithm>
#include <cmath>
#include <filesystem>
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
                                    4});
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
  CHECK(photos == 14);
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
