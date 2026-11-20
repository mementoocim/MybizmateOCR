// Sums as numpy computes them, so values the Python rounds or compares come out the same bit for bit.
#pragma once

#include <cstddef>
#include <vector>

namespace mbm {

// numpy's sum of a 1-D float64 array (add.reduce: pairwise_sum, 8 accumulators in blocks of up to 128). Checked
// against numpy 2.5 on 4,000 random arrays. (An axis-0 sum of a 2-D array is plain left-to-right instead.)
inline double npSum(const double* a, size_t n) {
  if (n < 8) {
    double r = 0;
    for (size_t i = 0; i < n; i++) r += a[i];
    return r;
  }
  if (n <= 128) {
    double r[8];
    for (int k = 0; k < 8; k++) r[k] = a[k];
    size_t i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (int k = 0; k < 8; k++) r[k] += a[i + k];
    }
    double res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[i];
    return res;
  }
  size_t n2 = n / 2;
  n2 -= n2 % 8;
  return npSum(a, n2) + npSum(a + n2, n - n2);
}

inline double npSum(const std::vector<double>& v) { return npSum(v.data(), v.size()); }

}  // namespace mbm
