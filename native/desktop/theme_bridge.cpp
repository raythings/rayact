#include "theme_bridge.hpp"
#include "raym3_bridge.hpp"

#include <raym3/styles/Theme.h>
#include <raym3/styles/ColorScheme.h>
#include <raylib.h>

#include <cstdio>
#include <cstring>

static double packColor(Color c) {
    uint32_t packed = ((uint32_t)c.r << 24) | ((uint32_t)c.g << 16) |
                      ((uint32_t)c.b << 8) | (uint32_t)c.a;
    return (double)packed;
}

static void setColorProp(JSContext* ctx, JSValue obj, const char* key, Color c) {
    JS_SetPropertyStr(ctx, obj, key, JS_NewFloat64(ctx, packColor(c)));
}

static JSValue buildColorSchemeObject(JSContext* ctx) {
    const auto& s = raym3::Theme::GetColorScheme();
    JSValue obj = JS_NewObject(ctx);

    setColorProp(ctx, obj, "primary", s.primary);
    setColorProp(ctx, obj, "onPrimary", s.onPrimary);
    setColorProp(ctx, obj, "primaryContainer", s.primaryContainer);
    setColorProp(ctx, obj, "onPrimaryContainer", s.onPrimaryContainer);
    setColorProp(ctx, obj, "secondary", s.secondary);
    setColorProp(ctx, obj, "onSecondary", s.onSecondary);
    setColorProp(ctx, obj, "secondaryContainer", s.secondaryContainer);
    setColorProp(ctx, obj, "onSecondaryContainer", s.onSecondaryContainer);
    setColorProp(ctx, obj, "tertiary", s.tertiary);
    setColorProp(ctx, obj, "onTertiary", s.onTertiary);
    setColorProp(ctx, obj, "tertiaryContainer", s.tertiaryContainer);
    setColorProp(ctx, obj, "onTertiaryContainer", s.onTertiaryContainer);
    setColorProp(ctx, obj, "error", s.error);
    setColorProp(ctx, obj, "onError", s.onError);
    setColorProp(ctx, obj, "errorContainer", s.errorContainer);
    setColorProp(ctx, obj, "onErrorContainer", s.onErrorContainer);
    setColorProp(ctx, obj, "surface", s.surface);
    setColorProp(ctx, obj, "onSurface", s.onSurface);
    setColorProp(ctx, obj, "surfaceVariant", s.surfaceVariant);
    setColorProp(ctx, obj, "onSurfaceVariant", s.onSurfaceVariant);
    setColorProp(ctx, obj, "surfaceContainerLowest", s.surfaceContainerLowest);
    setColorProp(ctx, obj, "surfaceContainerLow", s.surfaceContainerLow);
    setColorProp(ctx, obj, "surfaceContainer", s.surfaceContainer);
    setColorProp(ctx, obj, "surfaceContainerHigh", s.surfaceContainerHigh);
    setColorProp(ctx, obj, "surfaceContainerHighest", s.surfaceContainerHighest);
    setColorProp(ctx, obj, "outline", s.outline);
    setColorProp(ctx, obj, "outlineVariant", s.outlineVariant);
    setColorProp(ctx, obj, "shadow", s.shadow);
    setColorProp(ctx, obj, "scrim", s.scrim);
    setColorProp(ctx, obj, "inverseSurface", s.inverseSurface);
    setColorProp(ctx, obj, "inverseOnSurface", s.inverseOnSurface);
    setColorProp(ctx, obj, "inversePrimary", s.inversePrimary);
    JS_SetPropertyStr(ctx, obj, "isDark", JS_NewBool(ctx, raym3::Theme::IsDarkMode()));

    return obj;
}

void notifyColorSchemeChange(JSContext* ctx, bool isDark) {
    refreshStylesForColorScheme(ctx);

    JSValue global = JS_GetGlobalObject(ctx);
    JSValue cb = JS_GetPropertyStr(ctx, global, "onColorSchemeChange");
    JS_FreeValue(ctx, global);

    if (!JS_IsFunction(ctx, cb)) {
        JS_FreeValue(ctx, cb);
        return;
    }

    JSValue arg = JS_NewBool(ctx, isDark);
    JSValue result = JS_Call(ctx, cb, JS_UNDEFINED, 1, &arg);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "[theme] onColorSchemeChange error: %s\n", s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);
    JS_FreeValue(ctx, arg);
    JS_FreeValue(ctx, cb);
}

static JSValue JS_getColorScheme(JSContext* ctx, JSValue, int, JSValueConst*) {
    return buildColorSchemeObject(ctx);
}

static JSValue JS_setColorScheme(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx, "Expected mode string: 'dark', 'light', or 'system'");

    const char* mode = JS_ToCString(ctx, argv[0]);
    if (!mode) return JS_EXCEPTION;

    bool isSystem = (strcmp(mode, "system") == 0);
    bool dark = (strcmp(mode, "dark") == 0);
    bool light = (strcmp(mode, "light") == 0);
    JS_FreeCString(ctx, mode);
    if (!isSystem && !dark && !light)
        return JS_ThrowTypeError(ctx, "Mode must be 'dark', 'light', or 'system'");

    if (isSystem) {
        raym3::Theme::SetColorSchemePreference(raym3::ColorSchemePreference::System);
    } else {
        raym3::Theme::SetColorSchemePreference(dark ? raym3::ColorSchemePreference::Dark
                                                    : raym3::ColorSchemePreference::Light);
    }

    if (argc >= 2 && !JS_IsUndefined(argv[1])) {
        uint32_t seed;
        if (JS_ToUint32(ctx, &seed, argv[1]) == 0) {
            Color seedColor = {
                (unsigned char)((seed >> 24) & 0xFF),
                (unsigned char)((seed >> 16) & 0xFF),
                (unsigned char)((seed >> 8) & 0xFF),
                (unsigned char)(seed & 0xFF)
            };
            raym3::Theme::GetColorScheme() = raym3::ColorScheme::FromSeed(
                seedColor, raym3::Theme::IsDarkMode());
        }
    }

    notifyColorSchemeChange(ctx, raym3::Theme::IsDarkMode());
    return JS_UNDEFINED;
}

void registerThemeBindings(JSContext* ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "__rayactGetColorScheme",
        JS_NewCFunction(ctx, JS_getColorScheme, "__rayactGetColorScheme", 0));
    JS_SetPropertyStr(ctx, global, "__rayactSetColorScheme",
        JS_NewCFunction(ctx, JS_setColorScheme, "__rayactSetColorScheme", 2));
    JS_FreeValue(ctx, global);
}
