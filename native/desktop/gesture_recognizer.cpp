#include "gesture_recognizer.hpp"

#include <algorithm>
#include <cmath>

namespace rayact {

static GestureRecognizer g_gestures;

GestureRecognizer &gestureRecognizer() { return g_gestures; }

void GestureRecognizer::beginFrame() {
  last_ = {};
}

void GestureRecognizer::onPointerDown(Vector2 point) {
  down_ = true;
  downPoint_ = point;
  lastPoint_ = point;
  downTime_ = GetTime();
}

void GestureRecognizer::onPointerMove(Vector2 point) {
  if (!down_) return;
  lastPoint_ = point;
  Vector2 delta = {point.x - downPoint_.x, point.y - downPoint_.y};
  float dist2 = delta.x * delta.x + delta.y * delta.y;
  if (dist2 > 100.0f) {
    last_.type = GestureType::Pan;
    last_.origin = downPoint_;
    last_.translation = delta;
    last_.recognized = true;
  }
}

void GestureRecognizer::onPointerUp(Vector2 point) {
  if (!down_) return;
  down_ = false;
  double dt = GetTime() - downTime_;
  Vector2 delta = {point.x - downPoint_.x, point.y - downPoint_.y};
  float dist2 = delta.x * delta.x + delta.y * delta.y;
  if (dist2 < 100.0f) {
    if (dt > 0.5) {
      last_.type = GestureType::LongPress;
    } else {
      last_.type = GestureType::Tap;
    }
    last_.origin = downPoint_;
    last_.recognized = true;
  } else if (std::fabs(delta.y) > std::fabs(delta.x)) {
    last_.type = GestureType::Fling;
    last_.velocityY = delta.y / (float)std::max(dt, 0.016);
    last_.recognized = true;
  }
}

} // namespace rayact
