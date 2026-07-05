package com.rayact.engine

interface RayactEngineHostCallbacks {
    fun requestNewSurface(): Int
    fun rootSurfaceId(): Int
    fun topSurfaceId(): Int
    fun releaseTopSurface()
    fun releaseSurface(surfaceId: Int)
    fun orderSurfaces(surfaceIds: IntArray)
    fun finishActivity()
    fun toggleDevMenu()
    fun requestRenderFrame()

    /**
     * Stop this session's render thread synchronously (blocks until it has
     * quit). Called by native code before tearing down the graphics device
     * when another session steals the graphics lease.
     */
    fun stopRenderScheduler()
    fun showSoftKeyboard(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeAction: String
    )
    fun switchIme(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeAction: String
    )
    fun hideSoftKeyboard()
    fun updateImeState(
        nodeId: Int,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int,
        text: String?
    )
    fun copyToClipboard(text: String)
    fun readClipboard(): String
    fun performHapticFeedback()
}
