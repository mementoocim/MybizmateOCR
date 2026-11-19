// doctest's main for the core's tests: takes out --assets=DIR and --fixtures=DIR, passes everything else to doctest.
#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest/doctest.h"

#include <cstring>
#include <string>
#include <vector>

#include "fixtures.h"

int main(int argc, char** argv) {
  std::string assets = "assets", fixtures = "fixtures";
  std::vector<char*> rest;
  for (int i = 0; i < argc; i++) {
    if (std::strncmp(argv[i], "--assets=", 9) == 0) {
      assets = argv[i] + 9;
    } else if (std::strncmp(argv[i], "--fixtures=", 11) == 0) {
      fixtures = argv[i] + 11;
    } else {
      rest.push_back(argv[i]);
    }
  }
  setTestDirs(assets, fixtures);
  doctest::Context context;
  context.applyCommandLine(static_cast<int>(rest.size()), rest.data());
  return context.run();
}
