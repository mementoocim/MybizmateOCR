#include "core/frame_aligner.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>

#include <opencv2/geometry/2d.hpp>  // OpenCV 5: fitLine, contourArea, getPerspectiveTransform
#include <opencv2/imgproc.hpp>

#include "core/numpy_compat.h"

// Parity notes (the Python is the arbiter):
// - The Python's lines and crossings are float64 and its quads float32. numpy 2 keeps float32 when a Python float
//   joins in (NEP 50), so the aspect check, the quad's bounds and the refit's crossings are float32 here too.
// - np.round and Python's round() round halves to even, as std::nearbyint does.
// - Python's sorts are stable and max() keeps the first of equals; std::stable_sort and strict > do the same.
namespace mbm {

namespace {

constexpr int WORK_SIDE = 1400;       // lines are searched on a copy this big (longest side)
constexpr double MIN_SCORE = 0.75;    // printed grid on ink, minus ink just beside it
constexpr size_t MAX_LINES = 40;      // longest candidate lines kept per direction
constexpr double SIDE_INK = 0.7;      // share of a border side that must be inked between its corners
constexpr double OFF = 12;            // template px beside a rule where there should be paper
constexpr double PARALLEL = 0.26;     // sin of the widest angle between opposite sides (15 degrees)
constexpr size_t FINALISTS = 8;       // candidates that get the full check after the quick one
constexpr double END_GAP = 0.015, END_REACH = 0.06, END_INK = 0.6;  // a border's lines stop at its corners
constexpr double RAD_TO_DEG = 180.0 / CV_PI;  // math.degrees

using Quad = std::array<cv::Point2f, 4>;

// A straight line: its weighted centre, unit direction, and how much of it the merged segments cover.
struct Line {
  cv::Vec2d c, d;
  double covered = 0;
};

cv::Mat binarize(const cv::Mat& gray) {
  const int mn = std::min(gray.rows, gray.cols);
  cv::Mat blur, th;
  cv::GaussianBlur(gray, blur, cv::Size(5, 5), 0);
  cv::adaptiveThreshold(blur, th, 255, cv::ADAPTIVE_THRESH_MEAN_C, cv::THRESH_BINARY_INV,
                        static_cast<int>(mn * 0.04) | 1, 15);
  return th;
}

double pyMod(double a, double b) {  // Python's float %: the result takes the divisor's sign
  double m = std::fmod(a, b);
  if (m != 0 && ((b < 0) != (m < 0))) m += b;
  return m;
}

// The unit eigenvector of the symmetric [[a, b], [b, c]] with the larger eigenvalue (numpy.linalg.eigh's last).
cv::Vec2d principal(double a, double b, double c) {
  if (b == 0) return a >= c ? cv::Vec2d(1, 0) : cv::Vec2d(0, 1);
  const double lambda = (a + c) / 2 + std::hypot((a - c) / 2, b);
  const cv::Vec2d v = a >= c ? cv::Vec2d(lambda - c, b) : cv::Vec2d(b, lambda - a);
  const double n = std::hypot(v[0], v[1]);
  return {v[0] / n, v[1] / n};
}

// _merge: groups Hough segments lying on the same straight line, longest coverage first.
std::vector<Line> merge(const std::vector<cv::Vec4d>& segs, bool horizontal, cv::Size size, double tol) {
  const double cx = size.width / 2.0, cy = size.height / 2.0;
  struct Item {
    double off, ang;
    cv::Vec4d seg;
    double n;
  };
  std::vector<Item> items;
  for (const auto& s : segs) {
    const double x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3];
    const double dx = x2 - x1, dy = y2 - y1;
    const double n = std::hypot(dx, dy);
    if (n == 0) continue;
    double ang = std::atan2(dy, dx) * RAD_TO_DEG;
    ang = ang <= -90 ? ang + 180 : ang > 90 ? ang - 180 : ang;
    if (horizontal != (std::abs(ang) <= 30)) continue;
    if (!horizontal && std::abs(ang) < 60) continue;
    // where the segment's line crosses the image's middle column (horizontal) or row (vertical)
    const double off = horizontal ? y1 + (cx - x1) * dy / dx : x1 + (cy - y1) * dx / dy;
    items.push_back({off, horizontal ? ang : pyMod(ang, 180.0), s, n});
  }
  std::stable_sort(items.begin(), items.end(), [](const Item& a, const Item& b) { return a.off < b.off; });

