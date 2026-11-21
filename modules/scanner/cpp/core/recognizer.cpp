#include "core/recognizer.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <set>
#include <stdexcept>
#include <utility>

#include <onnxruntime_cxx_api.h>
#include <opencv2/imgproc.hpp>

namespace mbm {

namespace {

constexpr int kBatch = 8;
constexpr int kHeight = 48;

Ort::Env& env() {
  static Ort::Env e(ORT_LOGGING_LEVEL_ERROR, "mbm-scanner");
  return e;
}

// Each box type's characters, as UTF-8 characters (pipelines.py's CHARSETS).
std::map<std::string, std::vector<std::string>> charsets() {
  auto chars = [](const std::string& s) {
    std::vector<std::string> out;
    for (char c : s) out.emplace_back(1, c);
    return out;
  };
  auto join = [](std::vector<std::string> a, const std::vector<std::string>& b) {
    a.insert(a.end(), b.begin(), b.end());
    return a;
  };
  const auto digits = chars("0123456789");
  const auto capitals = chars("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const auto letters = chars("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");
  std::vector<std::string> ascii;
  for (int c = 32; c < 127; c++) ascii.emplace_back(1, static_cast<char>(c));
  for (const char* c : {"\xC3\x91", "\xC3\xB1", "\xC3\x89", "\xC3\xA9"}) ascii.emplace_back(c);  // Ñ ñ É é
  return {
      {"printed_digits", digits},
      {"date", join(join(digits, chars("/-., ")), letters)},
      {"date_digits", join(digits, chars("/-., "))},  // a Service Invoice's date, read again without letters
      {"tin", join(digits, chars("-"))},
      {"amount", join(digits, chars(",.P"))},  // P: the peso sign people write before amounts ("P1,500.00")
      {"number", join(digits, chars(",./ "))},  // / and space: quantities like 1/2 and 1 1/2
      {"text", ascii},
      {"digits", digits},             // the BIR 2307's period and ZIP codes (no Python reference: the 2307 is new)
      {"code", join(capitals, digits)},  // its ATC codes: WC158, WI010
  };
}

}  // namespace

int altsFor(const std::string& type) { return type == "amount" || type == "number" || type == "date" ? 3 : 0; }

struct Recognizer::Session {
  Ort::Session session;
  std::string input, output;

  Session(const std::vector<uint8_t>& model, int threads) : session(nullptr) {
    Ort::SessionOptions so;
    so.SetIntraOpNumThreads(threads);
    so.SetInterOpNumThreads(1);
    so.SetExecutionMode(ExecutionMode::ORT_SEQUENTIAL);
    so.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    so.EnableCpuMemArena();
    session = Ort::Session(env(), model.data(), model.size(), so);
    Ort::AllocatorWithDefaultOptions alloc;
    input = session.GetInputNameAllocated(0, alloc).get();
    output = session.GetOutputNameAllocated(0, alloc).get();
  }
};

Recognizer::Recognizer(const std::vector<uint8_t>& onnxModel, const std::string& dictText, int threads)
    : session_(std::make_unique<Session>(onnxModel, threads)) {
  chars_.push_back("<blank>");
  size_t start = 0;
  while (start <= dictText.size()) {
    size_t end = dictText.find('\n', start);
    if (end == std::string::npos) end = dictText.size();
    std::string c = dictText.substr(start, end - start);
    c.erase(std::remove(c.begin(), c.end(), '\r'), c.end());
    chars_.push_back(c);
    start = end + 1;
  }
  chars_.push_back(" ");
  std::map<std::string, int> index;  // like the Python dict: a later duplicate wins
  for (int i = 0; i < static_cast<int>(chars_.size()); i++) index[chars_[i]] = i;
  for (const auto& [type, allowed] : charsets()) {
    std::set<int> cols;
    for (const auto& c : allowed) {
      auto it = index.find(c);
      if (it != index.end() && it->second != 0) cols.insert(it->second);
    }
    std::vector<int> v = {0};
    v.insert(v.end(), cols.begin(), cols.end());
    columns_[type] = v;
  }
}

Recognizer::~Recognizer() = default;

std::vector<Reading> Recognizer::recognize(const std::vector<cv::Mat>& bgrCrops, const std::string& type, int nAlts) {
  std::vector<Reading> results(bgrCrops.size());
  if (bgrCrops.empty()) return results;
  auto colsIt = columns_.find(type);
  if (colsIt == columns_.end()) throw std::invalid_argument("unknown box type: " + type);
  const std::vector<int>& cols = colsIt->second;

  const int n = static_cast<int>(bgrCrops.size());
  std::vector<double> ratio(n);
  for (int i = 0; i < n; i++) ratio[i] = bgrCrops[i].cols / static_cast<double>(std::max(1, bgrCrops[i].rows));
  std::vector<int> order(n);
  std::iota(order.begin(), order.end(), 0);
  std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return ratio[a] < ratio[b]; });

