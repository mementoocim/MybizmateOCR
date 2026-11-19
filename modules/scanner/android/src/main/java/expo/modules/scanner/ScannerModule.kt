package expo.modules.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

internal class UnreadablePhotoException :
  CodedException("ERR_UNREADABLE_IMAGE", "This file isn't a photo the scanner can open.", null)

class ScannerModule : Module() {
  private val lock = Any()
  private var handle = 0L

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("The scanner needs the app's context")

  override fun definition() = ModuleDefinition {
    Name("Scanner")

    Function("coreInfo") { NativeScanner.coreInfo() }

    AsyncFunction("preload") {
      scanner()
      Unit
    }

    AsyncFunction("scanPhoto") { uri: String -> scan(uri) }

    OnDestroy {
      synchronized(lock) {
        if (handle != 0L) {
          NativeScanner.destroy(handle)
          handle = 0L
        }
      }
    }
  }

  /** The one scanner, created on first use from the module's assets (assets/scanner). */
  private fun scanner(): Long = synchronized(lock) {
    if (handle == 0L) {
      val assets = context.assets
      fun bytes(name: String) = assets.open("scanner/$name").use { it.readBytes() }
      handle = NativeScanner.create(
        bytes("inference_latin.onnx"),
        String(bytes("dict.txt"), Charsets.UTF_8),
        String(bytes("field_map.json"), Charsets.UTF_8),
        bytes("form_small.png"),
        4,
      )
    }
    handle
  }

  private fun scan(uri: String): String {
    val scans = File(context.cacheDir, "scans")
    val outDir = File(scans, System.currentTimeMillis().toString()).apply { mkdirs() }
    val path = localPath(Uri.parse(uri), outDir)
    val json = try {
      NativeScanner.scanPhoto(scanner(), path, outDir.absolutePath)
    } catch (e: IOException) {
      // OpenCV can't open it (HEIC, for one): let Android decode it, then scan that.
      val bitmap = BitmapFactory.decodeFile(path) ?: throw UnreadablePhotoException()
      val png = File(outDir, "photo.png")
      FileOutputStream(png).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      bitmap.recycle()
      try {
        NativeScanner.scanPhoto(scanner(), png.absolutePath, outDir.absolutePath)
      } catch (again: IOException) {
        throw UnreadablePhotoException()
      }
    }
    keepNewest(scans, 10)
    return json
  }

  /** A file path for the photo: file:// as is, content:// copied into the scan's folder first. */
  private fun localPath(uri: Uri, outDir: File): String = when (uri.scheme) {
    "file", null -> uri.path ?: throw UnreadablePhotoException()
    "content" -> {
      val copy = File(outDir, "input")
      val input = context.contentResolver.openInputStream(uri) ?: throw UnreadablePhotoException()
      input.use { source -> FileOutputStream(copy).use { source.copyTo(it) } }
      copy.absolutePath
    }
    else -> throw UnreadablePhotoException()
  }

  /** Scans live in the cache: keep the newest few folders, delete the rest. */
  private fun keepNewest(dir: File, keep: Int) {
    dir.listFiles()
      ?.filter { it.isDirectory }
      ?.sortedByDescending { it.name.toLongOrNull() ?: 0L }
      ?.drop(keep)
      ?.forEach { it.deleteRecursively() }
  }
}