  struct Group {
    double off, ang;
    std::vector<Item> items;
  };
  std::vector<Group> groups;
  for (const auto& it : items) {
    bool joined = false;
    for (auto& g : groups) {
      if (std::abs(it.off - g.off) <= tol && std::abs(it.ang - g.ang) <= 3) {
        g.items.push_back(it);
        double w = 0, off = 0, ang = 0;
        for (const auto& i : g.items) w += i.n;
        for (const auto& i : g.items) off += i.off * i.n;
        for (const auto& i : g.items) ang += i.ang * i.n;
        g.off = off / w;
        g.ang = ang / w;
        joined = true;
        break;
      }
    }
    if (!joined) groups.push_back({it.off, it.ang, {it}});
  }

  std::vector<Line> lines;
  for (const auto& g : groups) {
    // the segments' ends, each weighted by its segment's length
    std::vector<cv::Vec2d> pts;
    std::vector<double> wts;
    for (const auto& i : g.items) {
      pts.emplace_back(i.seg[0], i.seg[1]);
      pts.emplace_back(i.seg[2], i.seg[3]);
      wts.push_back(i.n);
      wts.push_back(i.n);
    }
    double sx = 0, sy = 0;  // (pts * wts[:, None]).sum(0): left to right
    for (size_t k = 0; k < pts.size(); k++) {
      sx += pts[k][0] * wts[k];
      sy += pts[k][1] * wts[k];
    }
    const double wsum = npSum(wts);  // wts.sum(): numpy's pairwise sum
    const cv::Vec2d c(sx / wsum, sy / wsum);
    double cxx = 0, cyx = 0, cyy = 0;  // ((pts - c) * w).T @ (pts - c); eigh reads the lower triangle
    for (size_t k = 0; k < pts.size(); k++) {
      const double ex = pts[k][0] - c[0], ey = pts[k][1] - c[1];
      cxx += ex * wts[k] * ex;
      cyx += ey * wts[k] * ex;
      cyy += ey * wts[k] * ey;
    }
    cv::Vec2d d = principal(cxx, cyx, cyy);
    if ((horizontal && d[0] < 0) || (!horizontal && d[1] < 0)) d = -d;
    std::vector<std::pair<double, double>> spans;
    for (const auto& i : g.items) {
      const double s0 = (i.seg[0] - c[0]) * d[0] + (i.seg[1] - c[1]) * d[1];
      const double s1 = (i.seg[2] - c[0]) * d[0] + (i.seg[3] - c[1]) * d[1];
      spans.emplace_back(std::min(s0, s1), std::max(s0, s1));
    }
    std::sort(spans.begin(), spans.end());
    double covered = 0, lo = 0, hi = 0;
    bool open = false;
    for (const auto& [a, b] : spans) {
      if (!open || a > hi) {
        if (open) covered += hi - lo;
        lo = a;
        hi = b;
        open = true;
      } else {
        hi = std::max(hi, b);
      }
    }
    covered += hi - lo;
    lines.push_back({c, d, covered});
  }
  std::stable_sort(lines.begin(), lines.end(), [](const Line& a, const Line& b) { return a.covered > b.covered; });
  return lines;
}

double cross2(const cv::Vec2d& u, const cv::Vec2d& v) { return u[0] * v[1] - u[1] * v[0]; }

// _profile: running count of ink along a line across the whole image (by x for a near-horizontal line, by y for a
// near-vertical one), so the inked share of any stretch of it is two lookups.
std::vector<int64_t> profile(const Line& l, const cv::Mat& mask, bool horizontal) {
  const int h = mask.rows, w = mask.cols, n = horizontal ? w : h;
  std::vector<int64_t> prof(n + 1, 0);
  for (int k = 0; k < n; k++) {
    const double u = k;
    const double xs = horizontal ? u : l.c[0] + (u - l.c[1]) * l.d[0] / l.d[1];
    const double ys = horizontal ? l.c[1] + (u - l.c[0]) * l.d[1] / l.d[0] : u;
    const double xr = std::nearbyint(xs), yr = std::nearbyint(ys);
    const bool hit = xr >= 0 && yr >= 0 && xr < w && yr < h &&
                     mask.at<uint8_t>(static_cast<int>(yr), static_cast<int>(xr)) != 0;
    prof[k + 1] = prof[k] + (hit ? 1 : 0);
  }
  return prof;
}

std::optional<double> share(const std::vector<int64_t>& prof, double a, double b) {
  const double n = static_cast<double>(prof.size() - 1);
  const auto ia = static_cast<int64_t>(std::nearbyint(std::min(n, std::max(0.0, a))));
  const auto ib = static_cast<int64_t>(std::nearbyint(std::min(n, std::max(0.0, b))));
  if (ib - ia < 3) return std::nullopt;
  return static_cast<double>(prof[ib] - prof[ia]) / static_cast<double>(ib - ia);
}

// Inked share of a line between two positions along it, leaving out 5% at each end (the corners).
double inked(const std::vector<int64_t>& prof, double u0, double u1) {
  const double lo = std::min(u0, u1), hi = std::max(u0, u1);
  return share(prof, lo + 0.05 * (hi - lo), hi - 0.05 * (hi - lo)).value_or(0.0);
}

// True if the line stops at both positions: mostly paper just past each one (off the photo counts as paper).
bool ends(const std::vector<int64_t>& prof, double u0, double u1) {
  const double lo = std::min(u0, u1), hi = std::max(u0, u1), span = hi - lo;
  const std::pair<double, double> stretches[] = {{lo - END_REACH * span, lo - END_GAP * span},
                                                 {hi + END_GAP * span, hi + END_REACH * span}};
  for (const auto& [a, b] : stretches) {
    const auto s = share(prof, a, b);
    if (s && *s > END_INK) return false;
  }
  return true;
}

std::optional<cv::Vec2d> intersect(const Line& l1, const Line& l2) {
  const cv::Vec2d &p = l1.c, &r = l1.d, &q = l2.c, &s = l2.d;
  const double den = r[0] * s[1] - r[1] * s[0];
  if (std::abs(den) < 1e-9) return std::nullopt;
  const double t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
  return cv::Vec2d(p[0] + t * r[0], p[1] + t * r[1]);
}

// The refit's crossing: fitLine gives float32 points and directions, so the Python computes this one in float32.
std::optional<cv::Point2f> intersectF(cv::Point2f p, cv::Point2f r, cv::Point2f q, cv::Point2f s) {
  const float den = r.x * s.y - r.y * s.x;
  if (std::abs(den) < 1e-9f) return std::nullopt;
  const float t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
  return cv::Point2f(p.x + t * r.x, p.y + t * r.y);
}

float normF(cv::Point2f v) { return std::sqrt(v.x * v.x + v.y * v.y); }

bool convex(const Quad& q) {
  int sign = 0;
  for (int i = 0; i < 4; i++) {
    const cv::Point2f a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const float cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const int s = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    if (s == 0 || (sign != 0 && s != sign)) return false;
    sign = s;
  }
  return true;
}

std::vector<double> arange(double start, double stop, double step) {  // numpy.arange for these values
  std::vector<double> v;
  const double n = std::ceil((stop - start) / step);
  for (int i = 0; i < n; i++) v.push_back(start + i * step);
  return v;
}

}  // namespace

