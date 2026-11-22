// How fit a straightened page is to read: the right way up, sharp enough, light enough. A port of
// prototype/benchmark/photo_quality.py (the arbiter) by way of the Android test app's PhotoQuality.java.
#pragma once

#include <opencv2/core.hpp>

namespace mbm::quality {

constexpr double SALES_SHARP_MIN = 1.0;    // a MyBizMate Sales Invoice scan below this is flagged "blurry"
constexpr double SALES_LIVE_MIN = 1.2;     // the camera waits for this before its photo
constexpr double SERVICE_SHARP_MIN = 0.5;  // the same for the Service Invoice (its page has more blank paper)
constexpr double SERVICE_LIVE_MIN = 0.7;
// The BIR 2307 takes the Service Invoice's: both are frame forms, measured on the whole straightened page. (No 2307
// photos have been measured for their own yet.) Its light threshold is DARK_MAX, as for every form.
constexpr double BIR2307_SHARP_MIN = SERVICE_SHARP_MIN;
constexpr double BIR2307_LIVE_MIN = SERVICE_LIVE_MIN;
constexpr double DARK_MAX = 50;          // paper darker than this (0-255) is flagged "dark"
constexpr double TURN_MARGIN = 0.15;     // turn when the page matches the form this much better upside down

// Directional sharpness of a straightened page (grey, 8-bit), measured 425 px wide: the weakest of 4 directions'
// fine detail over the page's coarser detail.
double sharpness(const cv::Mat& gray);

// How bright the paper is: the page's 90th percentile.
double paperLight(const cv::Mat& gray);

// The page's printed ink, small and normalized (CV_32F, 220 x 170, zero mean, unit norm).
cv::Mat inkMap(const cv::Mat& gray);

// ref: inkMap of the blank form. True when the page matches it clearly better turned around.
bool upsideDown(const cv::Mat& gray, const cv::Mat& ref);

// numpy.percentile with its default linear interpolation, for an 8-bit grey image; q in 0..100.
double percentile(const cv::Mat& gray8, double q);

}  // namespace mbm::quality
