#include "core/scanner.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <limits>
#include <map>
#include <mutex>
#include <utility>

#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "core/align.h"
#include "core/box_cut.h"
#include "core/crop.h"
#include "core/form_template.h"
#include "core/frame_aligner.h"
#include "core/photo_quality.h"
#include "core/recognizer.h"
#include "core/service_template.h"

namespace mbm {

namespace {

const cv::Scalar CORAL(76, 124, 252);  // #FC7C4C, the found outline on the Original view

double msSince(std::chrono::steady_clock::time_point t) {
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t).count();
}

// Python's str.strip() for the recognizer's text (its only whitespace is the space).
std::string strip(const std::string& s) {
  const auto b = s.find_first_not_of(" \t\n\r\v\f");
  if (b == std::string::npos) return "";
  return s.substr(b, s.find_last_not_of(" \t\n\r\v\f") - b + 1);
}

// A box read in parts (its lines) as one image: the parts top to bottom, left-aligned, padded white on the right.
cv::Mat stackParts(const std::vector<const cv::Mat*>& parts) {
  if (parts.size() == 1) return *parts[0];
  int w = 0, h = 0;
  for (const auto* p : parts) {
    w = std::max(w, p->cols);
    h += p->rows;
  }
  cv::Mat out(h, w, parts[0]->type(), cv::Scalar::all(255));
  int y = 0;
  for (const auto* p : parts) {
    p->copyTo(out(cv::Rect(0, y, p->cols, p->rows)));
    y += p->rows;
  }
  return out;
}

// The sheet as the scan shows it: at most PAGE_SHOW wide (JPEG q90).
std::string writePage(const cv::Mat& sheet, const std::string& outDir) {
  const double s = std::min(1.0, PAGE_SHOW / static_cast<double>(sheet.cols));
  cv::Mat shown;
  if (s < 1) {
    cv::resize(sheet, shown,
               cv::Size(static_cast<int>(std::lround(sheet.cols * s)), static_cast<int>(std::lround(sheet.rows * s))), 0,
               0, cv::INTER_AREA);
  } else {
    shown = sheet;
  }
  const std::string file = outDir + "/page.jpg";
  cv::imwrite(file, shown, {cv::IMWRITE_JPEG_QUALITY, 90});
  return file;
}

// The scan view's Original: the photo at most ORIGINAL_SHOW wide, with the found corners joined and circled (the test
// app's OcrApp.java:188-203).
std::string writeOriginal(const cv::Mat& bgr, const ScanResult& r, const std::string& outDir) {
  const double s = std::min(1.0, ORIGINAL_SHOW / static_cast<double>(bgr.cols));
  cv::Mat shown;
  if (s < 1) {
    cv::resize(bgr, shown, cv::Size(static_cast<int>(std::lround(bgr.cols * s)), static_cast<int>(std::lround(bgr.rows * s))),
               0, 0, cv::INTER_AREA);
  } else {
    shown = bgr.clone();
  }
  if (r.aligned) {
    std::vector<cv::Point> pts;
    for (const auto& c : r.corners) {
      pts.emplace_back(static_cast<int>(std::lround(c.x * s)), static_cast<int>(std::lround(c.y * s)));
    }
    cv::polylines(shown, pts, true, CORAL, 4, cv::LINE_AA);
    for (const auto& p : pts) cv::circle(shown, p, 14, CORAL, 5, cv::LINE_AA);
  }
  const std::string file = outDir + "/original.jpg";
  cv::imwrite(file, shown, {cv::IMWRITE_JPEG_QUALITY, 90});
  return file;
}

std::optional<std::string> termsOf(double cash, double account) {
  if (std::max(cash, account) < 0.04 || std::abs(cash - account) < 0.02) return std::nullopt;
  return std::string(cash > account ? "cash" : "account");
}

}  // namespace