FrameAligner::FrameAligner(const ServiceTemplate& t) : dst_(t.frame) {
  aspect_ = (dst_[1].x - dst_[0].x) / (dst_[3].y - dst_[0].y);
  for (const auto& r : t.gridH) {  // [y, x0, x1]
    const double y = r[0];
    for (double x : arange(r[1] + 8.0, r[2] - 8.0, 10)) {
      on_.emplace_back(static_cast<float>(x), static_cast<float>(y));
      beside_.emplace_back(static_cast<float>(x), static_cast<float>(y - OFF));
      beside_.emplace_back(static_cast<float>(x), static_cast<float>(y + OFF));
    }
  }
  for (const auto& r : t.gridV) {  // [x, y0, y1]
    const double x = r[0];
    for (double y : arange(r[1] + 8.0, r[2] - 8.0, 10)) {
      on_.emplace_back(static_cast<float>(x), static_cast<float>(y));
      beside_.emplace_back(static_cast<float>(x - OFF), static_cast<float>(y));
      beside_.emplace_back(static_cast<float>(x + OFF), static_cast<float>(y));
    }
  }
}

double FrameAligner::score(const Quad& q, const cv::Mat& near, const cv::Mat& ink, int step) const {
  const cv::Mat M = cv::getPerspectiveTransform(dst_.data(), q.data());  // page -> photo
  auto hits = [&](const std::vector<cv::Point2f>& pts, const cv::Mat& mask) {
    std::vector<cv::Point2f> sub, out;
    for (size_t i = 0; i < pts.size(); i += step) sub.push_back(pts[i]);
    cv::perspectiveTransform(sub, out, M);
    int64_t n = 0;
    for (const auto& p : out) {
      const float x = std::nearbyint(p.x), y = std::nearbyint(p.y);
      if (x >= 0 && y >= 0 && x < mask.cols && y < mask.rows &&
          mask.at<uint8_t>(static_cast<int>(y), static_cast<int>(x)) != 0)
        n++;
    }
    return static_cast<double>(n) / static_cast<double>(out.size());
  };
  return hits(on_, near) - hits(beside_, ink);
}

