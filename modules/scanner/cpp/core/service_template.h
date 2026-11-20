// The office's Service Invoice: a form with no corner squares, found by its printed table border
// (assets/scanner/service_invoice.json, made by prototype/benchmark/make_service_invoice_template.py: coordinates only).
#pragma once

#include <array>
#include <optional>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

struct ServiceField {
  std::string name, type;          // types as in the field map, plus "checkbox"
  cv::Rect box;                    // bbox [x0, y0, x1, y1]
  std::optional<cv::Rect> grab;    // where its strokes may start, when wider than the box (the JSON's "grab")
  bool multiline = false;          // read as up to 2 lines (the JSON's "multiline")
};

struct ServiceTemplate {
  std::string name, title;                   // "service_invoice", "Service Invoice"
  cv::Size page;                             // the straightened page: 1160 x 1860
  std::array<cv::Point2f, 4> frame;          // the table border's corners on the page: tl, tr, br, bl
  std::vector<cv::Vec3f> gridH, gridV;       // printed rules: [y, x0, x1] and [x, y0, y1]
  cv::Vec2i slackHeader, slackTable;         // how far a box's crop may reach past it, x and y
  cv::Rect paper;                            // the sheet itself on the page
  std::vector<ServiceField> fields;          // in file order
  static ServiceTemplate parse(const std::string& json);
};

}  // namespace mbm
