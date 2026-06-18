#include "mac_text_input.hpp"

#import <AppKit/AppKit.h>

#include <raylib.h>

extern "C" bool rayactMacImeHasFocusedTextInput();
extern "C" void rayactMacImeInsertText(const char *utf8);
extern "C" void rayactMacImeSetMarkedText(const char *utf8, int selectedLocation,
                                           int selectedLength);
extern "C" void rayactMacImeUnmarkText();
extern "C" void rayactMacImeMoveCursorLeft();
extern "C" void rayactMacImeMoveCursorRight();
extern "C" void rayactMacImeMoveCursorHome();
extern "C" void rayactMacImeMoveCursorEnd();
extern "C" void rayactMacImeDeleteBackward();
extern "C" void rayactMacImeDeleteForward();
extern "C" void rayactMacImeSelectAll();
extern "C" bool rayactMacImeCopySelection(char *buffer, int capacity);
extern "C" void rayactMacImeDeleteSelection();
extern "C" void rayactMacImeSelectedRange(int *location, int *length);
extern "C" void rayactMacImeMarkedRange(int *location, int *length);
extern "C" void rayactMacImeCaretRect(float *x, float *y, float *w, float *h);

@interface RayactTextInputClient : NSObject <NSTextInputClient>
@property(nonatomic, strong) NSTextInputContext *inputContext;
@end

@implementation RayactTextInputClient

- (instancetype)init {
  self = [super init];
  if (self) {
    _inputContext = [[NSTextInputContext alloc] initWithClient:self];
  }
  return self;
}

- (void)insertText:(id)string replacementRange:(NSRange)replacementRange {
  (void)replacementRange;
  NSString *s = [string isKindOfClass:[NSAttributedString class]]
                    ? [(NSAttributedString *)string string]
                    : (NSString *)string;
  rayactMacImeInsertText([s UTF8String]);
}

- (void)setMarkedText:(id)string
        selectedRange:(NSRange)selectedRange
     replacementRange:(NSRange)replacementRange {
  (void)replacementRange;
  NSString *s = [string isKindOfClass:[NSAttributedString class]]
                    ? [(NSAttributedString *)string string]
                    : (NSString *)string;
  rayactMacImeSetMarkedText([s UTF8String], (int)selectedRange.location,
                            (int)selectedRange.length);
}

- (void)unmarkText { rayactMacImeUnmarkText(); }

- (NSRange)selectedRange {
  int location = 0;
  int length = 0;
  rayactMacImeSelectedRange(&location, &length);
  return NSMakeRange((NSUInteger)location, (NSUInteger)length);
}

- (NSRange)markedRange {
  int location = -1;
  int length = 0;
  rayactMacImeMarkedRange(&location, &length);
  if (location < 0)
    return NSMakeRange(NSNotFound, 0);
  return NSMakeRange((NSUInteger)location, (NSUInteger)length);
}

- (BOOL)hasMarkedText {
  NSRange range = [self markedRange];
  return range.location != NSNotFound && range.length > 0;
}

- (NSArray<NSAttributedStringKey> *)validAttributesForMarkedText {
  return @[];
}

- (NSAttributedString *)attributedSubstringForProposedRange:(NSRange)range
                                                actualRange:(NSRangePointer)actualRange {
  if (actualRange)
    *actualRange = range;
  return [[NSAttributedString alloc] initWithString:@""];
}

- (NSUInteger)characterIndexForPoint:(NSPoint)point {
  (void)point;
  int location = 0;
  int length = 0;
  rayactMacImeSelectedRange(&location, &length);
  return (NSUInteger)location;
}

- (NSRect)firstRectForCharacterRange:(NSRange)range
                         actualRange:(NSRangePointer)actualRange {
  (void)range;
  if (actualRange)
    *actualRange = range;
  float x = 0, y = 0, w = 1, h = 18;
  rayactMacImeCaretRect(&x, &y, &w, &h);
  NSWindow *window = (__bridge NSWindow *)GetWindowHandle();
  if (!window)
    return NSMakeRect(x, y, w, h);
  NSRect rect = NSMakeRect(x, y, w, h);
  return [window convertRectToScreen:rect];
}