FrameAligner::Quad FrameAligner::refine(const cv::Mat& gray, const Quad& q) const {
  const cv::Mat th = binarize(gray);
  std::vector<cv::Point> ink;
  cv::findNonZero(th, ink);  // row by row, like np.nonzero
  const double band = std::max(3.0, std::min(gray.rows, gray.cols) * 0.003);
  struct Side {
    cv::Point2f p, v;
  };
  std::array<std::optional<Side>, 4> sides;
  for (int k = 0; k < 4; k++) {
    const double ax = q[k].x, ay = q[k].y, bx = q[(k + 1) % 4].x, by = q[(k + 1) % 4].y;
    const double dx = bx - ax, dy = by - ay;
    const double len = std::sqrt(dx * dx + dy * dy);
    const double ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    std::vector<cv::Point2f> sel;
    for (const auto& p : ink) {
      const double rx = p.x - ax, ry = p.y - ay;
      const double t = rx * ux + ry * uy, off = rx * nx + ry * ny;
      if (t > 0.1 * len && t < 0.9 * len && std::abs(off) < band) {
        sel.emplace_back(static_cast<float>(p.x), static_cast<float>(p.y));
      }
    }
    if (static_cast<double>(sel.size()) < 0.3 * len) continue;
    cv::Vec4f line;
    cv::fitLine(sel, line, cv::DIST_HUBER, 0, 0.01, 0.01);
    sides[k] = Side{{line[2], line[3]}, {line[0], line[1]}};
  }
  Quad out;
  for (int k = 0; k < 4; k++) {
    const auto& prev = sides[(k + 3) % 4];
    const auto& cur = sides[k];
    std::optional<cv::Point2f> p;
    if (prev && cur) p = intersectF(prev->p, prev->v, cur->p, cur->v);
    out[k] = (p && normF(*p - q[k]) < static_cast<float>(4 * band)) ? *p : q[k];
  }
  return out;
}

