// Cutting one box of a frame form (the Service Invoice, the BIR 2307) out of the straightened page: a port of crop_box
// and _line_bands (prototype/benchmark/frame_template.py, the arbiter for the Service Invoice).
//
// A box keeps the pen strokes whose centre falls inside it (its grab area), plus the small pieces of them that poke
// past a printed rule. Printed rules and other boxes' strokes are blanked to the paper's grey, and so are a comb box's
// ticks (the 2307's period, TINs and ZIP codes; no Python reference). A multi-line box is cut into its lines.
#pragma once

#include <vector>

#include <opencv2/core.hpp>

#include "core/service_template.h"

namespace mbm {

// The box's writing (BGR) as one crop per line, padded by 6 px; empty when the box holds no writing.
// slack: how far the crop may reach past the box (the template's header or table slack).
std::vector<cv::Mat> cropBox(const cv::Mat& pageBgr, const ServiceField& field, cv::Vec2i slack);

}  // namespace mbm
