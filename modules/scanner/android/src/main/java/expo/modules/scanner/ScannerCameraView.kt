package expo.modules.scanner

import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The scanner camera: the back camera's preview fitted in a 3:4 box on black, the sheet's live outline over it, and
 * the photo, taken by itself (AutoCapture) or by takePhoto(). A port of the test app's CameraActivity.java with
 * CameraX instead of Camera2. TypeScript gets onReady, onStatus (only when it changes), onPhoto and onCameraError.
 * After each photo the camera stays bound and looks again; Auto takes the next sheet once the last has left the frame.
 *
 * In debuggable builds, testImage (a file:// photo) stands in for the camera, checked every 250 ms after 400 ms, the
 * way the test app's camera:asset: mode works; capturing copies it. Debuggable builds also log the form checks of each
 * second (CheckRate) to logcat as MbsCheckRate, figures only.
 */
class ScannerCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onReady by EventDispatcher()
  private val onStatus by EventDispatcher<Map<String, Any?>>()  // form: null when no form is in view
  private val onPhoto by EventDispatcher()
  private val onCameraError by EventDispatcher()

  private val box = FrameLayout(context)  // the 3:4 picture
  private val preview = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FIT_CENTER
  }
  private val still = ImageView(context).apply {
    scaleType = ImageView.ScaleType.FIT_CENTER
    visibility = View.GONE
  }
  private val overlay = ScanOverlayView(context)
  private val analysis = Executors.newSingleThreadExecutor { Thread(it, "scanner-camera").apply { isDaemon = true } }
  private val main = Handler(Looper.getMainLooper())
  private val debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
  private val auto = AutoCapture()
  private val rate = CheckRate()  // used on the analysis thread only

  // props (applied together in applyProps, after each update)
  private var active = false
  @Volatile private var autoMode = true
  private var torch = false
  private var testImage: String? = null

  // the running camera, or the test image standing in for it
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var capture: ImageCapture? = null
  private var testFrame: ByteBuffer? = null
  private var testSource: File? = null
  private val running = AtomicBoolean(false)
  @Volatile private var capturing = false
  private var lastStatus: Pair<CameraStatus, String?>? = null

  init {
    setBackgroundColor(Color.BLACK)
    box.addView(preview, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    box.addView(still, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    box.addView(overlay, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    addView(box)
  }

  fun setActive(value: Boolean) {
    if (value && !active) {  // back from reading (or a failed read): look again
      synchronized(auto) { auto.reset() }
      capturing = false
      lastStatus = null
    }
    active = value
  }

  fun setAuto(value: Boolean) {
    autoMode = value
  }

  fun setTorch(value: Boolean) {
    torch = value
  }

  fun setTestImage(value: String?) {
    if (value != testImage) stop()
    testImage = value
  }

  /** Called once the props of an update are all set. */
  fun applyProps() {
    if (!active || !isAttachedToWindow) {
      stop()
      return
    }
    if (debuggable && testImage != null) startTest() else startCamera()
    camera?.cameraControl?.enableTorch(torch)
  }

  /** The view is gone for good. */
  fun release() {
    stop()
    analysis.shutdown()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    applyProps()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  // The 3:4 box, as big as fits, centred (CameraActivity.java:150-164).
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val w = r - l
    val h = b - t
    val bw: Int
    val bh: Int
    if (w * 4 <= h * 3) {
      bw = w
      bh = w * 4 / 3
    } else {
      bh = h
      bw = h * 3 / 4
    }
    val x = (w - bw) / 2
    val y = (h - bh) / 2
    box.measure(MeasureSpec.makeMeasureSpec(bw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(bh, MeasureSpec.EXACTLY))
    box.layout(x, y, x + bw, y + bh)
  }

  private fun startCamera() {
    if (!running.compareAndSet(false, true)) return
    preview.visibility = View.VISIBLE
    still.visibility = View.GONE
    val owner = appContext.currentActivity as? LifecycleOwner
    if (owner == null) {
      running.set(false)
      emitError("start", "There's no screen to show the camera on.")
      return
    }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!running.get()) return@addListener  // stopped while the camera was starting
      try {
        val p = future.get()
        if (!p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
          running.set(false)
          emitError("no_camera", "")
          return@addListener
        }
        fun selector(w: Int, h: Int) = ResolutionSelector.Builder()
          .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
          .setResolutionStrategy(ResolutionStrategy(Size(w, h), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
          .build()
        val previewUse = Preview.Builder().setResolutionSelector(selector(1440, 1080)).build()
        previewUse.setSurfaceProvider(preview.surfaceProvider)
        val analysisUse = ImageAnalysis.Builder()
          .setResolutionSelector(selector(1280, 960))
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)  // frames are skipped while one is checked
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
          .build()
        analysisUse.setAnalyzer(analysis) { analyze(it) }
        val captureUse = ImageCapture.Builder()
          .setResolutionSelector(selector(4032, 3024))
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
          .setJpegQuality(92)
          .build()
        p.unbindAll()
        val cam = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, previewUse, analysisUse, captureUse)
        provider = p
        camera = cam
        capture = captureUse
        cam.cameraControl.enableTorch(torch)
        onReady(mapOf("hasTorch" to cam.cameraInfo.hasFlashUnit()))
      } catch (e: Exception) {
        running.set(false)
        emitError("start", e.message ?: "")
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun stop() {
    running.set(false)
    provider?.unbindAll()
    provider = null
    camera = null
    capture = null
    testFrame = null
    testSource = null
    main.removeCallbacksAndMessages(null)
    synchronized(auto) { auto.reset() }
    capturing = false
    lastStatus = null
    overlay.show(null, 1, 1, 0f)
  }

  /** One camera frame: the Y plane, checked by the core, then AutoCapture. */
  private fun analyze(image: ImageProxy) {
    try {
      if (capturing || !running.get()) return
      val plane = image.planes[0]
      val rotation = image.imageInfo.rotationDegrees
      val upright = rotation % 180 == 0
      val fw = if (upright) image.width else image.height
      val fh = if (upright) image.height else image.width
      val found = scannerModule()?.detectFrame(plane.buffer, image.width, image.height, plane.rowStride, rotation)
      countCheck()
      onDetection(found?.let(::detectionOf), fw, fh)
    } catch (e: Exception) {
      // a frame that couldn't be checked is skipped, like a frame dropped while another was checked
    } finally {
      image.close()
    }
  }

  /**
   * Debug builds: counts one form check (on the analysis thread), and logs each window's checks, its length in ms and
   * whether a photo or PDF read ran in it. Figures only.
   */
  private fun countCheck() {
    if (!debuggable) return
    rate.onCheck(SystemClock.uptimeMillis(), scannerModule()?.reading() == true)
      ?.let { (checks, elapsedMs, reading) -> Log.d("MbsCheckRate", "checks=$checks ms=$elapsedMs reading=$reading") }
  }

  private fun onDetection(d: Detection?, fw: Int, fh: Int) {
    val step = synchronized(auto) { auto.onFrame(d, fw, SystemClock.uptimeMillis(), autoMode) }
    main.post {
      if (!running.get()) return@post
      overlay.show(d?.outline, fw, fh, step.held)
      setStatus(step.status, d?.form)
      if (step.capture) takePhoto()
    }
  }

  private fun setStatus(status: CameraStatus, form: String?) {
    val key = status to form
    if (key == lastStatus) return
    lastStatus = key
    val name = if (status == CameraStatus.CAPTURE) "capturing" else status.name.lowercase()
    onStatus(mapOf("status" to name, "form" to form))
  }

  /** Takes the photo now (the shutter, or AutoCapture), even with no form in view. */
  fun takePhoto() {
    main.post {
      if (capturing || !running.get()) return@post
      capturing = true
      setStatus(CameraStatus.CAPTURE, lastStatus?.second)
      val dir = File(context.cacheDir, CAPTURE_DIR).apply { mkdirs() }
      val file = File(dir, "capture_${System.currentTimeMillis()}.jpg")
      val source = testSource
      if (source != null) {
        try {
          source.copyTo(file, overwrite = true)
          sendPhoto(file)
        } catch (e: Exception) {
          failed("keep", e.message)
        }
        return@post
      }
      val use = capture ?: return@post failed("capture", "the camera isn't ready")
      use.takePicture(
        ImageCapture.OutputFileOptions.Builder(file).build(),
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
          override fun onImageSaved(output: ImageCapture.OutputFileResults) {
            if (!running.get()) {  // the camera stopped (the screen was left) while the photo was saved: nobody reads it
              file.delete()
              return
            }
            sendPhoto(file)  // EXIF holds the turn; the core applies it
          }

          override fun onError(e: ImageCaptureException) {
            failed(if (e.imageCaptureError == ImageCapture.ERROR_FILE_IO) "keep" else "capture", e.message)
          }
        },
      )
    }
  }

  /** Hands the photo to TypeScript, then looks again: the camera stays bound, and Auto waits for the sheet to leave. */
  private fun sendPhoto(file: File) {
    onPhoto(mapOf("uri" to Uri.fromFile(file).toString()))
    synchronized(auto) { auto.photoTaken() }
    capturing = false
    lastStatus = null
  }

  private fun failed(code: String, message: String?) {
    onCameraError(mapOf("code" to code, "message" to (message ?: "")))
    synchronized(auto) { auto.reset() }
    capturing = false
    lastStatus = null
  }

  private fun emitError(code: String, message: String) {
    main.post { onCameraError(mapOf("code" to code, "message" to message)) }
  }

  private fun scannerModule(): ScannerModule? = appContext.registry.getModule<ScannerModule>()

  // ---- the test image (debuggable builds only)

  private fun startTest() {
    if (!running.compareAndSet(false, true)) return
    val path = testImage?.let { Uri.parse(it).path }
    val bitmap = path?.let { BitmapFactory.decodeFile(it) }
    if (bitmap == null) {
      running.set(false)
      emitError("start", "The test image can't be opened.")
      return
    }
    testSource = File(path)
    preview.visibility = View.GONE
    still.visibility = View.VISIBLE
    still.setImageBitmap(bitmap)
    val frame = greyFrame(bitmap)
    testFrame = frame
    onReady(mapOf("hasTorch" to false))
    main.postDelayed(object : Runnable {
      override fun run() {
        if (!running.get() || testFrame !== frame) return
        analysis.execute {
          if (capturing || !running.get()) return@execute
          try {
            val found = scannerModule()?.detectFrame(frame, TEST_W, TEST_H, TEST_W, 0)
            countCheck()
            onDetection(found?.let(::detectionOf), TEST_W, TEST_H)
          } catch (e: Exception) {
            // skipped, like a camera frame
          }
        }
        main.postDelayed(this, 250)
      }
    }, 400)
  }

  /** The photo fitted (kept in shape) and centred on a 960 x 1280 grey frame, as its luminance (a camera's Y plane). */
  private fun greyFrame(photo: Bitmap): ByteBuffer {
    val canvasBitmap = Bitmap.createBitmap(TEST_W, TEST_H, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(canvasBitmap)
    canvas.drawColor(Color.rgb(128, 128, 128))
    val s = minOf(TEST_W / photo.width.toFloat(), TEST_H / photo.height.toFloat())
    val w = (photo.width * s).toInt()
    val h = (photo.height * s).toInt()
    val x = (TEST_W - w) / 2
    val y = (TEST_H - h) / 2
    canvas.drawBitmap(photo, null, Rect(x, y, x + w, y + h), Paint(Paint.FILTER_BITMAP_FLAG))
    val pixels = IntArray(TEST_W * TEST_H)
    canvasBitmap.getPixels(pixels, 0, TEST_W, 0, 0, TEST_W, TEST_H)
    canvasBitmap.recycle()
    val out = ByteBuffer.allocateDirect(TEST_W * TEST_H)
    for (p in pixels) {
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      out.put(((77 * r + 150 * g + 29 * b) shr 8).toByte())
    }
    out.rewind()
    return out
  }

  private companion object {
    const val TEST_W = 960
    const val TEST_H = 1280
  }
}