  Ort::MemoryInfo memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
  const char* inNames[] = {session_->input.c_str()};
  const char* outNames[] = {session_->output.c_str()};
  for (int s = 0; s < n; s += kBatch) {
    const int m = std::min(kBatch, n - s);
    double maxRatio = 320.0 / 48.0;
    for (int k = 0; k < m; k++) maxRatio = std::max(maxRatio, ratio[order[s + k]]);
    const int imgW = static_cast<int>(kHeight * maxRatio);
    std::vector<float> x(static_cast<size_t>(m) * 3 * kHeight * imgW, 0.0f);
    for (int k = 0; k < m; k++) {
      const int i = order[s + k];
      const int rw = std::min(imgW, static_cast<int>(std::ceil(kHeight * ratio[i])));
      cv::Mat r;
      cv::resize(bgrCrops[i], r, cv::Size(std::max(1, rw), kHeight));
      for (int y = 0; y < kHeight; y++) {
        const cv::Vec3b* row = r.ptr<cv::Vec3b>(y);
        for (int xx = 0; xx < r.cols; xx++) {
          for (int ch = 0; ch < 3; ch++) {
            // (v / 255 - 0.5) / 0.5, in double then stored as float, like the Python
            const double v = (row[xx][ch] / 255.0 - 0.5) / 0.5;
            x[((static_cast<size_t>(k) * 3 + ch) * kHeight + y) * imgW + xx] = static_cast<float>(v);
          }
        }
      }
    }
    const int64_t shape[] = {m, 3, kHeight, imgW};
    Ort::Value input = Ort::Value::CreateTensor<float>(memory, x.data(), x.size(), shape, 4);
    auto outputs = session_->session.Run(Ort::RunOptions{nullptr}, inNames, &input, 1, outNames, 1);
    const auto outShape = outputs[0].GetTensorTypeAndShapeInfo().GetShape();  // [m, steps, classes]
    const int steps = static_cast<int>(outShape[1]), classes = static_cast<int>(outShape[2]);
    const float* probs = outputs[0].GetTensorData<float>();
    for (int k = 0; k < m; k++) {
      results[order[s + k]] = decode(probs + static_cast<size_t>(k) * steps * classes, steps, classes, cols, nAlts);
    }
  }
  return results;
}

// Greedy CTC decoding limited to the box's characters, with the mean confidence of the kept characters. With
// nAlts > 0, also the backup readings: the 3 least sure characters each swapped for their runner-up (if that has a
// 2% chance or more), ranked by the swap's probability over the character's (TextRecognizer._decode).
Reading Recognizer::decode(const float* probs, int steps, int classes, const std::vector<int>& cols, int nAlts) const {
  std::vector<std::string> text;
  std::vector<double> confs;
  std::vector<std::pair<std::string, double>> runnerUp;
  int prev = 0;
  for (int t = 0; t < steps; t++) {
    const float* row = probs + static_cast<size_t>(t) * classes;
    int best = 0;
    float bestP = row[cols[0]];
    for (int j = 1; j < static_cast<int>(cols.size()); j++) {
      if (row[cols[j]] > bestP) {  // the first maximum wins, like numpy's argmax
        bestP = row[cols[j]];
        best = j;
      }
    }
    if (best != 0 && best != prev) {
      text.push_back(chars_[cols[best]]);
      confs.push_back(bestP);
      if (nAlts > 0) {
        // the Python zeroes the best and the blank, then takes the first maximum of the row
        int second = 0;
        float secondP = 0.0f;
        for (int j = 1; j < static_cast<int>(cols.size()); j++) {
          const float p = j == best ? 0.0f : row[cols[j]];
          if (p > secondP) {
            secondP = p;
            second = j;
          }
        }
        runnerUp.emplace_back(chars_[cols[second]], secondP);
      }
    }
    prev = best;
  }

  Reading out;
  for (const auto& c : text) out.text += c;
  if (!confs.empty()) out.conf = static_cast<float>(std::accumulate(confs.begin(), confs.end(), 0.0) / confs.size());
  if (nAlts == 0 || text.empty()) return out;

  std::vector<int> byConf(text.size());
  std::iota(byConf.begin(), byConf.end(), 0);
  std::stable_sort(byConf.begin(), byConf.end(), [&](int a, int b) { return confs[a] < confs[b]; });
  std::vector<std::pair<std::string, double>> candidates;  // (reading, score)
  for (size_t r = 0; r < std::min<size_t>(3, byConf.size()); r++) {
    const int j = byConf[r];
    const auto& [c2, p2] = runnerUp[j];
    if (p2 > 0.02 && c2 != "<blank>") {
      std::string swapped;
      for (size_t q = 0; q < text.size(); q++) swapped += static_cast<int>(q) == j ? c2 : text[q];
      candidates.emplace_back(swapped, p2 / std::max(confs[j], 1e-6));
    }
  }
  std::stable_sort(candidates.begin(), candidates.end(), [](const auto& a, const auto& b) { return a.second > b.second; });
  for (size_t k = 0; k < std::min<size_t>(nAlts, candidates.size()); k++) out.alts.push_back(candidates[k].first);
  return out;
}

}  // namespace mbm
