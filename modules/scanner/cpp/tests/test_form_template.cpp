#include <algorithm>

#include "doctest/doctest.h"
#include "fixtures.h"

#include "core/form_template.h"

TEST_CASE("field map parses") {
  auto t = mbm::FormTemplate::parse(readText(assetsDir() + "/field_map.json"));
  CHECK(t.fields.size() == 67);
  CHECK(t.markers[0] == cv::Point2f(85, 85));
  CHECK(t.markers[1] == cv::Point2f(1615, 85));
  CHECK(t.markers[2] == cv::Point2f(1615, 2115));
  CHECK(t.markers[3] == cv::Point2f(85, 2115));
  CHECK(t.fields[0].name == "invoice_no");
  CHECK(t.fields[0].type == "printed_digits");
  CHECK(t.fields[0].box == cv::Rect(1240, 200, 310, 52));
  CHECK(std::count_if(t.fields.begin(), t.fields.end(), [](const mbm::Field& f) { return f.type == "checkbox"; }) == 2);
}
