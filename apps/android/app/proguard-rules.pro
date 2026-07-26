# Release entry points reached from Android and JNI.
-keep class com.rayact.app.ReleaseActivity { *; }
-keepclasseswithmembernames class * { native <methods>; }
# The native engine calls back into these bridge classes via JNI
# (FindClass/GetStaticMethodID) — R8 sees no Java references and would
# otherwise strip them (symptom: per-frame NoSuchMethodError from
# nativeRenderFrame, which also kills touch dispatch in release builds).
-keep class com.rayact.engine.** { *; }
-keep class com.rayact.devclient.** { *; }
