// A frame template: a form with no corner squares, found by its printed border (coordinates only). Two forms use one:
// the office's Service Invoice, by its table border (assets/scanner/service_invoice.json, made by
// prototype/benchmark/make_service_invoice_template.py), and BIR Form 2307's page 1, by its outer border (bir_2307.json,
// measured on the official blank form by make_2307_template.py). The class keeps the first form's name.
#pragma once

#include <array>
#include <cstddef>
#include <optional>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

struct ServiceField {
  std::string name, type;          // types as in the field map, plus "checkbox", "digits" (0-9) and "code" (A-Z, 0-9)
  std::string label;               // the box as people read it ("Payee's TIN"), when the JSON gives one ("label")
  cv::Rect box;                    // bbox [x0, y0, x1, y1]
  std::optional<cv::Rect> grab;    // where its strokes may start, when wider than the box (the JSON's "grab")
  bool multiline = false;          // read as up to 2 lines (the JSON's "multiline")
  bool comb = false;               // printed as a row of digit cells with ticks between them (the JSON's "comb")
};

struct ServiceTemplate {
  std::string name, title;                   // "service_invoice", "Service Invoice"; "bir_2307", "BIR Form 2307"
  cv::Size page;                             // the straightened page: 1160 x 1860; 1700 x 2600
  std::array<cv::Point2f, 4> frame;          // the border's corners on the page: tl, tr, br, bl
  std::vector<cv::Vec3f> gridH, gridV;       // printed rules: [y, x0, x1] and [x, y0, y1]
  // The border finder keeps this many of the longest lines in each direction (the JSON's "max_lines"; 40 when it gives
  // none, as the Python reference keeps for the Service Invoice). A form with many frame-wide rules needs more, or its
  // border's own lines drop out.
  size_t maxLines = 40;
  cv::Vec2i slackHeader, slackTable;         // how far a box's crop may reach past it, x and y
  cv::Rect paper;                            // the sheet itself on the page
  std::vector<ServiceField> fields;          // in file order
  static ServiceTemplate parse(const std::string& json);
};

}  // namespace mbm