std::optional<cv::Size> jpegSize(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (in.get() != 0xFF || in.get() != 0xD8) return std::nullopt;  // no JPEG start marker
  while (in) {
    if (in.get() != 0xFF) return std::nullopt;  // not at a marker: a broken file
    int marker = in.get();
    while (marker == 0xFF) marker = in.get();  // fill bytes
    if (marker < 0 || marker == 0xD9 || marker == 0xDA) return std::nullopt;  // the end, or image data before a frame
    if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8)) continue;  // markers without a length
    const int hi = in.get(), lo = in.get();
    if (hi < 0 || lo < 0) return std::nullopt;
    const int length = (hi << 8) | lo;
    if (length < 2) return std::nullopt;
    // A frame header (SOF0-15, but not DHT C4, JPG C8 or DAC CC): precision, then height and width.
    if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
      in.get();  // precision
      const int h1 = in.get(), h0 = in.get(), w1 = in.get(), w0 = in.get();
      if (w0 < 0) return std::nullopt;
      const int height = (h1 << 8) | h0, width = (w1 << 8) | w0;
      if (width <= 0 || height <= 0) return std::nullopt;
      return cv::Size(width, height);
    }
    in.seekg(length - 2, std::ios::cur);
  }
  return std::nullopt;
}

int jpegReduction(cv::Size stored) {
  const int longSide = std::max(stored.width, stored.height);
  for (int f : {8, 4, 2})
    if (longSide > f * MAX_SIDE) return f;
  return 1;
}

cv::Mat decodePhoto(const std::string& path) {
  const std::optional<cv::Size> stored = jpegSize(path);
  const int f = stored ? jpegReduction(*stored) : 1;
  const int flags = f == 8 ? cv::IMREAD_REDUCED_COLOR_8
                    : f == 4 ? cv::IMREAD_REDUCED_COLOR_4
                    : f == 2 ? cv::IMREAD_REDUCED_COLOR_2
                             : cv::IMREAD_COLOR;
  cv::Mat img = cv::imread(path, flags);  // applies the photo's EXIF rotation
  if (img.empty()) throw UnreadableImage("can't open the photo: " + path);
  // The size a full decode would have (after the EXIF turn): the reduced decode keeps the photo's shape, turned or not.
  int cols = img.cols, rows = img.rows;
  if (f > 1) {
    const double sw = stored->width / static_cast<double>(f), sh = stored->height / static_cast<double>(f);
    const bool turned = std::abs(img.cols - sh) < std::abs(img.cols - sw);
    cols = turned ? stored->height : stored->width;
    rows = turned ? stored->width : stored->height;
  }
  const int longSide = std::max(cols, rows);
  if (longSide > MAX_SIDE) {
    const double s = MAX_SIDE / static_cast<double>(longSide);
    // Python's round() (the reference's cap) rounds halves to even, as std::nearbyint does; std::lround wouldn't.
    cv::Mat small;
    cv::resize(img, small,
               cv::Size(static_cast<int>(std::nearbyint(cols * s)), static_cast<int>(std::nearbyint(rows * s))), 0, 0,
               cv::INTER_AREA);
    img = small;
  }
  return img;
}

struct Scanner::Impl {
  // A form found by its printed border and cut box by box: the Service Invoice, or BIR Form 2307 (page 1). Each has
  // its own finder, and its own minimum sharpness for a scan (sharpMin) and for the camera's photo (liveMin).
  struct FrameForm {
    ServiceTemplate tmpl;
    FrameAligner aligner;
    double sharpMin, liveMin;

    FrameForm(const std::string& json, double sharp, double live)
        : tmpl(ServiceTemplate::parse(json)), aligner(tmpl), sharpMin(sharp), liveMin(live) {}
  };

  // A frame form found in a photo: which one, and where.
  struct FrameMatch {
    const FrameForm* form;
    FrameFound found;
  };

  FormTemplate form;
  std::vector<FrameForm> frames;  // tried when there are no corner squares; a tie goes to the first
  Recognizer recognizer;
  cv::Mat formInk;  // the blank form's printed ink, to tell an upside-down page
  std::mutex mutex;

