#include <cmath>
#include <string>
#include <utility>
#include <vector>

#include <opencv2/imgcodecs.hpp>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/recognizer.h"

namespace {

mbm::Recognizer& rec() {
  static mbm::Recognizer r(readBytes(assetsDir() + "/inference_latin.onnx"), readText(assetsDir() + "/dict.txt"), 4);
  return r;
}

}  // namespace

TEST_CASE("recognizer has 100 classes") { CHECK(rec().charCount() == 100); }

TEST_CASE("readings match the Python on inv_0007's crops") {
  const std::string dir = fixturesDir() + "/crops/inv_0007/";
  // Field order matters: a scan reads each type's crops together, in field order, and the batches depend on it.
  auto expected = nlohmann::ordered_json::parse(readText(dir + "expected.json"));
  REQUIRE(expected.size() == 45);
  std::vector<std::pair<std::string, std::vector<std::string>>> groups;  // type -> names, first-appearance order
  for (auto& [name, exp] : expected.items()) {
    const std::string type = exp["type"];
    auto g = std::find_if(groups.begin(), groups.end(), [&](const auto& p) { return p.first == type; });
    if (g == groups.end()) {
      groups.push_back({type, {}});
      g = groups.end() - 1;
    }
    g->second.push_back(name);
  }
  std::map<std::string, std::string> texts;
  for (const auto& [type, names] : groups) {
    std::vector<cv::Mat> crops;
    for (const auto& name : names) {
      crops.push_back(cv::imread(dir + name + ".png", cv::IMREAD_COLOR));
      REQUIRE_FALSE(crops.back().empty());
    }
    auto reads = rec().recognize(crops, type, mbm::altsFor(type));
    REQUIRE(reads.size() == names.size());
    for (size_t i = 0; i < names.size(); i++) {
      const auto& exp = expected[names[i]];
      CAPTURE(names[i]);
      CHECK(reads[i].text == exp["text"].get<std::string>());
      CHECK(reads[i].alts == exp["alts"].get<std::vector<std::string>>());
      CHECK(std::abs(reads[i].conf - exp["conf"].get<float>()) <= 0.002f);
      texts[names[i]] = reads[i].text;
    }
  }
  CHECK(texts["invoice_no"] == "0007655");
  CHECK(texts["date"] == "Sep 20, 2026");
  CHECK(texts["item4_description"] == "Egqs");
}

TEST_CASE("no crops, no work") { CHECK(rec().recognize({}, "text", 0).empty()); }

TEST_CASE("the 2307's digits and code boxes read only their characters") {
  const std::string dir = fixturesDir() + "/crops/inv_0007/";
  const cv::Mat number = cv::imread(dir + "invoice_no.png", cv::IMREAD_COLOR);  // printed "0007655"
  const cv::Mat date = cv::imread(dir + "date.png", cv::IMREAD_COLOR);          // written "Sep 20, 2026"
  REQUIRE_FALSE(number.empty());
  REQUIRE_FALSE(date.empty());
  CHECK(rec().recognize({number}, "digits", 0)[0].text == "0007655");
  CHECK(rec().recognize({number}, "code", 0)[0].text == "0007655");
  const std::string digits = rec().recognize({date}, "digits", 0)[0].text;
  const std::string code = rec().recognize({date}, "code", 0)[0].text;
  CAPTURE(digits);
  CAPTURE(code);
  CHECK_FALSE(digits.empty());
  CHECK(digits.find_first_not_of("0123456789") == std::string::npos);
  CHECK_FALSE(code.empty());
  CHECK(code.find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") == std::string::npos);
  CHECK(code.find('S') != std::string::npos);  // the capital S of "Sep" reads as itself
}
