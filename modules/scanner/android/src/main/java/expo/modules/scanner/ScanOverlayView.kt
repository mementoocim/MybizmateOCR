package expo.modules.scanner

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View

/**
 * Over the live camera: the sheet the scanner found, as a soft coral fill, a coral outline and corner dots, bolder as
 * the sheet holds still (the test app's ScanOverlay.java).
 */
internal class ScanOverlayView(context: Context) : View(context) {
  private val coral = Color.parseColor("#FC7C4C")
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = coral
    style = Paint.Style.FILL
  }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = coral
    style = Paint.Style.STROKE
    strokeJoin = Paint.Join.ROUND
  }
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    style = Paint.Style.FILL
  }
  private val path = Path()
  private var outline: FloatArray? = null  // tl, tr, br, bl as x, y in the frame's pixels
  private var frameW = 1
  private var frameH = 1
  private var held = 0f

  /** outline in a frameW x frameH frame, drawn scaled onto this view; null clears it. held: 0..1. */
  fun show(outline: FloatArray?, frameW: Int, frameH: Int, held: Float) {
    this.outline = outline
    this.frameW = frameW
    this.frameH = frameH
    this.held = held
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val pts = outline ?: return
    val d = resources.displayMetrics.density
    val sx = width / frameW.toFloat()
    val sy = height / frameH.toFloat()
    path.reset()
    path.moveTo(pts[0] * sx, pts[1] * sy)
    for (k in 1 until 4) path.lineTo(pts[2 * k] * sx, pts[2 * k + 1] * sy)
    path.close()
    fill.alpha = (40 + 50 * held).toInt()
    stroke.strokeWidth = d * (2.5f + 2f * held)
    canvas.drawPath(path, fill)
    canvas.drawPath(path, stroke)
    for (k in 0 until 4) {
      canvas.drawCircle(pts[2 * k] * sx, pts[2 * k + 1] * sy, d * 7, stroke)
      canvas.drawCircle(pts[2 * k] * sx, pts[2 * k + 1] * sy, d * 5, dot)
    }
  }
}
