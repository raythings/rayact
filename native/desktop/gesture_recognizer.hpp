#pragma once

#include <raylib.h>

namespace rayact {

enum class GestureType {
  None,
  Tap,
  LongPress,
  Pan,
  Pinch,
  Fling,
};

struct GestureEvent {
  GestureType type = GestureType::None;
  Vector2 origin = {0, 0};
  Vector2 translation = {0, 0};
  float scale = 1.0f;
  float velocityY = 0.0f;
  bool recognized = false;
};

class GestureRecognizer {
public:
  void beginFrame();
  void onPointerDown(Vector2 point);
  void onPointerMove(Vector2 point);
  void onPointerUp(Vector2 point);
  const GestureEvent &lastEvent() const { return last_; }

private:
  bool down_ = false;
  Vector2 downPoint_ = {0, 0};
  Vector2 lastPoint_ = {0, 0};
  double downTime_ = 0.0;
  GestureEvent last_{};
};

GestureRecognizer &gestureRecognizer();

} // namespace rayact