  explicit Impl(const Assets& a) : form(FormTemplate::parse(a.fieldMap)), recognizer(a.model, a.dict, a.threads) {
    frames.reserve(2);
    frames.emplace_back(a.serviceJson, quality::SERVICE_SHARP_MIN, quality::SERVICE_LIVE_MIN);
    frames.emplace_back(a.bir2307Json, quality::BIR2307_SHARP_MIN, quality::BIR2307_LIVE_MIN);
    cv::Mat blank = cv::imdecode(a.formPng, cv::IMREAD_GRAYSCALE);
    if (blank.empty()) throw std::invalid_argument("form_small.png can't be decoded");
    formInk = quality::inkMap(blank);
  }

  // The frame form whose border is found with the highest score (a finder finds nothing scoring under 0.75), or none.
  // The photo's lines are searched once, for every form. refit: refine the corners (scans); the live camera skips it.
  std::optional<FrameMatch> findFrame(const cv::Mat& gray, bool refit) const {
    const auto lines = findFrameLines(gray);
    if (!lines) return std::nullopt;
    std::optional<FrameMatch> best;
    for (const auto& f : frames) {
      auto found = f.aligner.find(*lines, gray, refit);
      if (found && (!best || found->score > best->found.score)) best = FrameMatch{&f, *found};
    }
    return best;
  }

  // The MyBizMate Sales Invoice: straightened by its corner squares (H: photo -> page).
  void readSales(const cv::Mat& bgr, const cv::Mat& H, const std::string& outDir,
                 std::chrono::steady_clock::time_point t0, ScanResult& r) {
    cv::Mat page;
    cv::warpPerspective(bgr, page, H, cv::Size(PAGE_W, PAGE_H), cv::INTER_LINEAR);
    cv::Mat pageGray;
    cv::cvtColor(page, pageGray, cv::COLOR_BGR2GRAY);
    if (quality::upsideDown(pageGray, formInk)) {  // the 4 corner squares look the same from every side
      cv::rotate(page, page, cv::ROTATE_180);
      cv::cvtColor(page, pageGray, cv::COLOR_BGR2GRAY);
      r.turned = true;
    }
    r.aligned = true;
    r.form = "sales_invoice";
    r.sharpness = quality::sharpness(pageGray);
    r.light = quality::paperLight(pageGray);
    r.sharpMin = quality::SALES_SHARP_MIN;
    r.darkMax = quality::DARK_MAX;
    r.corners = photoCorners(H, form);
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
    for (const auto& f : form.fields) {
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
    r.terms = termsOf(cash, account);
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
      auto reads = recognizer.recognize(crops, type, altsFor(type));
      for (size_t i = 0; i < fields.size(); i++) readings[fields[i]] = std::move(reads[i]);
    }
    r.timing.readMs = msSince(t2);

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
    if (!outDir.empty()) r.pageFile = writePage(page, outDir);  // the whole page is the sheet here
  }

