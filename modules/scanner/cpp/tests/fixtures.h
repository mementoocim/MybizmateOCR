// Where the core's tests find their inputs on the device: the scanner's assets (the model, its characters, the field
// map, the small blank form) and the fixtures exported from the Python reference (fixtures/core). main.cpp sets both
// from --assets=DIR and --fixtures=DIR.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "nlohmann/json.hpp"

void setTestDirs(const std::string& assets, const std::string& fixtures);
const std::string& assetsDir();
const std::string& fixturesDir();
std::string tmpDir();  // a fresh, empty folder under ./tmp for each call
std::string readText(const std::string& path);
std::vector<uint8_t> readBytes(const std::string& path);
nlohmann::json readJson(const std::string& path);
