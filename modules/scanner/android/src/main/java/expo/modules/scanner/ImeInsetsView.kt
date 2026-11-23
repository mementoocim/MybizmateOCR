package expo.modules.scanner

import android.content.Context
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * The keyboard's height in the window this view is in, for a sheet. A sheet is an RN Modal: a dialog window of its own,
 * edge to edge (so Android doesn't resize it for the keyboard), and RN 0.88 sends its keyboard events only from the
 * activity's window (ReactRootView.java:935-980). So this view reads the IME's inset in its own window.
 *
 * It reports the keyboard's height above the navigation bar, as RN works it out (the IME's bottom inset minus the
 * system bars', which at the bottom is the navigation bar's), never below 0, in dp: onImeChange({ height }) whenever it
 * changes, and on being attached to a window when it isn't 0. Like RN's events for a screen, it reports where the
 * keyboard ends up (the insets Android gives the views), not each frame of its animation, so a sheet moves as a screen
 * does. It's invisible and takes no room: TypeScript gives it no size.
 *
 * It listens on itself only: its own insets listener, which hands the insets on unchanged and goes when the view is
 * detached. No other view's inset handling on the window changes. The modal host forwards the insets to it: the dialog
 * doesn't fit system windows, and neither does any view between its decor and this one. A sheet's Modal is made and
 * destroyed again and again, and the dialog under a view can be made again, so it starts over on every attach.
 */
class ImeInsetsView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onImeChange by EventDispatcher()

  /** The height last sent, in px. */
  private var sent = 0

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      val height = heightOf(insets)
      if (height != sent) send(height)
      insets  // unchanged, for whatever gets them after this view
    }
    // The window's insets now, for a keyboard that's up already; or 0, when the height last sent (to an earlier
    // window) no longer holds. The listener hears every change after this.
    val now = ViewCompat.getRootWindowInsets(this)?.let(::heightOf) ?: 0
    if (now != 0 || sent != 0) send(now)
  }

  override fun onDetachedFromWindow() {
    ViewCompat.setOnApplyWindowInsetsListener(this, null)
    super.onDetachedFromWindow()
  }

  /** The keyboard's height above the navigation bar, in px: 0 while it's hidden (its inset is then 0). */
  private fun heightOf(insets: WindowInsetsCompat): Int {
    val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
    return (ime - bars).coerceAtLeast(0)
  }

  private fun send(height: Int) {
    sent = height
    onImeChange(mapOf("height" to height / resources.displayMetrics.density))
  }
}
