#pragma once

#include <string>

#include "core/scanner.h"

namespace mbm {

// The scan result as JSON: the contract TypeScript reads (docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md,
// "The scan result"). form, corners, sharpness, sharpMin, light and pageFile are null when no form was found.
std::string toJson(const ScanResult& r);

}  // namespace mbm
