// GIF animation worker
// initialData: { path, delay }  (delay in ms between frames)

var path  = (initialData && initialData.path)  || "../apps/desktop/frog.gif";
var delay = (initialData && initialData.delay) || 80;

var gif  = loadGif(path);
var info = getGifInfo(gif);

postMessage({ type: "ready", width: info.width, height: info.height, frameCount: info.frameCount });

var frame = 0;
while (true) {
    presentGifFrame(gif, frame);
    frame = (frame + 1) % info.frameCount;
    workerSleep(delay);
}