- (void)doCommandBySelector:(SEL)selector {
  if (selector == @selector(moveLeft:)) {
    rayactMacImeMoveCursorLeft();
    return;
  }
  if (selector == @selector(moveLeftAndModifySelection:)) {
    rayactMacImeMoveCursorLeft();
    return;
  }
  if (selector == @selector(moveWordLeft:)) {
    rayactMacImeMoveCursorLeft();
    return;
  }
  if (selector == @selector(moveRight:)) {
    rayactMacImeMoveCursorRight();
    return;
  }
  if (selector == @selector(moveRightAndModifySelection:)) {
    rayactMacImeMoveCursorRight();
    return;
  }
  if (selector == @selector(moveWordRight:)) {
    rayactMacImeMoveCursorRight();
    return;
  }
  if (selector == @selector(moveToBeginningOfLine:)) {
    rayactMacImeMoveCursorHome();
    return;
  }
  if (selector == @selector(moveToLeftEndOfLine:)) {
    rayactMacImeMoveCursorHome();
    return;
  }
  if (selector == @selector(moveToEndOfLine:)) {
    rayactMacImeMoveCursorEnd();
    return;
  }
  if (selector == @selector(moveToBeginningOfParagraph:)) {
    rayactMacImeMoveCursorHome();
    return;
  }
  if (selector == @selector(moveToEndOfParagraph:)) {
    rayactMacImeMoveCursorEnd();
    return;
  }
  if (selector == @selector(moveToBeginningOfDocument:)) {
    rayactMacImeMoveCursorHome();
    return;
  }
  if (selector == @selector(moveToEndOfDocument:)) {
    rayactMacImeMoveCursorEnd();
    return;
  }
  if (selector == @selector(deleteBackward:)) {
    rayactMacImeDeleteBackward();
    return;
  }
  if (selector == @selector(deleteForward:)) {
    rayactMacImeDeleteForward();
    return;
  }
  if (selector == @selector(deleteToBeginningOfLine:)) {
    rayactMacImeDeleteBackward();
    return;
  }
  if (selector == @selector(deleteToEndOfLine:)) {
    rayactMacImeDeleteForward();
    return;
  }
}

@end

static void rayactMacCopySelectionToPasteboard() {
  char buffer[64 * 1024];
  if (!rayactMacImeCopySelection(buffer, (int)sizeof(buffer)))
    return;
  NSString *text = [NSString stringWithUTF8String:buffer];
  if (!text)
    return;
  NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
  [pasteboard clearContents];
  [pasteboard setString:text forType:NSPasteboardTypeString];
}

static void rayactMacPasteFromPasteboard() {
  NSString *text = [[NSPasteboard generalPasteboard] stringForType:NSPasteboardTypeString];
  if (!text || [text length] == 0)
    return;
  rayactMacImeInsertText([text UTF8String]);
}

static BOOL rayactMacHandleShortcutEvent(NSEvent *event) {
  NSEventModifierFlags flags = [event modifierFlags] & NSEventModifierFlagDeviceIndependentFlagsMask;
  BOOL cmd = (flags & NSEventModifierFlagCommand) != 0;
  BOOL ctrl = (flags & NSEventModifierFlagControl) != 0;
  BOOL shortcut = cmd || ctrl;
  NSString *chars = [[event charactersIgnoringModifiers] lowercaseString];
  unichar ch = [chars length] > 0 ? [chars characterAtIndex:0] : 0;

  if (shortcut) {
    switch (ch) {
    case 'a':
      rayactMacImeSelectAll();
      return YES;
    case 'c':
      rayactMacCopySelectionToPasteboard();
      return YES;
    case 'x':
      rayactMacCopySelectionToPasteboard();
      rayactMacImeDeleteSelection();
      return YES;
    case 'v':
      rayactMacPasteFromPasteboard();
      return YES;
    default:
      break;
    }
  }

  switch ([event keyCode]) {
  case 51: // Delete/backspace
    rayactMacImeDeleteBackward();
    return YES;
  case 117: // Forward delete
    rayactMacImeDeleteForward();
    return YES;
  case 123: // Left arrow
    rayactMacImeMoveCursorLeft();
    return YES;
  case 124: // Right arrow
    rayactMacImeMoveCursorRight();
    return YES;
  case 115: // Home
    rayactMacImeMoveCursorHome();
    return YES;
  case 119: // End
    rayactMacImeMoveCursorEnd();
    return YES;
  default:
    return NO;
  }
}

static RayactTextInputClient *gClient = nil;
static id gMonitor = nil;

void rayactMacTextInputInstall() {
  if (gMonitor)
    return;
  gClient = [[RayactTextInputClient alloc] init];
  gMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                                   handler:^NSEvent *(NSEvent *event) {
    if (!rayactMacImeHasFocusedTextInput())
      return event;
    if (rayactMacHandleShortcutEvent(event))
      return nil;
    if ([gClient.inputContext handleEvent:event])
      return nil;
    return event;
  }];
}

void rayactMacTextInputShutdown() {
  if (gMonitor) {
    [NSEvent removeMonitor:gMonitor];
    gMonitor = nil;
  }
  gClient = nil;
}
