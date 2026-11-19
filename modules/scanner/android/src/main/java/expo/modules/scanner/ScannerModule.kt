package expo.modules.scanner

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Scanner")

    Function("coreInfo") { NativeScanner.coreInfo() }
  }
}
