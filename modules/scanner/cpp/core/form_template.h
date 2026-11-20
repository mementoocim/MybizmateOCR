#pragma once

#include <array>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

// The straightened MyBizMate Sales Invoice: US Letter at 200 DPI (prototype/benchmark/common.py).
constexpr int PAGE_W = 1700, PAGE_H = 2200;

// One box of the form. Types: printed_digits, date, text, tin, checkbox, amount, number.
struct Field {
  std::string name, type;
  cv::Rect box;  // from the field map's bbox [x0, y0, x1, y1]
};

// The form's field map (assets/scanner/field_map.json, written by export_core_fixtures.py).
struct FormTemplate {
  std::array<cv::Point2f, 4> markers;  // the corner squares' centres on the page: tl, tr, br, bl
  std::vector<Field> fields;           // in file order
  static FormTemplate parse(const std::string& fieldMapJson);
};

}  // namespace mbm
