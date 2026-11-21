// Reading box crops with PP-OCRv6 small (Latin cut) on ONNX Runtime: a port of TextRecognizer
// (prototype/benchmark/ocr_engine.py, the arbiter) by way of OcrEngine.recognize/decode in the Android test app.
#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include <opencv2/core.hpp>

namespace mbm {

struct Reading {
  std::string text;
  float conf = 0;                 // the mean confidence of the kept characters
  std::vector<std::string> alts;  // backup readings (one unsure character swapped), most likely first
};

// 3 backup readings for amount, number and date boxes; none otherwise.
int altsFor(const std::string& type);

class Recognizer {
 public:
  // onnxModel: inference_latin.onnx; dictText: its characters, one per line (dict.txt).
  Recognizer(const std::vector<uint8_t>& onnxModel, const std::string& dictText, int threads);
  ~Recognizer();
  Recognizer(const Recognizer&) = delete;
  Recognizer& operator=(const Recognizer&) = delete;

  // Reads BGR crops, limited to the characters a box of this type allows: printed_digits, date, tin, amount,
  // number, text, digits or code. Results are in the crops' order.
  std::vector<Reading> recognize(const std::vector<cv::Mat>& bgrCrops, const std::string& type, int nAlts);

  // "<blank>" + the dictionary + " ".
  size_t charCount() const { return chars_.size(); }

 private:
  struct Session;
  std::unique_ptr<Session> session_;
  std::vector<std::string> chars_;
  std::map<std::string, std::vector<int>> columns_;  // per type: blank first, then the allowed characters' columns

  Reading decode(const float* probs, int steps, int classes, const std::vector<int>& cols, int nAlts) const;
};

}  // namespace mbm