std::optional<FrameFound> FrameAligner::find(const cv::Mat& gray, bool refit) const {
  const int h0 = gray.rows, w0 = gray.cols;
  const double s = std::min(1.0, WORK_SIDE / static_cast<double>(std::max(h0, w0)));
  cv::Mat small = gray;
  if (s < 1) {
    cv::resize(gray, small,
               cv::Size(static_cast<int>(std::nearbyint(w0 * s)), static_cast<int>(std::nearbyint(h0 * s))), 0, 0,
               cv::INTER_AREA);
  }
  const int h = small.rows, w = small.cols, mn = std::min(h, w);
  // Too small to hold a form: the threshold's block would be under 3 px, which OpenCV refuses (the Python would raise;
  // the app says it found no form instead, as align.cpp does for the corner squares).
  if ((static_cast<int>(mn * 0.04) | 1) < 3) return std::nullopt;
  const cv::Mat th = binarize(small);
  std::vector<cv::Vec4i> found;
  cv::HoughLinesP(th, found, 1, CV_PI / 180, static_cast<int>(mn * 0.08), static_cast<int>(mn * 0.12),
                  static_cast<int>(mn * 0.012));
  if (found.empty()) return std::nullopt;
  std::vector<cv::Vec4d> segs(found.begin(), found.end());
  const double tol = std::max(2.0, mn * 0.003);
  auto keep = [&](bool horizontal) {
    std::vector<Line> out;
    for (const auto& l : merge(segs, horizontal, cv::Size(w, h), tol)) {
      if (out.size() == MAX_LINES) break;
      if (l.covered >= mn * 0.15) out.push_back(l);
    }
    return out;
  };
  std::vector<Line> hs = keep(true), vs = keep(false);
  if (hs.size() < 2 || vs.size() < 2) return std::nullopt;
  cv::Mat near;
  cv::dilate(th, near, cv::Mat::ones(5, 5, CV_8U));
  std::stable_sort(hs.begin(), hs.end(), [](const Line& a, const Line& b) { return a.c[1] < b.c[1]; });
  std::stable_sort(vs.begin(), vs.end(), [](const Line& a, const Line& b) { return a.c[0] < b.c[0]; });
  std::vector<std::vector<int64_t>> hprof, vprof, hthin, vthin;  // thin ink: a rule is solid, text has gaps
  for (const auto& l : hs) {
    hprof.push_back(profile(l, near, true));
    hthin.push_back(profile(l, th, true));
  }
  for (const auto& l : vs) {
    vprof.push_back(profile(l, near, false));
    vthin.push_back(profile(l, th, false));
  }
  std::vector<std::vector<std::optional<cv::Vec2d>>> cross(hs.size(), std::vector<std::optional<cv::Vec2d>>(vs.size()));
  for (size_t i = 0; i < hs.size(); i++) {
    for (size_t j = 0; j < vs.size(); j++) cross[i][j] = intersect(hs[i], vs[j]);
  }

  std::vector<Quad> cands;
  for (size_t a = 0; a < vs.size(); a++) {
    for (size_t b = a + 1; b < vs.size(); b++) {
      if (std::abs(cross2(vs[a].d, vs[b].d)) > PARALLEL || vs[b].c[0] - vs[a].c[0] < 0.15 * mn) continue;
      // the border's top and bottom: lines drawn all the way between these two verticals
      std::vector<size_t> spans;
      for (size_t i = 0; i < hs.size(); i++) {
        if (cross[i][a] && cross[i][b] && inked(hprof[i], (*cross[i][a])[0], (*cross[i][b])[0]) >= SIDE_INK) {
          spans.push_back(i);
        }
      }
      for (size_t n = 0; n < spans.size(); n++) {
        const size_t i = spans[n];
        for (size_t m = n + 1; m < spans.size(); m++) {
          const size_t j = spans[m];
          if (std::abs(cross2(hs[i].d, hs[j].d)) > PARALLEL || hs[j].c[1] - hs[i].c[1] < 0.15 * mn) continue;
          const cv::Vec2d ia = *cross[i][a], ib = *cross[i][b], ja = *cross[j][a], jb = *cross[j][b];
          if (inked(vprof[a], ia[1], ja[1]) < SIDE_INK || inked(vprof[b], ib[1], jb[1]) < SIDE_INK) continue;
          // an outer border's lines stop at its corners; a cell's or block's sides run on past them
          if (!(ends(hthin[i], ia[0], ib[0]) && ends(hthin[j], ja[0], jb[0]) && ends(vthin[a], ia[1], ja[1]) &&
                ends(vthin[b], ib[1], jb[1]))) {
            continue;
          }
          const Quad quad = {cv::Point2f(static_cast<float>(ia[0]), static_cast<float>(ia[1])),
                             cv::Point2f(static_cast<float>(ib[0]), static_cast<float>(ib[1])),
                             cv::Point2f(static_cast<float>(jb[0]), static_cast<float>(jb[1])),
                             cv::Point2f(static_cast<float>(ja[0]), static_cast<float>(ja[1]))};
          const float xlo = static_cast<float>(-0.02 * w), xhi = static_cast<float>(1.02 * w);
          const float ylo = static_cast<float>(-0.02 * h), yhi = static_cast<float>(1.02 * h);
          bool outside = false;
          for (const auto& p : quad) outside = outside || p.x < xlo || p.x > xhi || p.y < ylo || p.y > yhi;
          if (outside) continue;
          const double area = cv::contourArea(std::vector<cv::Point2f>(quad.begin(), quad.end()));
          if (!convex(quad) || area < 0.06 * h * w) continue;
          const float wq = (normF(quad[0] - quad[1]) + normF(quad[3] - quad[2])) / 2;
          const float hq = (normF(quad[0] - quad[3]) + normF(quad[1] - quad[2])) / 2;
          for (int rot = 0; rot < 4; rot++) {  // the photo may be turned: try each corner as top-left
            const float ar = rot % 2 == 0 ? wq / hq : hq / wq;
            if (std::abs(ar - aspect_) / aspect_ > 0.3f) continue;
            Quad rolled;
            for (int k = 0; k < 4; k++) rolled[k] = quad[(k + rot) % 4];  // np.roll(quad, -rot, axis=0)
            cands.push_back(rolled);
          }
        }
      }
    }
  }
  if (cands.empty()) return std::nullopt;

  std::vector<std::pair<double, Quad>> quick;
  for (const auto& q : cands) quick.emplace_back(score(q, near, th, 3), q);
  std::stable_sort(quick.begin(), quick.end(), [](const auto& a, const auto& b) { return a.first > b.first; });
  double best = 0;
  Quad bestQuad{};
  for (size_t k = 0; k < std::min(FINALISTS, quick.size()); k++) {
    const double sc = score(quick[k].second, near, th, 1);
    if (k == 0 || sc > best) {
      best = sc;
      bestQuad = quick[k].second;
    }
  }
  if (best < MIN_SCORE) return std::nullopt;

  Quad corners;
  const float sf = static_cast<float>(s);
  for (int k = 0; k < 4; k++) corners[k] = cv::Point2f(bestQuad[k].x / sf, bestQuad[k].y / sf);
  if (refit) corners = refine(gray, corners);
  const cv::Mat H = cv::getPerspectiveTransform(corners.data(), dst_.data());
  return FrameFound{cv::Matx33d(H), best, corners};
}

}  // namespace mbm
