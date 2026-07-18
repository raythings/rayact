# Release entry points reached from Android and JNI.
-keep class com.rayact.app.ReleaseActivity { *; }
-keepclasseswithmembernames class * { native <methods>; }
