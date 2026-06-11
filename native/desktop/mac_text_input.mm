#include "mac_text_input.hpp"

#import <AppKit/AppKit.h>

#include <raylib.h>

extern "C" bool rayactMacImeHasFocusedTextInput();
extern "C" void rayactMacImeInsertText(const char *utf8);
extern "C" void rayactMacImeSetMarkedText(const char *utf8, int selectedLocation,
                                           int selectedLength);
extern "C" void rayactMacImeUnmarkText();
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
  (void)selector;
}

@end

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
