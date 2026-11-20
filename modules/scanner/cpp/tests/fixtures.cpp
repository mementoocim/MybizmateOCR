#include "fixtures.h"

#include <atomic>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <stdexcept>

namespace {
std::string gAssets = "assets";
std::string gFixtures = "fixtures";
std::atomic<int> gTmpCount{0};
}  // namespace

void setTestDirs(const std::string& assets, const std::string& fixtures) {
  gAssets = assets;
  gFixtures = fixtures;
}

const std::string& assetsDir() { return gAssets; }

const std::string& fixturesDir() { return gFixtures; }

std::string tmpDir() {
  std::string dir = "tmp/" + std::to_string(++gTmpCount);
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
  return dir;
}

std::vector<uint8_t> readBytes(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) throw std::runtime_error("can't open " + path);
  return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}

std::string readText(const std::string& path) {
  auto bytes = readBytes(path);
  return {bytes.begin(), bytes.end()};
}

nlohmann::json readJson(const std::string& path) { return nlohmann::json::parse(readText(path)); }
