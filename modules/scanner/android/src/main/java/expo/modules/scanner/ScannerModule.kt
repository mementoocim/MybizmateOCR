package expo.modules.scanner

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext

internal class UnreadablePhotoException :
  CodedException("ERR_UNREADABLE_IMAGE", "This file isn't a photo the scanner can open.", null)

internal class SaveNeedsAndroid10Exception :
  CodedException("ERR_SAVE_NEEDS_ANDROID_10", "Saving needs Android 10 or newer.", null)

internal class SaveFailedException(cause: Throwable?) :
  CodedException("ERR_SAVE_FAILED", "Couldn't save the scan.", cause)

/** scanPhoto's options: keepFiles writes the scan's images (the page, the original, the crops). */
class ScanOptions : Record {
  @Field val keepFiles: Boolean = true

  /** Delete the photo after reading it: only a file:// inside the app's cache (a camera capture). */
  @Field val deletePhoto: Boolean = false
}

class ScannerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("The scanner needs the app's context")

  /** Scans, the scan view's images and saving run here, one at a time, off Expo's shared queue. */
  private val scanThread = Executors.newSingleThreadExecutor { Thread(it, "scanner") }.asCoroutineDispatcher()

  /** The one scanner, created on first use from the module's assets (assets/scanner). */
  private val scanner = ScannerHolder(
    create = {
      val assets = context.assets
      fun bytes(name: String) = assets.open("scanner/$name").use { it.readBytes() }
      NativeScanner.create(
        bytes("inference_latin.onnx"),
        String(bytes("dict.txt"), Charsets.UTF_8),
        String(bytes("field_map.json"), Charsets.UTF_8),
        bytes("form_small.png"),
        String(bytes("service_invoice.json"), Charsets.UTF_8),
        4,
      )
    },
    destroy = { NativeScanner.destroy(it) },
  )

  override fun definition() = ModuleDefinition {
    Name("Scanner")

    Function("coreInfo") { NativeScanner.coreInfo() }

    AsyncFunction("preload") Coroutine { ->
      withContext(scanThread) { scanner.use { } }
      Unit
    }

    AsyncFunction("scanPhoto") Coroutine { uri: String, options: ScanOptions? ->
      withContext(scanThread) { scan(uri, options ?: ScanOptions()) }
    }

    AsyncFunction("enhance") Coroutine { pageUri: String, mode: String ->
      withContext(scanThread) { enhance(pageUri, mode) }
    }

    AsyncFunction("saveToPictures") Coroutine { fileUri: String ->
      withContext(scanThread) { saveToPictures(fileUri) }
    }

    AsyncFunction("stats") { mapOf("loadMs" to scanner.loadMs, "peakKb" to peakKb()) }

    // Waits for a scan in flight, then frees the native scanner (ScannerHolder).
    OnDestroy {
      scanner.close()
      scanThread.close()
    }
  }

  /** The camera view's check of one frame (see NativeScanner.detectFrame), on the camera's own thread. */
  internal fun detectFrame(y: ByteBuffer, width: Int, height: Int, rowStride: Int, rotation: Int): FloatArray? =
    scanner.use { NativeScanner.detectFrame(it, y, width, height, rowStride, rotation) }

  private fun scan(uri: String, options: ScanOptions): String = scanner.use { handle ->
    val work = File(context.cacheDir, "scan-work").apply {
      deleteRecursively()
      mkdirs()
    }
    val scans = File(context.filesDir, "scans")
    val outDir = if (options.keepFiles) File(scans, System.currentTimeMillis().toString()).apply { mkdirs() } else null
    val out = outDir?.absolutePath ?: ""
    try {
      val path = localPath(Uri.parse(uri), work)
      val json = try {
        NativeScanner.scanPhoto(handle, path, out)
      } catch (e: IOException) {
        // OpenCV can't open it (HEIC, for one): let Android decode it, at most 2400 px on its long side, then scan that.
        val png = decodeWithAndroid(path, work) ?: throw UnreadablePhotoException()
        try {
          NativeScanner.scanPhoto(handle, png.absolutePath, out)
        } catch (again: IOException) {
          throw UnreadablePhotoException()
        }
      }
      if (options.deletePhoto) deletePhoto(uri)
      if (outDir != null) keepNewest(scans, KEEP_SCANS)
      json
    } catch (e: Throwable) {
      outDir?.deleteRecursively()
      throw e
    } finally {
      work.deleteRecursively()  // the copied photo and any decoded PNG: only needed while reading
    }
  }

  /** A file path for the photo: file:// as is, content:// copied into the work folder first. */
  private fun localPath(uri: Uri, work: File): String = when (uri.scheme) {
    "file", null -> uri.path ?: throw UnreadablePhotoException()
    "content" -> {
      val copy = File(work, "input")
      val input = context.contentResolver.openInputStream(uri) ?: throw UnreadablePhotoException()
      input.use { source -> FileOutputStream(copy).use { source.copyTo(it) } }
      copy.absolutePath
    }
    else -> throw UnreadablePhotoException()
  }

  /** The photo decoded by Android (upright, at most 2400 px on its long side on Android 9+) as a PNG, or null. */
  private fun decodeWithAndroid(path: String, work: File): File? {
    val bitmap = try {
      if (Build.VERSION.SDK_INT >= 28) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(File(path))) { decoder, info, _ ->
          val (w, h) = decodeTarget(info.size.width, info.size.height)
          decoder.setTargetSize(w, h)
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
      } else {
        BitmapFactory.decodeFile(path)  // Android 8 can't decode HEIC anyway
      }
    } catch (e: IOException) {
      null
    } ?: return null
    val png = File(work, "photo.png")
    FileOutputStream(png).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    return png
  }

  private fun deletePhoto(uri: String) {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "file") return
    val file = File(parsed.path ?: return)
    if (isInside(file, context.cacheDir)) file.delete()
  }

  /** The scan view's Enhanced or B&W image, made once next to the page and reused after. */
  private fun enhance(pageUri: String, mode: String): String {
    val page = File(Uri.parse(pageUri).path ?: throw IllegalArgumentException("not a file: $pageUri"))
    val (name, code) = when (mode) {
      "enhanced" -> "enhanced.jpg" to 0
      "bw" -> "bw.png" to 1
      else -> throw IllegalArgumentException("no such view: $mode")
    }
    val out = File(page.parentFile, name)
    if (!out.exists()) NativeScanner.enhance(page.absolutePath, code, out.absolutePath)
    return Uri.fromFile(out).toString()
  }

  /** Copies an image into Pictures/MyBizMate Scan (Android 10+; no permission needed). Returns its file name. */
  private fun saveToPictures(fileUri: String): String {
    if (Build.VERSION.SDK_INT < 29) throw SaveNeedsAndroid10Exception()
    val src = File(Uri.parse(fileUri).path ?: throw SaveFailedException(null))
    val png = src.name.endsWith(".png", ignoreCase = true)
    val name = "scan_${System.currentTimeMillis()}.${if (png) "png" else "jpg"}"
    val values = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, name)
      put(MediaStore.Images.Media.MIME_TYPE, if (png) "image/png" else "image/jpeg")
      put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MyBizMate Scan")
      put(MediaStore.Images.Media.IS_PENDING, 1)
    }
    val resolver = context.contentResolver
    val item = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: throw SaveFailedException(null)
    try {
      val sink = resolver.openOutputStream(item) ?: throw IOException("no output stream")
      sink.use { o -> src.inputStream().use { it.copyTo(o) } }
      resolver.update(item, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
      return name
    } catch (e: Exception) {
      resolver.delete(item, null, null)
      throw SaveFailedException(e)
    }
  }

  /** The app's peak memory so far (VmHWM, kB): the speed test's "Peak memory". */
  private fun peakKb(): Long = try {
    File("/proc/self/status").readLines().firstOrNull { it.startsWith("VmHWM:") }
      ?.trim()?.split(Regex("\\s+"))?.getOrNull(1)?.toLong() ?: 0L
  } catch (e: Exception) {
    0L
  }

  /** Recent scans live in the app's files: keep the newest few folders (Recent scans shows 6), delete the rest. */
  private fun keepNewest(dir: File, keep: Int) {
    dir.listFiles()
      ?.filter { it.isDirectory }
      ?.sortedByDescending { it.name.toLongOrNull() ?: 0L }
      ?.drop(keep)
      ?.forEach { it.deleteRecursively() }
  }

  private companion object {
    const val KEEP_SCANS = 6
  }
}