  // A frame form (the Service Invoice, the BIR 2307): straightened by its border, read as
  // frame_template.FrameReader.read_page reads the Service Invoice. A box with no writing isn't read.
  void readFrameForm(const FrameForm& frame, const cv::Mat& bgr, const FrameFound& found, const std::string& outDir,
                     std::chrono::steady_clock::time_point t0, ScanResult& r) {
    const ServiceTemplate& t = frame.tmpl;
    cv::Mat page;
    cv::warpPerspective(bgr, page, cv::Mat(found.H), t.page, cv::INTER_LINEAR, cv::BORDER_CONSTANT,
                        cv::Scalar(255, 255, 255));
    cv::Mat pageGray;
    cv::cvtColor(page, pageGray, cv::COLOR_BGR2GRAY);
    r.aligned = true;
    r.form = t.name;
    r.sharpness = quality::sharpness(pageGray);  // the whole page, white border included, as the Python measures it
    r.light = quality::paperLight(pageGray);
    r.sharpMin = frame.sharpMin;
    r.darkMax = quality::DARK_MAX;
    r.corners = found.corners;
    r.timing.alignMs = msSince(t0);

    // Cut each box into its parts (its lines); header boxes may reach further past their box than table boxes.
    const auto t1 = std::chrono::steady_clock::now();
    std::map<std::string, std::vector<cv::Mat>> parts;
    double cash = 0, account = 0;
    for (const auto& f : t.fields) {
      if (f.type == "checkbox") {
        const double ratio = inkRatio(page, f.box, 3);
        if (f.name == "terms_cash") cash = ratio;
        if (f.name == "terms_account") account = ratio;
        continue;
      }
      const cv::Vec2i slack = f.box.y < t.frame[0].y ? t.slackHeader : t.slackTable;
      auto cut = cropBox(page, f, slack);
      if (cut.empty()) {
        r.blanks++;
        continue;
      }
      parts[f.name] = std::move(cut);
    }
    r.terms = termsOf(cash, account);
    r.timing.cropMs = msSince(t1);

    // Read each type's parts together, in field order (the types in the order they first appear).
    const auto t2 = std::chrono::steady_clock::now();
    struct Piece {
      const ServiceField* field;
      const cv::Mat* crop;
    };
    std::vector<std::string> types;
    std::map<std::string, std::vector<Piece>> byType;
    for (const auto& f : t.fields) {
      const auto it = parts.find(f.name);
      if (it == parts.end()) continue;
      if (byType.find(f.type) == byType.end()) types.push_back(f.type);
      for (const auto& crop : it->second) byType[f.type].push_back({&f, &crop});
    }
    struct Raw {
      std::string text;
      float conf = 0;
      std::vector<std::string> alts;
    };
    std::map<std::string, Raw> raw;
    for (const auto& type : types) {
      const auto& pieces = byType[type];
      std::vector<cv::Mat> crops;
      for (const auto& p : pieces) crops.push_back(*p.crop);
      auto reads = recognizer.recognize(crops, type, altsFor(type));
      if (type == "date") {
        // Read again with digits only (for "9-16-2026", where letters let a 9 pass for a d). That reading and its
        // backups, when they differ from the first reading, go before the first reading's backups.
        const auto digits = recognizer.recognize(crops, "date_digits", 3);
        for (size_t i = 0; i < reads.size(); i++) {
          std::vector<std::string> extra;
          std::vector<std::string> candidates = {digits[i].text};
          candidates.insert(candidates.end(), digits[i].alts.begin(), digits[i].alts.end());
          for (const auto& s : candidates) {
            if (!s.empty() && s != reads[i].text) extra.push_back(s);
          }
          std::vector<std::string> alts = extra;
          for (const auto& a : reads[i].alts) {
            if (std::find(extra.begin(), extra.end(), a) == extra.end()) alts.push_back(a);
          }
          reads[i].alts = alts;
        }
      }
      for (size_t i = 0; i < pieces.size(); i++) {
        const std::string& name = pieces[i].field->name;
        const auto it = raw.find(name);
        if (it != raw.end()) {  // a multi-line box: the lines in order, joined by a space
          it->second.text = strip(it->second.text + " " + reads[i].text);
          it->second.conf = std::min(it->second.conf, reads[i].conf);
          it->second.alts.clear();
        } else {
          raw[name] = {reads[i].text, reads[i].conf, reads[i].alts};
        }
      }
    }
    // The Service Invoice's amount in words takes 2 lines: one reading, joined by a space, dropped when empty.
    {
      std::string text;
      float conf = std::numeric_limits<float>::infinity();
      bool any = false;
      for (const char* name : {"amount_words", "amount_words2"}) {
        const auto it = raw.find(name);
        if (it == raw.end()) continue;
        if (any) text += " ";
        text += it->second.text;
        conf = std::min(conf, it->second.conf);
        any = true;
      }
      raw.erase("amount_words");
      raw.erase("amount_words2");
      if (!text.empty()) raw["amount_words"] = {text, conf, {}};
    }
    r.timing.readMs = msSince(t2);

    for (const auto& f : t.fields) {
      if (f.type == "checkbox" || f.name == "amount_words2") continue;
      const auto it = raw.find(f.name);
      if (it == raw.end()) continue;
      std::vector<const cv::Mat*> ps;
      for (const char* name : {f.name.c_str(), f.name == "amount_words" ? "amount_words2" : ""}) {
        const auto p = parts.find(name);
        if (p == parts.end()) continue;
        for (const auto& m : p->second) ps.push_back(&m);
      }
      const cv::Mat crop = stackParts(ps);
      BoxRead b;
      b.name = f.name;
      b.type = f.type;
      b.text = it->second.text;
      b.conf = it->second.conf;
      b.alts = it->second.alts;
      b.cropSize = crop.size();
      if (!outDir.empty()) {
        b.cropFile = outDir + "/" + b.name + ".png";
        cv::imwrite(b.cropFile, crop);
      }
      r.reads.push_back(std::move(b));
    }
    if (!outDir.empty()) r.pageFile = writePage(page(t.paper), outDir);
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
  if (!outDir.empty()) {
    std::filesystem::create_directories(outDir);
    r.scanDir = outDir;
  }
  cv::Mat gray;
  cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
  if (auto H = findMarkers(gray, impl_->form)) {
    impl_->readSales(bgr, *H, outDir, t0, r);
  } else if (auto match = impl_->findFrame(gray, true)) {  // no corner squares: maybe a frame form
    impl_->readFrameForm(*match->form, bgr, match->found, outDir, t0, r);
  } else {
    r.timing.alignMs = msSince(t0);
  }
  if (!outDir.empty()) r.originalFile = writeOriginal(bgr, r, outDir);
  r.timing.totalMs = msSince(t0);
  return r;
}

std::optional<FrameDetection> Scanner::detectFrame(const cv::Mat& gray) const {
  const Impl& im = *impl_;
  // The sheet's corners on the page, the page's size and the live minimum, once the form is known.
  auto detection = [&](const std::string& form, const cv::Mat& H, const std::vector<cv::Point2f>& sheet, cv::Size page,
                       double sharpMin) {
    std::vector<cv::Point2f> outline;
    cv::perspectiveTransform(sheet, outline, H.inv());
    cv::Mat straight;  // how sharp the form is in this frame: the frame straightened onto its page, then measured
    cv::warpPerspective(gray, straight, H, page, cv::INTER_LINEAR, cv::BORDER_CONSTANT, cv::Scalar(255));
    FrameDetection d;
    d.form = form;
    std::copy(outline.begin(), outline.end(), d.outline.begin());
    d.sharpness = quality::sharpness(straight);
    d.sharpMin = sharpMin;
    return d;
  };
  if (auto H = findMarkers(gray, im.form)) {
    const auto w = static_cast<float>(PAGE_W), h = static_cast<float>(PAGE_H);
    return detection("sales_invoice", *H, {{0, 0}, {w, 0}, {w, h}, {0, h}}, cv::Size(PAGE_W, PAGE_H),
                     quality::SALES_LIVE_MIN);
  }
  if (auto match = im.findFrame(gray, false)) {  // the live outline skips the corner refit
    const ServiceTemplate& t = match->form->tmpl;
    const cv::Rect& p = t.paper;
    const auto x0 = static_cast<float>(p.x), y0 = static_cast<float>(p.y);
    const auto x1 = static_cast<float>(p.x + p.width), y1 = static_cast<float>(p.y + p.height);
    return detection(t.name, cv::Mat(match->found.H), {{x0, y0}, {x1, y0}, {x1, y1}, {x0, y1}}, t.page,
                     match->form->liveMin);
  }
  return std::nullopt;
}

}  // namespace mbm
