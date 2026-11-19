#include "core/scanner.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <map>
#include <mutex>
#include <utility>

#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "core/align.h"
#include "core/crop.h"
#include "core/form_template.h"
#include "core/photo_quality.h"
#include "core/recognizer.h"

namespace mbm {

namespace {

double msSince(std::chrono::steady_clock::time_point t) {
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t).count();
}

}  // namespace

cv::Mat decodePhoto(const std::string& path) {
  cv::Mat img = cv::imread(path, cv::IMREAD_COLOR);  // applies the photo's EXIF rotation
  if (img.empty()) throw UnreadableImage("can't open the photo: " + path);
  const int longSide = std::max(img.cols, img.rows);
  if (longSide > MAX_SIDE) {
    const double s = MAX_SIDE / static_cast<double>(longSide);
    cv::Mat small;
    cv::resize(img, small, cv::Size(static_cast<int>(std::lround(img.cols * s)), static_cast<int>(std::lround(img.rows * s))),
               0, 0, cv::INTER_AREA);
    img = small;
  }
  return img;
}

struct Scanner::Impl {
  FormTemplate form;
  Recognizer recognizer;
  cv::Mat formInk;  // the blank form's printed ink, to tell an upside-down page
  std::mutex mutex;

  explicit Impl(const Assets& a)
      : form(FormTemplate::parse(a.fieldMap)), recognizer(a.model, a.dict, a.threads) {
    cv::Mat blank = cv::imdecode(a.formPng, cv::IMREAD_GRAYSCALE);
    if (blank.empty()) throw std::invalid_argument("form_small.png can't be decoded");
    formInk = quality::inkMap(blank);
  }
};

Scanner::Scanner(const Assets& assets) : impl_(std::make_unique<Impl>(assets)) {}

Scanner::~Scanner() = default;

ScanResult Scanner::scanPhoto(const std::string& photoPath, const std::string& outDir) {
  return scanImage(decodePhoto(photoPath), outDir);
}

ScanResult Scanner::scanImage(const cv::Mat& bgr, const std::string& outDir) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  const auto t0 = std::chrono::steady_clock::now();
  ScanResult r;
  r.photoSize = bgr.size();

  cv::Mat gray;
  cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
  auto H = findMarkers(gray, impl_->form);
  if (!H) {
    r.timing.alignMs = r.timing.totalMs = msSince(t0);
    return r;
  }
  cv::Mat page;
  cv::warpPerspective(bgr, page, *H, cv::Size(PAGE_W, PAGE_H), cv::INTER_LINEAR);
  cv::Mat pageGray;
  cv::cvtColor(page, pageGray, cv::COLOR_BGR2GRAY);
  if (quality::upsideDown(pageGray, impl_->formInk)) {  // the 4 corner squares look the same from every side
    cv::rotate(page, page, cv::ROTATE_180);
    cv::cvtColor(page, pageGray, cv::COLOR_BGR2GRAY);
    r.turned = true;
  }
  r.aligned = true;
  r.form = "sales_invoice";
  r.sharpness = quality::sharpness(pageGray);
  r.light = quality::paperLight(pageGray);
  r.sharpMin = quality::SALES_SHARP_MIN;
  r.corners = photoCorners(*H, impl_->form);
  r.timing.alignMs = msSince(t0);

  // Cut the boxes; group the crops by type in the order each type first appears.
  const auto t1 = std::chrono::steady_clock::now();
  struct Cut {
    const Field* field;
    cv::Mat crop;
  };
  std::vector<Cut> cuts;
  std::vector<std::string> types;
  double cash = 0, account = 0;
  for (const auto& f : impl_->form.fields) {
    if (f.type == "checkbox") {
      const double ratio = inkRatio(page, f.box, 3);
      if (f.name == "terms_cash") cash = ratio;
      if (f.name == "terms_account") account = ratio;
      continue;
    }
    auto crop = cropField(page, f.box, 6);
    if (!crop) {
      r.blanks++;
      continue;
    }
    cuts.push_back({&f, *crop});
    if (std::find(types.begin(), types.end(), f.type) == types.end()) types.push_back(f.type);
  }
  if (!(std::max(cash, account) < 0.04 || std::abs(cash - account) < 0.02)) r.terms = cash > account ? "cash" : "account";
  r.timing.cropMs = msSince(t1);

  // Read each type's crops together.
  const auto t2 = std::chrono::steady_clock::now();
  std::map<const Field*, Reading> readings;
  for (const auto& type : types) {
    std::vector<const Field*> fields;
    std::vector<cv::Mat> crops;
    for (const auto& c : cuts) {
      if (c.field->type != type) continue;
      fields.push_back(c.field);
      crops.push_back(c.crop);
    }
    auto reads = impl_->recognizer.recognize(crops, type, altsFor(type));
    for (size_t i = 0; i < fields.size(); i++) readings[fields[i]] = std::move(reads[i]);
  }
  r.timing.readMs = msSince(t2);

  // The reads in field order, and the scan's files.
  if (!outDir.empty()) std::filesystem::create_directories(outDir);
  for (const auto& c : cuts) {
    BoxRead b;
    b.name = c.field->name;
    b.type = c.field->type;
    const Reading& rd = readings[c.field];
    b.text = rd.text;
    b.conf = rd.conf;
    b.alts = rd.alts;
    b.cropSize = c.crop.size();
    if (!outDir.empty()) {
      b.cropFile = outDir + "/" + b.name + ".png";
      cv::imwrite(b.cropFile, c.crop);
    }
    r.reads.push_back(std::move(b));
  }
  if (!outDir.empty()) {
    const double s = std::min(1.0, PAGE_SHOW / static_cast<double>(page.cols));
    cv::Mat shown;
    if (s < 1) {
      cv::resize(page, shown, cv::Size(static_cast<int>(std::lround(page.cols * s)), static_cast<int>(std::lround(page.rows * s))),
                 0, 0, cv::INTER_AREA);
    } else {
      shown = page;
    }
    r.pageFile = outDir + "/page.jpg";
    cv::imwrite(r.pageFile, shown, {cv::IMWRITE_JPEG_QUALITY, 90});
  }
  r.timing.totalMs = msSince(t0);
  return r;
}

}  // namespace mbm
