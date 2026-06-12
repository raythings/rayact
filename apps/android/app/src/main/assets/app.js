(function() {
  "use strict";
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  var react = { exports: {} };
  var react_production = {};
  var hasRequiredReact_production;
  function requireReact_production() {
    if (hasRequiredReact_production) return react_production;
    hasRequiredReact_production = 1;
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    }, assign = Object.assign, emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null }, hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    }, Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    react_production.Activity = REACT_ACTIVITY_TYPE;
    react_production.Children = Children;
    react_production.Component = Component;
    react_production.Fragment = REACT_FRAGMENT_TYPE;
    react_production.Profiler = REACT_PROFILER_TYPE;
    react_production.PureComponent = PureComponent;
    react_production.StrictMode = REACT_STRICT_MODE_TYPE;
    react_production.Suspense = REACT_SUSPENSE_TYPE;
    react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    react_production.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    react_production.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    react_production.cacheSignal = function() {
      return null;
    };
    react_production.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    react_production.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    react_production.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    react_production.createRef = function() {
      return { current: null };
    };
    react_production.forwardRef = function(render2) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render: render2 };
    };
    react_production.isValidElement = isValidElement;
    react_production.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    react_production.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    react_production.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    react_production.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    react_production.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    react_production.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    react_production.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    react_production.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    react_production.useDebugValue = function() {
    };
    react_production.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    react_production.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    react_production.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    react_production.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    react_production.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    react_production.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    react_production.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    react_production.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    react_production.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    react_production.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    react_production.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    react_production.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    react_production.useSyncExternalStore = function(subscribe2, getSnapshot2, getServerSnapshot2) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe2,
        getSnapshot2,
        getServerSnapshot2
      );
    };
    react_production.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    react_production.version = "19.2.7";
    return react_production;
  }
  var hasRequiredReact;
  function requireReact() {
    if (hasRequiredReact) return react.exports;
    hasRequiredReact = 1;
    {
      react.exports = requireReact_production();
    }
    return react.exports;
  }
  var reactExports = requireReact();
  const React = /* @__PURE__ */ getDefaultExportFromCjs(reactExports);
  globalThis.importCSS("./packages/rayact-react/src/avoid-keyboard.css");
  function getGlobal$1() {
    return globalThis;
  }
  function encodePathPart(value) {
    return encodeURIComponent(value).replace(/%2F/g, "/");
  }
  function metadata(asset) {
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      hash: asset.hash,
      size: asset.size,
      outputName: asset.outputName,
      kind: asset.kind
    };
  }
  function resolveAssetUrl(asset, globalObject = getGlobal$1()) {
    if (typeof globalObject.resolveAssetUrl === "function") {
      return globalObject.resolveAssetUrl(asset);
    }
    const devServer = globalObject.__RAYACT_DEV_SERVER__;
    if (typeof devServer === "string" && devServer.length > 0) {
      return `${devServer.replace(/\/+$/, "")}/rayact/assets/${encodeURIComponent(asset.id)}/${encodePathPart(asset.name)}`;
    }
    const base = typeof globalObject.__RAYACT_RELEASE_ASSET_BASE__ === "string" ? globalObject.__RAYACT_RELEASE_ASSET_BASE__.replace(/\/+$/, "") : "assets";
    return `${base}/${asset.outputName ?? asset.name}`;
  }
  function isRayactAsset(value) {
    return Boolean(
      value && typeof value === "object" && typeof value.id === "string" && typeof value.url === "function" && typeof value.bytes === "function"
    );
  }
  function resolveWorkerSpecifier(value, globalObject = getGlobal$1()) {
    if (isRayactAsset(value)) {
      const assetMeta = metadata(value);
      if (typeof globalObject.resolveAssetPath === "function") {
        return globalObject.resolveAssetPath(assetMeta);
      }
      return value.url();
    }
    if (value && typeof value === "object") {
      const descriptor = value;
      if (isRayactAsset(descriptor.path)) {
        const assetMeta = metadata(descriptor.path);
        return {
          ...descriptor,
          path: typeof globalObject.resolveAssetPath === "function" ? globalObject.resolveAssetPath(assetMeta) : descriptor.path.url()
        };
      }
    }
    return value;
  }
  function installAssetAwareSpawnWorker(globalObject = getGlobal$1()) {
    if (globalObject.__rayactRawSpawnWorker || typeof globalObject.spawnWorker !== "function") return;
    const rawSpawnWorker = globalObject.spawnWorker.bind(globalObject);
    globalObject.__rayactRawSpawnWorker = rawSpawnWorker;
    globalObject.spawnWorker = (worker, initialData) => {
      return rawSpawnWorker(resolveWorkerSpecifier(worker, globalObject), initialData);
    };
  }
  function isSharedValue(value) {
    return typeof value === "object" && value !== null && "bindToNode" in value && typeof value.bindToNode === "function";
  }
  const SLAB_SIZE = 8;
  const OFFSETS = {
    translateX: 0,
    translateY: 1,
    scale: 2,
    opacity: 3,
    rotation: 4,
    dirty: 5
  };
  let sharedFloatArray = null;
  function writeSharedStyle(nodeId, property, value) {
    const propOffset = OFFSETS[property];
    if (propOffset !== void 0) {
      const globalObj = globalThis;
      const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray) {
        sharedFloatArray = new Float32Array(buffer);
      }
      if (sharedFloatArray) {
        const index = nodeId * SLAB_SIZE + propOffset;
        const dirtyIndex = nodeId * SLAB_SIZE + OFFSETS.dirty;
        sharedFloatArray[index] = value;
        sharedFloatArray[dirtyIndex] = 1;
      }
      if (typeof globalObj.__rayactSetAnimatedStyle === "function") {
        globalObj.__rayactSetAnimatedStyle(nodeId, { [property]: value });
      }
    }
  }
  function animatedStyleSnapshot(style) {
    const animated = {};
    for (const key of Object.keys(OFFSETS)) {
      if (key === "dirty") continue;
      const value = style[key];
      if (typeof value === "number") animated[key] = value;
    }
    return animated;
  }
  function registerAnimatedHostNode(node, style) {
    const globalObj = globalThis;
    const animated = animatedStyleSnapshot(style);
    if (Object.keys(animated).length > 0 && typeof globalObj.__rayactRegisterAnimatedNode === "function") {
      globalObj.__rayactRegisterAnimatedNode(node.id, animated);
    }
    return node;
  }
  function flattenStyleValue(style, isCreate, nodeId) {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map((s) => flattenStyleValue(s, isCreate, nodeId)));
    }
    if (!style || typeof style !== "object") return {};
    const result = {};
    for (const [key, value] of Object.entries(style)) {
      if (value == null) continue;
      if (isSharedValue(value)) {
        if (isCreate) {
          result[key] = value.value;
        }
      } else if (OFFSETS[key] !== void 0) {
        if (isCreate) {
          result[key] = value;
        } else if (nodeId !== void 0 && typeof value === "number") {
          writeSharedStyle(nodeId, key, value);
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  function parseAngle(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = parseFloat(value);
      if (Number.isNaN(n)) return void 0;
      return value.trim().endsWith("rad") ? n * 180 / Math.PI : n;
    }
    return void 0;
  }
  function flattenTransform(style, isCreate, nodeId) {
    const t = style.transform;
    if (!Array.isArray(t)) return;
    for (const entry of t) {
      if (!entry || typeof entry !== "object") continue;
      for (const [key, raw] of Object.entries(entry)) {
        switch (key) {
          case "translateX":
          case "translateY":
          case "scale": {
            if (isSharedValue(raw)) {
              if (isCreate) {
                style[key] = raw.value;
              }
            } else if (typeof raw === "number") {
              if (isCreate) {
                style[key] = raw;
              } else if (nodeId !== void 0) {
                writeSharedStyle(nodeId, key, raw);
              }
            }
            break;
          }
          case "rotate":
          case "rotation": {
            const keyName = "rotation";
            if (isSharedValue(raw)) {
              if (isCreate) {
                const deg = parseAngle(raw.value);
                if (deg !== void 0) style[keyName] = deg;
              }
            } else {
              const deg = parseAngle(raw);
              if (deg !== void 0) {
                if (isCreate) {
                  style[keyName] = deg;
                } else if (nodeId !== void 0) {
                  writeSharedStyle(nodeId, keyName, deg);
                }
              }
            }
            break;
          }
        }
      }
    }
    delete style.transform;
  }
  function toStyleProps(props = {}, isCreate, nodeId) {
    const style = flattenStyleValue(props.style, isCreate, nodeId);
    flattenTransform(style, isCreate, nodeId);
    if (typeof props.className === "string") {
      style.className = props.className;
    }
    return style;
  }
  function requireFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error(`Rayact native bridge is missing global ${name}()`);
    }
    return value;
  }
  function asHostNode(id, type) {
    if (typeof id !== "number") {
      throw new Error(`Failed to create native ${type} node`);
    }
    return { id, type };
  }
  function resolveImageSource(value, native2) {
    if (isRayactAsset(value)) {
      return typeof native2.resolveAssetPath === "function" ? native2.resolveAssetPath(value) : resolveAssetUrl(value, native2);
    }
    return String(value ?? "");
  }
  const materialHostTypes = /* @__PURE__ */ new Set([
    "appBar",
    "badge",
    "banner",
    "bottomAppBar",
    "bottomSheet",
    "dataTable",
    "dockedToolbar",
    "floatingToolbar",
    "buttonGroup",
    "card",
    "carousel",
    "checkbox",
    "chip",
    "datePicker",
    "dialog",
    "divider",
    "extendedFab",
    "fab",
    "fabMenu",
    "iconButton",
    "list",
    "loadingIndicator",
    "menu",
    "menuItem",
    "navigationBar",
    "navigationBarItem",
    "navigationDrawer",
    "navigationRail",
    "progressIndicator",
    "radioButton",
    "rangeSlider",
    "search",
    "searchBar",
    "segmentedButton",
    "sideSheet",
    "slider",
    "snackbar",
    "splitButton",
    "switch",
    "tabs",
    "textField",
    "timePicker",
    "toolbar",
    "tooltip",
    "popover"
  ]);
  function materialProps(type, props, style) {
    const childLabel = typeof props.children === "string" || typeof props.children === "number" ? props.children : void 0;
    return {
      ...style,
      ...props,
      component: type,
      label: props.label ?? props.text ?? props.title ?? childLabel
    };
  }
  function createBridge(globalObject = globalThis) {
    const native2 = globalObject;
    const bridge2 = {
      createNode(type, props = {}) {
        const style = toStyleProps(props, true);
        switch (type) {
          case "root":
          case "view":
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createView, "createView")(style), type), style);
          case "text": {
            const text = String(props.text ?? props.children ?? "");
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createText, "createText")(text, style), type), style);
          }
          case "button": {
            const label = String(props.label ?? props.text ?? props.children ?? "");
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createButton, "createButton")(label, style), type), style);
          }
          case "image":
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createImage, "createImage")(resolveImageSource(props.source ?? props.src, native2), style), type), style);
          case "icon":
            return registerAnimatedHostNode(asHostNode(
              requireFunction(native2.createIcon, "createIcon")(
                String(props.name ?? props.icon ?? ""),
                typeof props.size === "number" ? props.size : void 0,
                typeof props.color === "number" || typeof props.color === "string" ? props.color : void 0,
                style,
                typeof props.variant === "string" ? props.variant : void 0,
                typeof props.filled === "boolean" ? props.filled : void 0
              ),
              type
            ), style);
          case "textInput":
            return registerAnimatedHostNode(asHostNode(
              requireFunction(native2.createTextInput, "createTextInput")(
                String(props.value ?? props.defaultValue ?? ""),
                { ...style, ...props }
              ),
              type
            ), style);
          case "scrollView":
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createScrollView, "createScrollView")({ ...style, ...props }), type), style);
          case "externalView":
            return registerAnimatedHostNode(asHostNode(
              requireFunction(native2.createExternalView, "createExternalView")(
                String(props.kind ?? "stub"),
                { ...style, ...props }
              ),
              type
            ), style);
          case "modal":
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createModal, "createModal")({ ...style, ...props }), type), style);
          case "safeArea":
            return registerAnimatedHostNode(asHostNode(
              (native2.createSafeArea ?? native2.createView ?? requireFunction(native2.createView, "createView"))({ ...style, ...props }),
              type
            ), style);
          case "statusBar":
            return registerAnimatedHostNode(asHostNode(
              (native2.createStatusBar ?? native2.createView ?? requireFunction(native2.createView, "createView"))({ ...style, ...props }),
              type
            ), style);
          case "activityIndicator":
            return registerAnimatedHostNode(asHostNode(requireFunction(native2.createActivityIndicator, "createActivityIndicator")({ ...style, ...props }), type), style);
          default:
            if (materialHostTypes.has(type)) {
              return registerAnimatedHostNode(asHostNode(
                requireFunction(native2.createMaterialComponent, "createMaterialComponent")(type, materialProps(type, props, style)),
                type
              ), style);
            }
            throw new Error(`Unsupported Rayact host node type: ${type}`);
        }
      },
      updateNode(node, props) {
        const style = toStyleProps(props, false, node.id);
        if (materialHostTypes.has(node.type) && typeof native2.setMaterialComponentProps === "function") {
          native2.setMaterialComponentProps(node.id, materialProps(node.type, props, style));
        }
        if (Object.keys(style).length > 0) {
          requireFunction(native2.setStyle, "setStyle")(node.id, style);
        }
        if (node.type === "externalView" && typeof native2.setExternalViewProps === "function") {
          native2.setExternalViewProps(node.id, { ...props });
        }
        if (node.type === "icon" && typeof native2.setIconProps === "function") {
          native2.setIconProps(
            node.id,
            typeof props.size === "number" ? props.size : void 0,
            typeof props.color === "number" || typeof props.color === "string" ? props.color : void 0,
            typeof props.variant === "string" ? props.variant : void 0,
            typeof props.name === "string" ? props.name : typeof props.icon === "string" ? props.icon : void 0,
            typeof props.filled === "boolean" ? props.filled : void 0
          );
        }
        if (node.type === "text" && ("text" in props || "children" in props)) {
          requireFunction(native2.setText, "setText")(node.id, String(props.text ?? props.children ?? ""));
        }
        if (node.type === "button" && ("label" in props || "text" in props || "title" in props || typeof props.children === "string" || typeof props.children === "number")) {
          requireFunction(native2.setText, "setText")(node.id, String(props.label ?? props.text ?? props.title ?? props.children ?? ""));
        }
        if (node.type === "textInput" && "value" in props && typeof native2.setValue === "function") {
          native2.setValue(node.id, String(props.value ?? ""));
        }
      },
      appendChild(parent, child) {
        requireFunction(native2.appendChild, "appendChild")(parent.id, child.id);
      },
      removeChild(parent, child) {
        requireFunction(native2.removeChild, "removeChild")(parent.id, child.id);
      },
      insertBefore(parent, child, beforeChild) {
        requireFunction(native2.insertBefore, "insertBefore")(parent.id, child.id, beforeChild.id);
      },
      setRoot(node) {
        if (node) {
          requireFunction(native2.setRootNode, "setRootNode")(node.id);
        } else if (typeof native2.clearRootNode === "function") {
          native2.clearRootNode();
        } else {
          requireFunction(native2.setRootNode, "setRootNode")(null);
        }
      },
      setEventHandler(node, eventName, handler) {
        if (eventName === "press" || eventName === "click") {
          requireFunction(native2.setOnPress, "setOnPress")(node.id, handler ?? null);
        } else if (eventName === "changeText" && typeof native2.setOnChangeText === "function") {
          native2.setOnChangeText(node.id, handler);
        } else if (eventName === "changeValue" && typeof native2.setOnChangeValue === "function") {
          native2.setOnChangeValue(node.id, handler);
        } else if (eventName === "scroll" && typeof native2.setOnScroll === "function") {
          native2.setOnScroll(node.id, handler);
        } else if (eventName === "requestClose" && typeof native2.setOnRequestClose === "function") {
          native2.setOnRequestClose(node.id, handler ?? null);
        } else if (eventName === "focus" && typeof native2.setOnFocus === "function") {
          native2.setOnFocus(node.id, handler ?? null);
        } else if (eventName === "blur" && typeof native2.setOnBlur === "function") {
          native2.setOnBlur(node.id, handler ?? null);
        } else if (eventName === "dragStart" && typeof native2.setOnDragStart === "function") {
          native2.setOnDragStart(node.id, handler);
        } else if (eventName === "dragMove" && typeof native2.setOnDragMove === "function") {
          native2.setOnDragMove(node.id, handler);
        } else if (eventName === "dragEnd" && typeof native2.setOnDragEnd === "function") {
          native2.setOnDragEnd(node.id, handler);
        } else if (eventName === "layout" && typeof native2.setOnLayout === "function") {
          native2.setOnLayout(
            node.id,
            handler
          );
        }
      },
      disposeNode(node) {
        if (typeof native2.disposeNode === "function") {
          native2.disposeNode(node.id);
        }
      },
      async reload(source) {
        if (!source) return;
        if (typeof native2.eval !== "function") {
          throw new Error("Rayact reload requires global eval()");
        }
        native2.eval(source);
      },
      showError(message, stack) {
        const detail = stack ? `${message}

${stack}` : message;
        try {
          const root = bridge2.createNode("view", {
            style: {
              backgroundColor: 722539007,
              padding: 24,
              gap: 12,
              flexGrow: 1
            }
          });
          const title = bridge2.createNode("text", {
            text: "Rayact runtime error",
            style: { text: { color: 4294967295, fontSize: 24 } }
          });
          const body = bridge2.createNode("text", {
            text: detail,
            style: { text: { color: 4290032895, fontSize: 14 } }
          });
          bridge2.appendChild(root, title);
          bridge2.appendChild(root, body);
          bridge2.setRoot(root);
        } catch (overlayError) {
          native2.console?.error?.("Failed to show Rayact error overlay", overlayError);
        }
      }
    };
    return bridge2;
  }
  function joinUrl(serverUrl2, path) {
    return `${serverUrl2.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
  function toWsUrl(serverUrl2, channel) {
    return joinUrl(serverUrl2, channel).replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  }
  function serializeError(error) {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }
  function createDevClient(options) {
    const globalObject = options.global ?? globalThis;
    let debuggerSocket = null;
    let hmrSocket = null;
    let debuggerReconnect = null;
    let hmrReconnect = null;
    let pollTimer = null;
    let lastRevision = null;
    let manifest = {};
    const send = (type, payload) => {
      if (!debuggerSocket || debuggerSocket.readyState !== 1) return;
      debuggerSocket.send(JSON.stringify({ type, payload }));
    };
    const fetchManifest = async () => {
      const fetchFn = globalObject.fetch;
      if (typeof fetchFn !== "function") return {};
      const response = await fetchFn(joinUrl(options.serverUrl, "/rayact/manifest.json"));
      return JSON.parse(await response.text());
    };
    const loadBundle = async () => {
      try {
        const fetchFn = globalObject.fetch;
        if (typeof fetchFn !== "function") {
          throw new Error("Rayact dev client requires fetch()");
        }
        manifest = await fetchManifest();
        const bundlePath = manifest.bundleFormat === "qjsbc" ? "/rayact/bundle.qjsbc" : "/rayact/bundle";
        const bundleUrl = manifest.bundleUrl ?? joinUrl(options.serverUrl, bundlePath);
        const response = await fetchFn(bundleUrl);
        if (manifest.bundleFormat === "qjsbc") {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (typeof globalObject.loadBytecode === "function") {
            await globalObject.loadBytecode(bytes);
          } else {
            throw new Error("Rayact dev client requires loadBytecode() for .qjsbc bundles");
          }
        } else {
          const source = await response.text();
          await options.bridge.reload(source);
        }
        send("client:reloaded");
        return true;
      } catch (error) {
        const serialized = serializeError(error);
        options.bridge.showError?.(serialized.message, serialized.stack);
        send("client:error", serialized);
        return false;
      }
    };
    const pollStatus = async () => {
      try {
        const fetchFn = globalObject.fetch;
        if (typeof fetchFn !== "function") return;
        const response = await fetchFn(joinUrl(options.serverUrl, "/rayact/status"));
        const status = JSON.parse(await response.text());
        if (typeof status.revision !== "number") return;
        if (lastRevision === null) {
          lastRevision = status.revision;
          return;
        }
        if (status.revision !== lastRevision) {
          globalObject.console?.info?.(`[rayact] revision ${status.revision} detected (poll fallback)`);
          if (await loadBundle()) lastRevision = status.revision;
        }
      } catch (error) {
        globalObject.console?.warn?.("[rayact] revision poll failed", error);
      }
    };
    const handleHmrMessage = (message) => {
      if (message.type === "reload" || message.type === "hmr-update") {
        globalObject.console?.info?.(`[rayact] ${message.type} received`);
        const revision = typeof message.payload?.revision === "number" ? message.payload.revision : null;
        void loadBundle().then((ok) => {
          if (ok && revision !== null) lastRevision = revision;
        });
      } else if (message.type === "build:error") {
        const payload = message.payload;
        options.bridge.showError?.(payload.message ?? "Build error", payload.stack);
      }
    };
    const connectHmr = () => {
      const WebSocketCtor = globalObject.WebSocket;
      if (typeof WebSocketCtor !== "function") return;
      if (hmrSocket) return;
      const hmrUrl = manifest.hmrUrl ?? toWsUrl(options.serverUrl, "/rayact/hmr");
      globalObject.console?.info?.(`[rayact] connecting hmr: ${hmrUrl}`);
      hmrSocket = new WebSocketCtor(hmrUrl);
      hmrSocket.onopen = () => {
        globalObject.console?.info?.("[rayact] hmr connected");
      };
      hmrSocket.onclose = () => {
        globalObject.console?.warn?.("[rayact] hmr disconnected");
        hmrSocket = null;
        hmrReconnect = setTimeout(connectHmr, 1e3);
      };
      hmrSocket.onerror = (event) => {
        globalObject.console?.warn?.("[rayact] hmr socket error", event);
      };
      hmrSocket.onmessage = (event) => {
        try {
          handleHmrMessage(JSON.parse(event.data));
        } catch {
        }
      };
    };
    const connectDebugger = () => {
      const WebSocketCtor = globalObject.WebSocket;
      if (typeof WebSocketCtor !== "function") return;
      if (debuggerSocket) return;
      const debuggerUrl = toWsUrl(options.serverUrl, "/rayact/debugger");
      globalObject.console?.info?.(`[rayact] connecting debugger: ${debuggerUrl}`);
      debuggerSocket = new WebSocketCtor(debuggerUrl);
      debuggerSocket.onopen = () => {
        globalObject.console?.info?.("[rayact] debugger connected");
        send("client:ready", { serverUrl: options.serverUrl });
      };
      debuggerSocket.onclose = () => {
        globalObject.console?.warn?.("[rayact] debugger disconnected");
        debuggerSocket = null;
        debuggerReconnect = setTimeout(connectDebugger, 1e3);
      };
      debuggerSocket.onerror = (event) => {
        globalObject.console?.warn?.("[rayact] debugger socket error", event);
      };
    };
    const connect = () => {
      void fetchManifest().then((m) => {
        manifest = m;
        connectHmr();
        connectDebugger();
      });
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          void pollStatus();
        }, 5e3);
        void pollStatus();
      }
    };
    const disconnect = () => {
      if (debuggerReconnect) {
        clearTimeout(debuggerReconnect);
        debuggerReconnect = null;
      }
      if (hmrReconnect) {
        clearTimeout(hmrReconnect);
        hmrReconnect = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (debuggerSocket) {
        debuggerSocket.close();
        debuggerSocket = null;
      }
      if (hmrSocket) {
        hmrSocket.close();
        hmrSocket = null;
      }
    };
    return { connect, disconnect, send };
  }
  function installConsoleForwarding(client, globalObject = globalThis) {
    const consoleObject = globalObject.console;
    if (!consoleObject || globalObject.__rayactConsoleForwarding) return;
    globalObject.__rayactConsoleForwarding = true;
    for (const level of ["log", "info", "warn", "error", "debug"]) {
      const original = consoleObject[level]?.bind(consoleObject);
      if (!original) continue;
      consoleObject[level] = (...args) => {
        original(...args);
        client.send("console", {
          level,
          args: args.map((arg) => {
            try {
              return typeof arg === "string" ? arg : JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
        });
      };
    }
  }
  function getGlobal(options) {
    return options?.global ?? globalThis;
  }
  function createRuntime(options = {}) {
    const globalObject = getGlobal(options);
    const bridge2 = options.bridge ?? createBridge(globalObject);
    const serverUrl2 = typeof globalObject.__RAYACT_DEV_SERVER__ === "string" ? globalObject.__RAYACT_DEV_SERVER__ : void 0;
    const isNativeHost = typeof globalObject.createView === "function";
    const shouldCreateDevClient = typeof serverUrl2 === "string" && (options.devClient === true || options.devClient !== false && !isNativeHost);
    const devClient = typeof options.devClient === "object" ? options.devClient : shouldCreateDevClient ? createDevClient({ serverUrl: serverUrl2, bridge: bridge2, global: globalObject }) : void 0;
    if (devClient) {
      globalObject.console?.info?.(`[rayact] dev client enabled: ${serverUrl2}`);
      installConsoleForwarding(devClient, globalObject);
      devClient.connect();
    }
    installAssetAwareSpawnWorker(globalObject);
    return {
      bridge: bridge2,
      devClient,
      reportError(error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : void 0;
        bridge2.showError?.(message, stack);
        devClient?.send("client:error", { message, stack });
      }
    };
  }
  function getDefaultRuntime() {
    const globalObject = globalThis;
    if (!globalObject.__rayactRuntime) {
      globalObject.__rayactRuntime = createRuntime({ global: globalObject });
    }
    return globalObject.__rayactRuntime;
  }
  var reactReconciler = { exports: {} };
  var reactReconciler_production = { exports: {} };
  var scheduler = { exports: {} };
  var scheduler_production = {};
  var hasRequiredScheduler_production;
  function requireScheduler_production() {
    if (hasRequiredScheduler_production) return scheduler_production;
    hasRequiredScheduler_production = 1;
    (function(exports) {
      function push(heap, node) {
        var index = heap.length;
        heap.push(node);
        a: for (; 0 < index; ) {
          var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
          if (0 < compare(parent, node))
            heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
          else break a;
        }
      }
      function peek(heap) {
        return 0 === heap.length ? null : heap[0];
      }
      function pop(heap) {
        if (0 === heap.length) return null;
        var first = heap[0], last = heap.pop();
        if (last !== first) {
          heap[0] = last;
          a: for (var index = 0, length = heap.length, halfLength = length >>> 1; index < halfLength; ) {
            var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right = heap[rightIndex];
            if (0 > compare(left, last))
              rightIndex < length && 0 > compare(right, left) ? (heap[index] = right, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
            else if (rightIndex < length && 0 > compare(right, last))
              heap[index] = right, heap[rightIndex] = last, index = rightIndex;
            else break a;
          }
        }
        return first;
      }
      function compare(a, b) {
        var diff = a.sortIndex - b.sortIndex;
        return 0 !== diff ? diff : a.id - b.id;
      }
      exports.unstable_now = void 0;
      if ("object" === typeof performance && "function" === typeof performance.now) {
        var localPerformance = performance;
        exports.unstable_now = function() {
          return localPerformance.now();
        };
      } else {
        var localDate = Date, initialTime = localDate.now();
        exports.unstable_now = function() {
          return localDate.now() - initialTime;
        };
      }
      var taskQueue = [], timerQueue = [], taskIdCounter = 1, currentTask = null, currentPriorityLevel = 3, isPerformingWork = false, isHostCallbackScheduled = false, isHostTimeoutScheduled = false, localSetTimeout = "function" === typeof setTimeout ? setTimeout : null, localClearTimeout = "function" === typeof clearTimeout ? clearTimeout : null, localSetImmediate = "undefined" !== typeof setImmediate ? setImmediate : null;
      function advanceTimers(currentTime) {
        for (var timer = peek(timerQueue); null !== timer; ) {
          if (null === timer.callback) pop(timerQueue);
          else if (timer.startTime <= currentTime)
            pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
          else break;
          timer = peek(timerQueue);
        }
      }
      function handleTimeout(currentTime) {
        isHostTimeoutScheduled = false;
        advanceTimers(currentTime);
        if (!isHostCallbackScheduled)
          if (null !== peek(taskQueue))
            isHostCallbackScheduled = true, requestHostCallback();
          else {
            var firstTimer = peek(timerQueue);
            null !== firstTimer && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
          }
      }
      var isMessageLoopRunning = false, taskTimeoutID = -1, frameInterval = 5, startTime = -1;
      function shouldYieldToHost() {
        return exports.unstable_now() - startTime < frameInterval ? false : true;
      }
      function performWorkUntilDeadline() {
        if (isMessageLoopRunning) {
          var currentTime = exports.unstable_now();
          startTime = currentTime;
          var hasMoreWork = true;
          try {
            a: {
              isHostCallbackScheduled = false;
              isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
              isPerformingWork = true;
              var previousPriorityLevel = currentPriorityLevel;
              try {
                b: {
                  advanceTimers(currentTime);
                  for (currentTask = peek(taskQueue); null !== currentTask && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
                    var callback = currentTask.callback;
                    if ("function" === typeof callback) {
                      currentTask.callback = null;
                      currentPriorityLevel = currentTask.priorityLevel;
                      var continuationCallback = callback(
                        currentTask.expirationTime <= currentTime
                      );
                      currentTime = exports.unstable_now();
                      if ("function" === typeof continuationCallback) {
                        currentTask.callback = continuationCallback;
                        advanceTimers(currentTime);
                        hasMoreWork = true;
                        break b;
                      }
                      currentTask === peek(taskQueue) && pop(taskQueue);
                      advanceTimers(currentTime);
                    } else pop(taskQueue);
                    currentTask = peek(taskQueue);
                  }
                  if (null !== currentTask) hasMoreWork = true;
                  else {
                    var firstTimer = peek(timerQueue);
                    null !== firstTimer && requestHostTimeout(
                      handleTimeout,
                      firstTimer.startTime - currentTime
                    );
                    hasMoreWork = false;
                  }
                }
                break a;
              } finally {
                currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
              }
              hasMoreWork = void 0;
            }
          } finally {
            hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
          }
        }
      }
      var schedulePerformWorkUntilDeadline;
      if ("function" === typeof localSetImmediate)
        schedulePerformWorkUntilDeadline = function() {
          localSetImmediate(performWorkUntilDeadline);
        };
      else if ("undefined" !== typeof MessageChannel) {
        var channel = new MessageChannel(), port = channel.port2;
        channel.port1.onmessage = performWorkUntilDeadline;
        schedulePerformWorkUntilDeadline = function() {
          port.postMessage(null);
        };
      } else
        schedulePerformWorkUntilDeadline = function() {
          localSetTimeout(performWorkUntilDeadline, 0);
        };
      function requestHostCallback() {
        isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
      }
      function requestHostTimeout(callback, ms) {
        taskTimeoutID = localSetTimeout(function() {
          callback(exports.unstable_now());
        }, ms);
      }
      exports.unstable_IdlePriority = 5;
      exports.unstable_ImmediatePriority = 1;
      exports.unstable_LowPriority = 4;
      exports.unstable_NormalPriority = 3;
      exports.unstable_Profiling = null;
      exports.unstable_UserBlockingPriority = 2;
      exports.unstable_cancelCallback = function(task) {
        task.callback = null;
      };
      exports.unstable_continueExecution = function() {
        isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, requestHostCallback());
      };
      exports.unstable_forceFrameRate = function(fps) {
        0 > fps || 125 < fps ? console.error(
          "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
        ) : frameInterval = 0 < fps ? Math.floor(1e3 / fps) : 5;
      };
      exports.unstable_getCurrentPriorityLevel = function() {
        return currentPriorityLevel;
      };
      exports.unstable_getFirstCallbackNode = function() {
        return peek(taskQueue);
      };
      exports.unstable_next = function(eventHandler) {
        switch (currentPriorityLevel) {
          case 1:
          case 2:
          case 3:
            var priorityLevel = 3;
            break;
          default:
            priorityLevel = currentPriorityLevel;
        }
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = priorityLevel;
        try {
          return eventHandler();
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
      exports.unstable_pauseExecution = function() {
      };
      exports.unstable_requestPaint = function() {
      };
      exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
        switch (priorityLevel) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            priorityLevel = 3;
        }
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = priorityLevel;
        try {
          return eventHandler();
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
      exports.unstable_scheduleCallback = function(priorityLevel, callback, options) {
        var currentTime = exports.unstable_now();
        "object" === typeof options && null !== options ? (options = options.delay, options = "number" === typeof options && 0 < options ? currentTime + options : currentTime) : options = currentTime;
        switch (priorityLevel) {
          case 1:
            var timeout = -1;
            break;
          case 2:
            timeout = 250;
            break;
          case 5:
            timeout = 1073741823;
            break;
          case 4:
            timeout = 1e4;
            break;
          default:
            timeout = 5e3;
        }
        timeout = options + timeout;
        priorityLevel = {
          id: taskIdCounter++,
          callback,
          priorityLevel,
          startTime: options,
          expirationTime: timeout,
          sortIndex: -1
        };
        options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), null === peek(taskQueue) && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, requestHostCallback()));
        return priorityLevel;
      };
      exports.unstable_shouldYield = shouldYieldToHost;
      exports.unstable_wrapCallback = function(callback) {
        var parentPriorityLevel = currentPriorityLevel;
        return function() {
          var previousPriorityLevel = currentPriorityLevel;
          currentPriorityLevel = parentPriorityLevel;
          try {
            return callback.apply(this, arguments);
          } finally {
            currentPriorityLevel = previousPriorityLevel;
          }
        };
      };
    })(scheduler_production);
    return scheduler_production;
  }
  var hasRequiredScheduler;
  function requireScheduler() {
    if (hasRequiredScheduler) return scheduler.exports;
    hasRequiredScheduler = 1;
    {
      scheduler.exports = requireScheduler_production();
    }
    return scheduler.exports;
  }
  var hasRequiredReactReconciler_production;
  function requireReactReconciler_production() {
    if (hasRequiredReactReconciler_production) return reactReconciler_production.exports;
    hasRequiredReactReconciler_production = 1;
    (function(module) {
      module.exports = function($$$config) {
        function createFiber(tag, pendingProps, key, mode) {
          return new FiberNode(tag, pendingProps, key, mode);
        }
        function noop() {
        }
        function formatProdErrorMessage(code) {
          var url = "https://react.dev/errors/" + code;
          if (1 < arguments.length) {
            url += "?args[]=" + encodeURIComponent(arguments[1]);
            for (var i = 2; i < arguments.length; i++)
              url += "&args[]=" + encodeURIComponent(arguments[i]);
          }
          return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
        }
        function getIteratorFn(maybeIterable) {
          if (null === maybeIterable || "object" !== typeof maybeIterable)
            return null;
          maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
          return "function" === typeof maybeIterable ? maybeIterable : null;
        }
        function getComponentNameFromType(type) {
          if (null == type) return null;
          if ("function" === typeof type)
            return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
          if ("string" === typeof type) return type;
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if ("object" === typeof type)
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                return (type.displayName || "Context") + ".Provider";
              case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
              case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
              case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                  return getComponentNameFromType(type(innerType));
                } catch (x) {
                }
            }
          return null;
        }
        function describeBuiltInComponentFrame(name) {
          if (void 0 === prefix)
            try {
              throw Error();
            } catch (x) {
              var match = x.stack.trim().match(/\n( *(at )?)/);
              prefix = match && match[1] || "";
              suffix = -1 < x.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < x.stack.indexOf("@") ? "@unknown:0:0" : "";
            }
          return "\n" + prefix + name + suffix;
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) return "";
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          try {
            var RunInRootFrame = {
              DetermineComponentFrameRoot: function() {
                try {
                  if (construct) {
                    var Fake = function() {
                      throw Error();
                    };
                    Object.defineProperty(Fake.prototype, "props", {
                      set: function() {
                        throw Error();
                      }
                    });
                    if ("object" === typeof Reflect && Reflect.construct) {
                      try {
                        Reflect.construct(Fake, []);
                      } catch (x) {
                        var control = x;
                      }
                      Reflect.construct(fn, [], Fake);
                    } else {
                      try {
                        Fake.call();
                      } catch (x$0) {
                        control = x$0;
                      }
                      fn.call(Fake.prototype);
                    }
                  } else {
                    try {
                      throw Error();
                    } catch (x$1) {
                      control = x$1;
                    }
                    (Fake = fn()) && "function" === typeof Fake.catch && Fake.catch(function() {
                    });
                  }
                } catch (sample) {
                  if (sample && control && "string" === typeof sample.stack)
                    return [sample.stack, control.stack];
                }
                return [null, null];
              }
            };
            RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
            var namePropDescriptor = Object.getOwnPropertyDescriptor(
              RunInRootFrame.DetermineComponentFrameRoot,
              "name"
            );
            namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(
              RunInRootFrame.DetermineComponentFrameRoot,
              "name",
              { value: "DetermineComponentFrameRoot" }
            );
            var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
            if (sampleStack && controlStack) {
              var sampleLines = sampleStack.split("\n"), controlLines = controlStack.split("\n");
              for (namePropDescriptor = RunInRootFrame = 0; RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
                RunInRootFrame++;
              for (; namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes(
                "DetermineComponentFrameRoot"
              ); )
                namePropDescriptor++;
              if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
                for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1; 1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
                  namePropDescriptor--;
              for (; 1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
                if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                  if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
                    do
                      if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                        var frame = "\n" + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                        fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                        return frame;
                      }
                    while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
                  }
                  break;
                }
            }
          } finally {
            reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
          }
          return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
        }
        function describeFiber(fiber) {
          switch (fiber.tag) {
            case 26:
            case 27:
            case 5:
              return describeBuiltInComponentFrame(fiber.type);
            case 16:
              return describeBuiltInComponentFrame("Lazy");
            case 13:
              return describeBuiltInComponentFrame("Suspense");
            case 19:
              return describeBuiltInComponentFrame("SuspenseList");
            case 0:
            case 15:
              return fiber = describeNativeComponentFrame(fiber.type, false), fiber;
            case 11:
              return fiber = describeNativeComponentFrame(fiber.type.render, false), fiber;
            case 1:
              return fiber = describeNativeComponentFrame(fiber.type, true), fiber;
            default:
              return "";
          }
        }
        function getStackByFiberInDevAndProd(workInProgress2) {
          try {
            var info = "";
            do
              info += describeFiber(workInProgress2), workInProgress2 = workInProgress2.return;
            while (workInProgress2);
            return info;
          } catch (x) {
            return "\nError generating stack: " + x.message + "\n" + x.stack;
          }
        }
        function getNearestMountedFiber(fiber) {
          var node = fiber, nearestMounted = fiber;
          if (fiber.alternate) for (; node.return; ) node = node.return;
          else {
            fiber = node;
            do
              node = fiber, 0 !== (node.flags & 4098) && (nearestMounted = node.return), fiber = node.return;
            while (fiber);
          }
          return 3 === node.tag ? nearestMounted : null;
        }
        function assertIsMounted(fiber) {
          if (getNearestMountedFiber(fiber) !== fiber)
            throw Error(formatProdErrorMessage(188));
        }
        function findCurrentFiberUsingSlowPath(fiber) {
          var alternate = fiber.alternate;
          if (!alternate) {
            alternate = getNearestMountedFiber(fiber);
            if (null === alternate) throw Error(formatProdErrorMessage(188));
            return alternate !== fiber ? null : fiber;
          }
          for (var a = fiber, b = alternate; ; ) {
            var parentA = a.return;
            if (null === parentA) break;
            var parentB = parentA.alternate;
            if (null === parentB) {
              b = parentA.return;
              if (null !== b) {
                a = b;
                continue;
              }
              break;
            }
            if (parentA.child === parentB.child) {
              for (parentB = parentA.child; parentB; ) {
                if (parentB === a) return assertIsMounted(parentA), fiber;
                if (parentB === b) return assertIsMounted(parentA), alternate;
                parentB = parentB.sibling;
              }
              throw Error(formatProdErrorMessage(188));
            }
            if (a.return !== b.return) a = parentA, b = parentB;
            else {
              for (var didFindChild = false, child$2 = parentA.child; child$2; ) {
                if (child$2 === a) {
                  didFindChild = true;
                  a = parentA;
                  b = parentB;
                  break;
                }
                if (child$2 === b) {
                  didFindChild = true;
                  b = parentA;
                  a = parentB;
                  break;
                }
                child$2 = child$2.sibling;
              }
              if (!didFindChild) {
                for (child$2 = parentB.child; child$2; ) {
                  if (child$2 === a) {
                    didFindChild = true;
                    a = parentB;
                    b = parentA;
                    break;
                  }
                  if (child$2 === b) {
                    didFindChild = true;
                    b = parentB;
                    a = parentA;
                    break;
                  }
                  child$2 = child$2.sibling;
                }
                if (!didFindChild) throw Error(formatProdErrorMessage(189));
              }
            }
            if (a.alternate !== b) throw Error(formatProdErrorMessage(190));
          }
          if (3 !== a.tag) throw Error(formatProdErrorMessage(188));
          return a.stateNode.current === a ? fiber : alternate;
        }
        function findCurrentHostFiberImpl(node) {
          var tag = node.tag;
          if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
          for (node = node.child; null !== node; ) {
            tag = findCurrentHostFiberImpl(node);
            if (null !== tag) return tag;
            node = node.sibling;
          }
          return null;
        }
        function findCurrentHostFiberWithNoPortalsImpl(node) {
          var tag = node.tag;
          if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
          for (node = node.child; null !== node; ) {
            if (4 !== node.tag && (tag = findCurrentHostFiberWithNoPortalsImpl(node), null !== tag))
              return tag;
            node = node.sibling;
          }
          return null;
        }
        function createCursor(defaultValue) {
          return { current: defaultValue };
        }
        function pop(cursor) {
          0 > index$jscomp$0 || (cursor.current = valueStack[index$jscomp$0], valueStack[index$jscomp$0] = null, index$jscomp$0--);
        }
        function push(cursor, value) {
          index$jscomp$0++;
          valueStack[index$jscomp$0] = cursor.current;
          cursor.current = value;
        }
        function clz32Fallback(x) {
          x >>>= 0;
          return 0 === x ? 32 : 31 - (log$1(x) / LN2 | 0) | 0;
        }
        function getHighestPriorityLanes(lanes) {
          var pendingSyncLanes = lanes & 42;
          if (0 !== pendingSyncLanes) return pendingSyncLanes;
          switch (lanes & -lanes) {
            case 1:
              return 1;
            case 2:
              return 2;
            case 4:
              return 4;
            case 8:
              return 8;
            case 16:
              return 16;
            case 32:
              return 32;
            case 64:
              return 64;
            case 128:
            case 256:
            case 512:
            case 1024:
            case 2048:
            case 4096:
            case 8192:
            case 16384:
            case 32768:
            case 65536:
            case 131072:
            case 262144:
            case 524288:
            case 1048576:
            case 2097152:
              return lanes & 4194176;
            case 4194304:
            case 8388608:
            case 16777216:
            case 33554432:
              return lanes & 62914560;
            case 67108864:
              return 67108864;
            case 134217728:
              return 134217728;
            case 268435456:
              return 268435456;
            case 536870912:
              return 536870912;
            case 1073741824:
              return 0;
            default:
              return lanes;
          }
        }
        function getNextLanes(root, wipLanes) {
          var pendingLanes = root.pendingLanes;
          if (0 === pendingLanes) return 0;
          var nextLanes = 0, suspendedLanes = root.suspendedLanes, pingedLanes = root.pingedLanes, warmLanes = root.warmLanes;
          root = 0 !== root.finishedLanes;
          var nonIdlePendingLanes = pendingLanes & 134217727;
          0 !== nonIdlePendingLanes ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, 0 !== pendingLanes ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : root || (warmLanes = nonIdlePendingLanes & ~warmLanes, 0 !== warmLanes && (nextLanes = getHighestPriorityLanes(warmLanes))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, 0 !== nonIdlePendingLanes ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : root || (warmLanes = pendingLanes & ~warmLanes, 0 !== warmLanes && (nextLanes = getHighestPriorityLanes(warmLanes))));
          return 0 === nextLanes ? 0 : 0 !== wipLanes && wipLanes !== nextLanes && 0 === (wipLanes & suspendedLanes) && (suspendedLanes = nextLanes & -nextLanes, warmLanes = wipLanes & -wipLanes, suspendedLanes >= warmLanes || 32 === suspendedLanes && 0 !== (warmLanes & 4194176)) ? wipLanes : nextLanes;
        }
        function checkIfRootIsPrerendering(root, renderLanes2) {
          return 0 === (root.pendingLanes & ~(root.suspendedLanes & ~root.pingedLanes) & renderLanes2);
        }
        function computeExpirationTime(lane, currentTime) {
          switch (lane) {
            case 1:
            case 2:
            case 4:
            case 8:
              return currentTime + 250;
            case 16:
            case 32:
            case 64:
            case 128:
            case 256:
            case 512:
            case 1024:
            case 2048:
            case 4096:
            case 8192:
            case 16384:
            case 32768:
            case 65536:
            case 131072:
            case 262144:
            case 524288:
            case 1048576:
            case 2097152:
              return currentTime + 5e3;
            case 4194304:
            case 8388608:
            case 16777216:
            case 33554432:
              return -1;
            case 67108864:
            case 134217728:
            case 268435456:
            case 536870912:
            case 1073741824:
              return -1;
            default:
              return -1;
          }
        }
        function claimNextTransitionLane() {
          var lane = nextTransitionLane;
          nextTransitionLane <<= 1;
          0 === (nextTransitionLane & 4194176) && (nextTransitionLane = 128);
          return lane;
        }
        function claimNextRetryLane() {
          var lane = nextRetryLane;
          nextRetryLane <<= 1;
          0 === (nextRetryLane & 62914560) && (nextRetryLane = 4194304);
          return lane;
        }
        function createLaneMap(initial) {
          for (var laneMap = [], i = 0; 31 > i; i++) laneMap.push(initial);
          return laneMap;
        }
        function markRootUpdated$1(root, updateLane) {
          root.pendingLanes |= updateLane;
          268435456 !== updateLane && (root.suspendedLanes = 0, root.pingedLanes = 0, root.warmLanes = 0);
        }
        function markRootFinished(root, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
          var previouslyPendingLanes = root.pendingLanes;
          root.pendingLanes = remainingLanes;
          root.suspendedLanes = 0;
          root.pingedLanes = 0;
          root.warmLanes = 0;
          root.expiredLanes &= remainingLanes;
          root.entangledLanes &= remainingLanes;
          root.errorRecoveryDisabledLanes &= remainingLanes;
          root.shellSuspendCounter = 0;
          var entanglements = root.entanglements, expirationTimes = root.expirationTimes, hiddenUpdates = root.hiddenUpdates;
          for (remainingLanes = previouslyPendingLanes & ~remainingLanes; 0 < remainingLanes; ) {
            var index$7 = 31 - clz32(remainingLanes), lane = 1 << index$7;
            entanglements[index$7] = 0;
            expirationTimes[index$7] = -1;
            var hiddenUpdatesForLane = hiddenUpdates[index$7];
            if (null !== hiddenUpdatesForLane)
              for (hiddenUpdates[index$7] = null, index$7 = 0; index$7 < hiddenUpdatesForLane.length; index$7++) {
                var update = hiddenUpdatesForLane[index$7];
                null !== update && (update.lane &= -536870913);
              }
            remainingLanes &= ~lane;
          }
          0 !== spawnedLane && markSpawnedDeferredLane(root, spawnedLane, 0);
          0 !== suspendedRetryLanes && 0 === updatedLanes && 0 !== root.tag && (root.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
        }
        function markSpawnedDeferredLane(root, spawnedLane, entangledLanes) {
          root.pendingLanes |= spawnedLane;
          root.suspendedLanes &= ~spawnedLane;
          var spawnedLaneIndex = 31 - clz32(spawnedLane);
          root.entangledLanes |= spawnedLane;
          root.entanglements[spawnedLaneIndex] = root.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 4194218;
        }
        function markRootEntangled(root, entangledLanes) {
          var rootEntangledLanes = root.entangledLanes |= entangledLanes;
          for (root = root.entanglements; rootEntangledLanes; ) {
            var index$8 = 31 - clz32(rootEntangledLanes), lane = 1 << index$8;
            lane & entangledLanes | root[index$8] & entangledLanes && (root[index$8] |= entangledLanes);
            rootEntangledLanes &= ~lane;
          }
        }
        function lanesToEventPriority(lanes) {
          lanes &= -lanes;
          return 2 < lanes ? 8 < lanes ? 0 !== (lanes & 134217727) ? 32 : 268435456 : 8 : 2;
        }
        function onCommitRoot(root) {
          if (injectedHook && "function" === typeof injectedHook.onCommitFiberRoot)
            try {
              injectedHook.onCommitFiberRoot(
                rendererID,
                root,
                void 0,
                128 === (root.current.flags & 128)
              );
            } catch (err) {
            }
        }
        function setIsStrictModeForDevtools(newIsStrictMode) {
          "function" === typeof log && unstable_setDisableYieldValue(newIsStrictMode);
          if (injectedHook && "function" === typeof injectedHook.setStrictMode)
            try {
              injectedHook.setStrictMode(rendererID, newIsStrictMode);
            } catch (err) {
            }
        }
        function is(x, y) {
          return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
        }
        function createCapturedValueAtFiber(value, source) {
          if ("object" === typeof value && null !== value) {
            var existing = CapturedStacks.get(value);
            if (void 0 !== existing) return existing;
            source = {
              value,
              source,
              stack: getStackByFiberInDevAndProd(source)
            };
            CapturedStacks.set(value, source);
            return source;
          }
          return {
            value,
            source,
            stack: getStackByFiberInDevAndProd(source)
          };
        }
        function pushTreeFork(workInProgress2, totalChildren) {
          forkStack[forkStackIndex++] = treeForkCount;
          forkStack[forkStackIndex++] = treeForkProvider;
          treeForkProvider = workInProgress2;
          treeForkCount = totalChildren;
        }
        function pushTreeId(workInProgress2, totalChildren, index) {
          idStack[idStackIndex++] = treeContextId;
          idStack[idStackIndex++] = treeContextOverflow;
          idStack[idStackIndex++] = treeContextProvider;
          treeContextProvider = workInProgress2;
          var baseIdWithLeadingBit = treeContextId;
          workInProgress2 = treeContextOverflow;
          var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
          baseIdWithLeadingBit &= ~(1 << baseLength);
          index += 1;
          var length = 32 - clz32(totalChildren) + baseLength;
          if (30 < length) {
            var numberOfOverflowBits = baseLength - baseLength % 5;
            length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
            baseIdWithLeadingBit >>= numberOfOverflowBits;
            baseLength -= numberOfOverflowBits;
            treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index << baseLength | baseIdWithLeadingBit;
            treeContextOverflow = length + workInProgress2;
          } else
            treeContextId = 1 << length | index << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
        }
        function pushMaterializedTreeId(workInProgress2) {
          null !== workInProgress2.return && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
        }
        function popTreeContext(workInProgress2) {
          for (; workInProgress2 === treeForkProvider; )
            treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
          for (; workInProgress2 === treeContextProvider; )
            treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
        }
        function pushHostContainer(fiber, nextRootInstance) {
          push(rootInstanceStackCursor, nextRootInstance);
          push(contextFiberStackCursor, fiber);
          push(contextStackCursor, null);
          fiber = getRootHostContext(nextRootInstance);
          pop(contextStackCursor);
          push(contextStackCursor, fiber);
        }
        function popHostContainer() {
          pop(contextStackCursor);
          pop(contextFiberStackCursor);
          pop(rootInstanceStackCursor);
        }
        function pushHostContext(fiber) {
          null !== fiber.memoizedState && push(hostTransitionProviderCursor, fiber);
          var context = contextStackCursor.current, nextContext = getChildHostContext(context, fiber.type);
          context !== nextContext && (push(contextFiberStackCursor, fiber), push(contextStackCursor, nextContext));
        }
        function popHostContext(fiber) {
          contextFiberStackCursor.current === fiber && (pop(contextStackCursor), pop(contextFiberStackCursor));
          hostTransitionProviderCursor.current === fiber && (pop(hostTransitionProviderCursor), isPrimaryRenderer ? HostTransitionContext2._currentValue = NotPendingTransition : HostTransitionContext2._currentValue2 = NotPendingTransition);
        }
        function throwOnHydrationMismatch(fiber) {
          var error = Error(formatProdErrorMessage(418, ""));
          queueHydrationError(createCapturedValueAtFiber(error, fiber));
          throw HydrationMismatchException;
        }
        function prepareToHydrateHostInstance(fiber, hostContext) {
          if (!supportsHydration) throw Error(formatProdErrorMessage(175));
          hydrateInstance(
            fiber.stateNode,
            fiber.type,
            fiber.memoizedProps,
            hostContext,
            fiber
          ) || throwOnHydrationMismatch(fiber);
        }
        function popToNextHostParent(fiber) {
          for (hydrationParentFiber = fiber.return; hydrationParentFiber; )
            switch (hydrationParentFiber.tag) {
              case 3:
              case 27:
                rootOrSingletonContext = true;
                return;
              case 5:
              case 13:
                rootOrSingletonContext = false;
                return;
              default:
                hydrationParentFiber = hydrationParentFiber.return;
            }
        }
        function popHydrationState(fiber) {
          if (!supportsHydration || fiber !== hydrationParentFiber) return false;
          if (!isHydrating) return popToNextHostParent(fiber), isHydrating = true, false;
          var shouldClear = false;
          supportsSingletons ? 3 !== fiber.tag && 27 !== fiber.tag && (5 !== fiber.tag || shouldDeleteUnhydratedTailInstances(fiber.type) && !shouldSetTextContent(fiber.type, fiber.memoizedProps)) && (shouldClear = true) : 3 !== fiber.tag && (5 !== fiber.tag || shouldDeleteUnhydratedTailInstances(fiber.type) && !shouldSetTextContent(fiber.type, fiber.memoizedProps)) && (shouldClear = true);
          shouldClear && nextHydratableInstance && throwOnHydrationMismatch(fiber);
          popToNextHostParent(fiber);
          if (13 === fiber.tag) {
            if (!supportsHydration) throw Error(formatProdErrorMessage(316));
            fiber = fiber.memoizedState;
            fiber = null !== fiber ? fiber.dehydrated : null;
            if (!fiber) throw Error(formatProdErrorMessage(317));
            nextHydratableInstance = getNextHydratableInstanceAfterSuspenseInstance(fiber);
          } else
            nextHydratableInstance = hydrationParentFiber ? getNextHydratableSibling(fiber.stateNode) : null;
          return true;
        }
        function resetHydrationState() {
          supportsHydration && (nextHydratableInstance = hydrationParentFiber = null, isHydrating = false);
        }
        function queueHydrationError(error) {
          null === hydrationErrors ? hydrationErrors = [error] : hydrationErrors.push(error);
        }
        function finishQueueingConcurrentUpdates() {
          for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0; i < endIndex; ) {
            var fiber = concurrentQueues[i];
            concurrentQueues[i++] = null;
            var queue = concurrentQueues[i];
            concurrentQueues[i++] = null;
            var update = concurrentQueues[i];
            concurrentQueues[i++] = null;
            var lane = concurrentQueues[i];
            concurrentQueues[i++] = null;
            if (null !== queue && null !== update) {
              var pending = queue.pending;
              null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
              queue.pending = update;
            }
            0 !== lane && markUpdateLaneFromFiberToRoot(fiber, update, lane);
          }
        }
        function enqueueUpdate$1(fiber, queue, update, lane) {
          concurrentQueues[concurrentQueuesIndex++] = fiber;
          concurrentQueues[concurrentQueuesIndex++] = queue;
          concurrentQueues[concurrentQueuesIndex++] = update;
          concurrentQueues[concurrentQueuesIndex++] = lane;
          concurrentlyUpdatedLanes |= lane;
          fiber.lanes |= lane;
          fiber = fiber.alternate;
          null !== fiber && (fiber.lanes |= lane);
        }
        function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
          enqueueUpdate$1(fiber, queue, update, lane);
          return getRootForUpdatedFiber(fiber);
        }
        function enqueueConcurrentRenderForLane(fiber, lane) {
          enqueueUpdate$1(fiber, null, null, lane);
          return getRootForUpdatedFiber(fiber);
        }
        function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
          sourceFiber.lanes |= lane;
          var alternate = sourceFiber.alternate;
          null !== alternate && (alternate.lanes |= lane);
          for (var isHidden = false, parent = sourceFiber.return; null !== parent; )
            parent.childLanes |= lane, alternate = parent.alternate, null !== alternate && (alternate.childLanes |= lane), 22 === parent.tag && (sourceFiber = parent.stateNode, null === sourceFiber || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
          isHidden && null !== update && 3 === sourceFiber.tag && (parent = sourceFiber.stateNode, isHidden = 31 - clz32(lane), parent = parent.hiddenUpdates, sourceFiber = parent[isHidden], null === sourceFiber ? parent[isHidden] = [update] : sourceFiber.push(update), update.lane = lane | 536870912);
        }
        function getRootForUpdatedFiber(sourceFiber) {
          if (50 < nestedUpdateCount)
            throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
          for (var parent = sourceFiber.return; null !== parent; )
            sourceFiber = parent, parent = sourceFiber.return;
          return 3 === sourceFiber.tag ? sourceFiber.stateNode : null;
        }
        function ensureRootIsScheduled(root) {
          root !== lastScheduledRoot && null === root.next && (null === lastScheduledRoot ? firstScheduledRoot = lastScheduledRoot = root : lastScheduledRoot = lastScheduledRoot.next = root);
          mightHavePendingSyncWork = true;
          didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateTask(processRootScheduleInMicrotask));
        }
        function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
          if (!isFlushingWork && mightHavePendingSyncWork) {
            isFlushingWork = true;
            do {
              var didPerformSomeWork = false;
              for (var root = firstScheduledRoot; null !== root; ) {
                if (0 !== syncTransitionLanes) {
                  var pendingLanes = root.pendingLanes;
                  if (0 === pendingLanes) var JSCompiler_inline_result = 0;
                  else {
                    var suspendedLanes = root.suspendedLanes, pingedLanes = root.pingedLanes;
                    JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                    JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                    JSCompiler_inline_result = JSCompiler_inline_result & 201326677 ? JSCompiler_inline_result & 201326677 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
                  }
                  0 !== JSCompiler_inline_result && (didPerformSomeWork = true, performSyncWorkOnRoot(root, JSCompiler_inline_result));
                } else
                  JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(
                    root,
                    root === workInProgressRoot ? JSCompiler_inline_result : 0
                  ), 0 === (JSCompiler_inline_result & 3) || checkIfRootIsPrerendering(root, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root, JSCompiler_inline_result));
                root = root.next;
              }
            } while (didPerformSomeWork);
            isFlushingWork = false;
          }
        }
        function processRootScheduleInMicrotask() {
          mightHavePendingSyncWork = didScheduleMicrotask = false;
          var syncTransitionLanes = 0;
          0 !== currentEventTransitionLane && (shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane), currentEventTransitionLane = 0);
          for (var currentTime = now(), prev = null, root = firstScheduledRoot; null !== root; ) {
            var next = root.next, nextLanes = scheduleTaskForRootDuringMicrotask(root, currentTime);
            if (0 === nextLanes)
              root.next = null, null === prev ? firstScheduledRoot = next : prev.next = next, null === next && (lastScheduledRoot = prev);
            else if (prev = root, 0 !== syncTransitionLanes || 0 !== (nextLanes & 3))
              mightHavePendingSyncWork = true;
            root = next;
          }
          flushSyncWorkAcrossRoots_impl(syncTransitionLanes);
        }
        function scheduleTaskForRootDuringMicrotask(root, currentTime) {
          for (var suspendedLanes = root.suspendedLanes, pingedLanes = root.pingedLanes, expirationTimes = root.expirationTimes, lanes = root.pendingLanes & -62914561; 0 < lanes; ) {
            var index$5 = 31 - clz32(lanes), lane = 1 << index$5, expirationTime = expirationTimes[index$5];
            if (-1 === expirationTime) {
              if (0 === (lane & suspendedLanes) || 0 !== (lane & pingedLanes))
                expirationTimes[index$5] = computeExpirationTime(lane, currentTime);
            } else expirationTime <= currentTime && (root.expiredLanes |= lane);
            lanes &= ~lane;
          }
          currentTime = workInProgressRoot;
          suspendedLanes = workInProgressRootRenderLanes;
          suspendedLanes = getNextLanes(
            root,
            root === currentTime ? suspendedLanes : 0
          );
          pingedLanes = root.callbackNode;
          if (0 === suspendedLanes || root === currentTime && 2 === workInProgressSuspendedReason || null !== root.cancelPendingCommit)
            return null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes), root.callbackNode = null, root.callbackPriority = 0;
          if (0 === (suspendedLanes & 3) || checkIfRootIsPrerendering(root, suspendedLanes)) {
            currentTime = suspendedLanes & -suspendedLanes;
            if (currentTime === root.callbackPriority) return currentTime;
            null !== pingedLanes && cancelCallback$1(pingedLanes);
            switch (lanesToEventPriority(suspendedLanes)) {
              case 2:
              case 8:
                suspendedLanes = UserBlockingPriority;
                break;
              case 32:
                suspendedLanes = NormalPriority$1;
                break;
              case 268435456:
                suspendedLanes = IdlePriority;
                break;
              default:
                suspendedLanes = NormalPriority$1;
            }
            pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root);
            suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
            root.callbackPriority = currentTime;
            root.callbackNode = suspendedLanes;
            return currentTime;
          }
          null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes);
          root.callbackPriority = 2;
          root.callbackNode = null;
          return 2;
        }
        function performWorkOnRootViaSchedulerTask(root, didTimeout) {
          var originalCallbackNode = root.callbackNode;
          if (flushPassiveEffects() && root.callbackNode !== originalCallbackNode)
            return null;
          var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
          workInProgressRootRenderLanes$jscomp$0 = getNextLanes(
            root,
            root === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0
          );
          if (0 === workInProgressRootRenderLanes$jscomp$0) return null;
          performWorkOnRoot(root, workInProgressRootRenderLanes$jscomp$0, didTimeout);
          scheduleTaskForRootDuringMicrotask(root, now());
          return null != root.callbackNode && root.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root) : null;
        }
        function performSyncWorkOnRoot(root, lanes) {
          if (flushPassiveEffects()) return null;
          performWorkOnRoot(root, lanes, true);
        }
        function scheduleImmediateTask(cb) {
          supportsMicrotasks ? scheduleMicrotask(function() {
            0 !== (executionContext & 6) ? scheduleCallback$3(ImmediatePriority, cb) : cb();
          }) : scheduleCallback$3(ImmediatePriority, cb);
        }
        function requestTransitionLane() {
          0 === currentEventTransitionLane && (currentEventTransitionLane = claimNextTransitionLane());
          return currentEventTransitionLane;
        }
        function entangleAsyncAction(transition, thenable) {
          if (null === currentEntangledListeners) {
            var entangledListeners = currentEntangledListeners = [];
            currentEntangledPendingCount = 0;
            currentEntangledLane = requestTransitionLane();
            currentEntangledActionThenable = {
              status: "pending",
              value: void 0,
              then: function(resolve) {
                entangledListeners.push(resolve);
              }
            };
          }
          currentEntangledPendingCount++;
          thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
          return thenable;
        }
        function pingEngtangledActionScope() {
          if (0 === --currentEntangledPendingCount && null !== currentEntangledListeners) {
            null !== currentEntangledActionThenable && (currentEntangledActionThenable.status = "fulfilled");
            var listeners2 = currentEntangledListeners;
            currentEntangledListeners = null;
            currentEntangledLane = 0;
            currentEntangledActionThenable = null;
            for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])();
          }
        }
        function chainThenableValue(thenable, result) {
          var listeners2 = [], thenableWithOverride = {
            status: "pending",
            value: null,
            reason: null,
            then: function(resolve) {
              listeners2.push(resolve);
            }
          };
          thenable.then(
            function() {
              thenableWithOverride.status = "fulfilled";
              thenableWithOverride.value = result;
              for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])(result);
            },
            function(error) {
              thenableWithOverride.status = "rejected";
              thenableWithOverride.reason = error;
              for (error = 0; error < listeners2.length; error++)
                (0, listeners2[error])(void 0);
            }
          );
          return thenableWithOverride;
        }
        function initializeUpdateQueue(fiber) {
          fiber.updateQueue = {
            baseState: fiber.memoizedState,
            firstBaseUpdate: null,
            lastBaseUpdate: null,
            shared: { pending: null, lanes: 0, hiddenCallbacks: null },
            callbacks: null
          };
        }
        function cloneUpdateQueue(current, workInProgress2) {
          current = current.updateQueue;
          workInProgress2.updateQueue === current && (workInProgress2.updateQueue = {
            baseState: current.baseState,
            firstBaseUpdate: current.firstBaseUpdate,
            lastBaseUpdate: current.lastBaseUpdate,
            shared: current.shared,
            callbacks: null
          });
        }
        function createUpdate(lane) {
          return { lane, tag: 0, payload: null, callback: null, next: null };
        }
        function enqueueUpdate(fiber, update, lane) {
          var updateQueue = fiber.updateQueue;
          if (null === updateQueue) return null;
          updateQueue = updateQueue.shared;
          if (0 !== (executionContext & 2)) {
            var pending = updateQueue.pending;
            null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
            updateQueue.pending = update;
            update = getRootForUpdatedFiber(fiber);
            markUpdateLaneFromFiberToRoot(fiber, null, lane);
            return update;
          }
          enqueueUpdate$1(fiber, updateQueue, update, lane);
          return getRootForUpdatedFiber(fiber);
        }
        function entangleTransitions(root, fiber, lane) {
          fiber = fiber.updateQueue;
          if (null !== fiber && (fiber = fiber.shared, 0 !== (lane & 4194176))) {
            var queueLanes = fiber.lanes;
            queueLanes &= root.pendingLanes;
            lane |= queueLanes;
            fiber.lanes = lane;
            markRootEntangled(root, lane);
          }
        }
        function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
          var queue = workInProgress2.updateQueue, current = workInProgress2.alternate;
          if (null !== current && (current = current.updateQueue, queue === current)) {
            var newFirst = null, newLast = null;
            queue = queue.firstBaseUpdate;
            if (null !== queue) {
              do {
                var clone = {
                  lane: queue.lane,
                  tag: queue.tag,
                  payload: queue.payload,
                  callback: null,
                  next: null
                };
                null === newLast ? newFirst = newLast = clone : newLast = newLast.next = clone;
                queue = queue.next;
              } while (null !== queue);
              null === newLast ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
            } else newFirst = newLast = capturedUpdate;
            queue = {
              baseState: current.baseState,
              firstBaseUpdate: newFirst,
              lastBaseUpdate: newLast,
              shared: current.shared,
              callbacks: current.callbacks
            };
            workInProgress2.updateQueue = queue;
            return;
          }
          workInProgress2 = queue.lastBaseUpdate;
          null === workInProgress2 ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
          queue.lastBaseUpdate = capturedUpdate;
        }
        function suspendIfUpdateReadFromEntangledAsyncAction() {
          if (didReadFromEntangledAsyncAction) {
            var entangledActionThenable = currentEntangledActionThenable;
            if (null !== entangledActionThenable) throw entangledActionThenable;
          }
        }
        function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes2) {
          didReadFromEntangledAsyncAction = false;
          var queue = workInProgress$jscomp$0.updateQueue;
          hasForceUpdate = false;
          var firstBaseUpdate = queue.firstBaseUpdate, lastBaseUpdate = queue.lastBaseUpdate, pendingQueue = queue.shared.pending;
          if (null !== pendingQueue) {
            queue.shared.pending = null;
            var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
            lastPendingUpdate.next = null;
            null === lastBaseUpdate ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
            lastBaseUpdate = lastPendingUpdate;
            var current = workInProgress$jscomp$0.alternate;
            null !== current && (current = current.updateQueue, pendingQueue = current.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (null === pendingQueue ? current.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current.lastBaseUpdate = lastPendingUpdate));
          }
          if (null !== firstBaseUpdate) {
            var newState = queue.baseState;
            lastBaseUpdate = 0;
            current = firstPendingUpdate = lastPendingUpdate = null;
            pendingQueue = firstBaseUpdate;
            do {
              var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
              if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
                0 !== updateLane && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
                null !== current && (current = current.next = {
                  lane: 0,
                  tag: pendingQueue.tag,
                  payload: pendingQueue.payload,
                  callback: null,
                  next: null
                });
                a: {
                  var workInProgress2 = workInProgress$jscomp$0, update = pendingQueue;
                  updateLane = props;
                  var instance = instance$jscomp$0;
                  switch (update.tag) {
                    case 1:
                      workInProgress2 = update.payload;
                      if ("function" === typeof workInProgress2) {
                        newState = workInProgress2.call(
                          instance,
                          newState,
                          updateLane
                        );
                        break a;
                      }
                      newState = workInProgress2;
                      break a;
                    case 3:
                      workInProgress2.flags = workInProgress2.flags & -65537 | 128;
                    case 0:
                      workInProgress2 = update.payload;
                      updateLane = "function" === typeof workInProgress2 ? workInProgress2.call(instance, newState, updateLane) : workInProgress2;
                      if (null === updateLane || void 0 === updateLane) break a;
                      newState = assign({}, newState, updateLane);
                      break a;
                    case 2:
                      hasForceUpdate = true;
                  }
                }
                updateLane = pendingQueue.callback;
                null !== updateLane && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, null === isHiddenUpdate ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
              } else
                isHiddenUpdate = {
                  lane: updateLane,
                  tag: pendingQueue.tag,
                  payload: pendingQueue.payload,
                  callback: pendingQueue.callback,
                  next: null
                }, null === current ? (firstPendingUpdate = current = isHiddenUpdate, lastPendingUpdate = newState) : current = current.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
              pendingQueue = pendingQueue.next;
              if (null === pendingQueue)
                if (pendingQueue = queue.shared.pending, null === pendingQueue)
                  break;
                else
                  isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
            } while (1);
            null === current && (lastPendingUpdate = newState);
            queue.baseState = lastPendingUpdate;
            queue.firstBaseUpdate = firstPendingUpdate;
            queue.lastBaseUpdate = current;
            null === firstBaseUpdate && (queue.shared.lanes = 0);
            workInProgressRootSkippedLanes |= lastBaseUpdate;
            workInProgress$jscomp$0.lanes = lastBaseUpdate;
            workInProgress$jscomp$0.memoizedState = newState;
          }
        }
        function callCallback(callback, context) {
          if ("function" !== typeof callback)
            throw Error(formatProdErrorMessage(191, callback));
          callback.call(context);
        }
        function commitCallbacks(updateQueue, context) {
          var callbacks = updateQueue.callbacks;
          if (null !== callbacks)
            for (updateQueue.callbacks = null, updateQueue = 0; updateQueue < callbacks.length; updateQueue++)
              callCallback(callbacks[updateQueue], context);
        }
        function shallowEqual(objA, objB) {
          if (objectIs(objA, objB)) return true;
          if ("object" !== typeof objA || null === objA || "object" !== typeof objB || null === objB)
            return false;
          var keysA = Object.keys(objA), keysB = Object.keys(objB);
          if (keysA.length !== keysB.length) return false;
          for (keysB = 0; keysB < keysA.length; keysB++) {
            var currentKey = keysA[keysB];
            if (!hasOwnProperty.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
              return false;
          }
          return true;
        }
        function isThenableResolved(thenable) {
          thenable = thenable.status;
          return "fulfilled" === thenable || "rejected" === thenable;
        }
        function noop$1() {
        }
        function trackUsedThenable(thenableState2, thenable, index) {
          index = thenableState2[index];
          void 0 === index ? thenableState2.push(thenable) : index !== thenable && (thenable.then(noop$1, noop$1), thenable = index);
          switch (thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              thenableState2 = thenable.reason;
              if (thenableState2 === SuspenseException)
                throw Error(formatProdErrorMessage(483));
              throw thenableState2;
            default:
              if ("string" === typeof thenable.status) thenable.then(noop$1, noop$1);
              else {
                thenableState2 = workInProgressRoot;
                if (null !== thenableState2 && 100 < thenableState2.shellSuspendCounter)
                  throw Error(formatProdErrorMessage(482));
                thenableState2 = thenable;
                thenableState2.status = "pending";
                thenableState2.then(
                  function(fulfilledValue) {
                    if ("pending" === thenable.status) {
                      var fulfilledThenable = thenable;
                      fulfilledThenable.status = "fulfilled";
                      fulfilledThenable.value = fulfilledValue;
                    }
                  },
                  function(error) {
                    if ("pending" === thenable.status) {
                      var rejectedThenable = thenable;
                      rejectedThenable.status = "rejected";
                      rejectedThenable.reason = error;
                    }
                  }
                );
              }
              switch (thenable.status) {
                case "fulfilled":
                  return thenable.value;
                case "rejected":
                  thenableState2 = thenable.reason;
                  if (thenableState2 === SuspenseException)
                    throw Error(formatProdErrorMessage(483));
                  throw thenableState2;
              }
              suspendedThenable = thenable;
              throw SuspenseException;
          }
        }
        function getSuspendedThenable() {
          if (null === suspendedThenable) throw Error(formatProdErrorMessage(459));
          var thenable = suspendedThenable;
          suspendedThenable = null;
          return thenable;
        }
        function unwrapThenable(thenable) {
          var index = thenableIndexCounter$1;
          thenableIndexCounter$1 += 1;
          null === thenableState$1 && (thenableState$1 = []);
          return trackUsedThenable(thenableState$1, thenable, index);
        }
        function coerceRef(workInProgress2, element) {
          element = element.props.ref;
          workInProgress2.ref = void 0 !== element ? element : null;
        }
        function throwOnInvalidObjectType(returnFiber, newChild) {
          if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
            throw Error(formatProdErrorMessage(525));
          returnFiber = Object.prototype.toString.call(newChild);
          throw Error(
            formatProdErrorMessage(
              31,
              "[object Object]" === returnFiber ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber
            )
          );
        }
        function resolveLazy(lazyType) {
          var init = lazyType._init;
          return init(lazyType._payload);
        }
        function createChildReconciler(shouldTrackSideEffects) {
          function deleteChild(returnFiber, childToDelete) {
            if (shouldTrackSideEffects) {
              var deletions = returnFiber.deletions;
              null === deletions ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
            }
          }
          function deleteRemainingChildren(returnFiber, currentFirstChild) {
            if (!shouldTrackSideEffects) return null;
            for (; null !== currentFirstChild; )
              deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
            return null;
          }
          function mapRemainingChildren(currentFirstChild) {
            for (var existingChildren = /* @__PURE__ */ new Map(); null !== currentFirstChild; )
              null !== currentFirstChild.key ? existingChildren.set(currentFirstChild.key, currentFirstChild) : existingChildren.set(currentFirstChild.index, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
            return existingChildren;
          }
          function useFiber(fiber, pendingProps) {
            fiber = createWorkInProgress(fiber, pendingProps);
            fiber.index = 0;
            fiber.sibling = null;
            return fiber;
          }
          function placeChild(newFiber, lastPlacedIndex, newIndex) {
            newFiber.index = newIndex;
            if (!shouldTrackSideEffects)
              return newFiber.flags |= 1048576, lastPlacedIndex;
            newIndex = newFiber.alternate;
            if (null !== newIndex)
              return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 33554434, lastPlacedIndex) : newIndex;
            newFiber.flags |= 33554434;
            return lastPlacedIndex;
          }
          function placeSingleChild(newFiber) {
            shouldTrackSideEffects && null === newFiber.alternate && (newFiber.flags |= 33554434);
            return newFiber;
          }
          function updateTextNode(returnFiber, current, textContent, lanes) {
            if (null === current || 6 !== current.tag)
              return current = createFiberFromText(textContent, returnFiber.mode, lanes), current.return = returnFiber, current;
            current = useFiber(current, textContent);
            current.return = returnFiber;
            return current;
          }
          function updateElement(returnFiber, current, element, lanes) {
            var elementType = element.type;
            if (elementType === REACT_FRAGMENT_TYPE)
              return updateFragment(
                returnFiber,
                current,
                element.props.children,
                lanes,
                element.key
              );
            if (null !== current && (current.elementType === elementType || "object" === typeof elementType && null !== elementType && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type))
              return current = useFiber(current, element.props), coerceRef(current, element), current.return = returnFiber, current;
            current = createFiberFromTypeAndProps(
              element.type,
              element.key,
              element.props,
              null,
              returnFiber.mode,
              lanes
            );
            coerceRef(current, element);
            current.return = returnFiber;
            return current;
          }
          function updatePortal(returnFiber, current, portal, lanes) {
            if (null === current || 4 !== current.tag || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation)
              return current = createFiberFromPortal(portal, returnFiber.mode, lanes), current.return = returnFiber, current;
            current = useFiber(current, portal.children || []);
            current.return = returnFiber;
            return current;
          }
          function updateFragment(returnFiber, current, fragment, lanes, key) {
            if (null === current || 7 !== current.tag)
              return current = createFiberFromFragment(
                fragment,
                returnFiber.mode,
                lanes,
                key
              ), current.return = returnFiber, current;
            current = useFiber(current, fragment);
            current.return = returnFiber;
            return current;
          }
          function createChild(returnFiber, newChild, lanes) {
            if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
              return newChild = createFiberFromText(
                "" + newChild,
                returnFiber.mode,
                lanes
              ), newChild.return = returnFiber, newChild;
            if ("object" === typeof newChild && null !== newChild) {
              switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                  return lanes = createFiberFromTypeAndProps(
                    newChild.type,
                    newChild.key,
                    newChild.props,
                    null,
                    returnFiber.mode,
                    lanes
                  ), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
                case REACT_PORTAL_TYPE:
                  return newChild = createFiberFromPortal(
                    newChild,
                    returnFiber.mode,
                    lanes
                  ), newChild.return = returnFiber, newChild;
                case REACT_LAZY_TYPE:
                  var init = newChild._init;
                  newChild = init(newChild._payload);
                  return createChild(returnFiber, newChild, lanes);
              }
              if (isArrayImpl(newChild) || getIteratorFn(newChild))
                return newChild = createFiberFromFragment(
                  newChild,
                  returnFiber.mode,
                  lanes,
                  null
                ), newChild.return = returnFiber, newChild;
              if ("function" === typeof newChild.then)
                return createChild(returnFiber, unwrapThenable(newChild), lanes);
              if (newChild.$$typeof === REACT_CONTEXT_TYPE)
                return createChild(
                  returnFiber,
                  readContextDuringReconciliation(returnFiber, newChild),
                  lanes
                );
              throwOnInvalidObjectType(returnFiber, newChild);
            }
            return null;
          }
          function updateSlot(returnFiber, oldFiber, newChild, lanes) {
            var key = null !== oldFiber ? oldFiber.key : null;
            if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
              return null !== key ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
            if ("object" === typeof newChild && null !== newChild) {
              switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                  return newChild.key === key ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
                case REACT_PORTAL_TYPE:
                  return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
                case REACT_LAZY_TYPE:
                  return key = newChild._init, newChild = key(newChild._payload), updateSlot(returnFiber, oldFiber, newChild, lanes);
              }
              if (isArrayImpl(newChild) || getIteratorFn(newChild))
                return null !== key ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
              if ("function" === typeof newChild.then)
                return updateSlot(
                  returnFiber,
                  oldFiber,
                  unwrapThenable(newChild),
                  lanes
                );
              if (newChild.$$typeof === REACT_CONTEXT_TYPE)
                return updateSlot(
                  returnFiber,
                  oldFiber,
                  readContextDuringReconciliation(returnFiber, newChild),
                  lanes
                );
              throwOnInvalidObjectType(returnFiber, newChild);
            }
            return null;
          }
          function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
            if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
              return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
            if ("object" === typeof newChild && null !== newChild) {
              switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                  return existingChildren = existingChildren.get(
                    null === newChild.key ? newIdx : newChild.key
                  ) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
                case REACT_PORTAL_TYPE:
                  return existingChildren = existingChildren.get(
                    null === newChild.key ? newIdx : newChild.key
                  ) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
                case REACT_LAZY_TYPE:
                  var init = newChild._init;
                  newChild = init(newChild._payload);
                  return updateFromMap(
                    existingChildren,
                    returnFiber,
                    newIdx,
                    newChild,
                    lanes
                  );
              }
              if (isArrayImpl(newChild) || getIteratorFn(newChild))
                return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
              if ("function" === typeof newChild.then)
                return updateFromMap(
                  existingChildren,
                  returnFiber,
                  newIdx,
                  unwrapThenable(newChild),
                  lanes
                );
              if (newChild.$$typeof === REACT_CONTEXT_TYPE)
                return updateFromMap(
                  existingChildren,
                  returnFiber,
                  newIdx,
                  readContextDuringReconciliation(returnFiber, newChild),
                  lanes
                );
              throwOnInvalidObjectType(returnFiber, newChild);
            }
            return null;
          }
          function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
            for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null; null !== oldFiber && newIdx < newChildren.length; newIdx++) {
              oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
              var newFiber = updateSlot(
                returnFiber,
                oldFiber,
                newChildren[newIdx],
                lanes
              );
              if (null === newFiber) {
                null === oldFiber && (oldFiber = nextOldFiber);
                break;
              }
              shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
              currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
              null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
              previousNewFiber = newFiber;
              oldFiber = nextOldFiber;
            }
            if (newIdx === newChildren.length)
              return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
            if (null === oldFiber) {
              for (; newIdx < newChildren.length; newIdx++)
                oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), null !== oldFiber && (currentFirstChild = placeChild(
                  oldFiber,
                  currentFirstChild,
                  newIdx
                ), null === previousNewFiber ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
              isHydrating && pushTreeFork(returnFiber, newIdx);
              return resultingFirstChild;
            }
            for (oldFiber = mapRemainingChildren(oldFiber); newIdx < newChildren.length; newIdx++)
              nextOldFiber = updateFromMap(
                oldFiber,
                returnFiber,
                newIdx,
                newChildren[newIdx],
                lanes
              ), null !== nextOldFiber && (shouldTrackSideEffects && null !== nextOldFiber.alternate && oldFiber.delete(
                null === nextOldFiber.key ? newIdx : nextOldFiber.key
              ), currentFirstChild = placeChild(
                nextOldFiber,
                currentFirstChild,
                newIdx
              ), null === previousNewFiber ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
            shouldTrackSideEffects && oldFiber.forEach(function(child) {
              return deleteChild(returnFiber, child);
            });
            isHydrating && pushTreeFork(returnFiber, newIdx);
            return resultingFirstChild;
          }
          function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
            if (null == newChildren) throw Error(formatProdErrorMessage(151));
            for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next(); null !== oldFiber && !step.done; newIdx++, step = newChildren.next()) {
              oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
              var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
              if (null === newFiber) {
                null === oldFiber && (oldFiber = nextOldFiber);
                break;
              }
              shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
              currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
              null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
              previousNewFiber = newFiber;
              oldFiber = nextOldFiber;
            }
            if (step.done)
              return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
            if (null === oldFiber) {
              for (; !step.done; newIdx++, step = newChildren.next())
                step = createChild(returnFiber, step.value, lanes), null !== step && (currentFirstChild = placeChild(
                  step,
                  currentFirstChild,
                  newIdx
                ), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
              isHydrating && pushTreeFork(returnFiber, newIdx);
              return resultingFirstChild;
            }
            for (oldFiber = mapRemainingChildren(oldFiber); !step.done; newIdx++, step = newChildren.next())
              step = updateFromMap(
                oldFiber,
                returnFiber,
                newIdx,
                step.value,
                lanes
              ), null !== step && (shouldTrackSideEffects && null !== step.alternate && oldFiber.delete(null === step.key ? newIdx : step.key), currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
            shouldTrackSideEffects && oldFiber.forEach(function(child) {
              return deleteChild(returnFiber, child);
            });
            isHydrating && pushTreeFork(returnFiber, newIdx);
            return resultingFirstChild;
          }
          function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
            "object" === typeof newChild && null !== newChild && newChild.type === REACT_FRAGMENT_TYPE && null === newChild.key && (newChild = newChild.props.children);
            if ("object" === typeof newChild && null !== newChild) {
              switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                  a: {
                    for (var key = newChild.key; null !== currentFirstChild; ) {
                      if (currentFirstChild.key === key) {
                        key = newChild.type;
                        if (key === REACT_FRAGMENT_TYPE) {
                          if (7 === currentFirstChild.tag) {
                            deleteRemainingChildren(
                              returnFiber,
                              currentFirstChild.sibling
                            );
                            lanes = useFiber(
                              currentFirstChild,
                              newChild.props.children
                            );
                            lanes.return = returnFiber;
                            returnFiber = lanes;
                            break a;
                          }
                        } else if (currentFirstChild.elementType === key || "object" === typeof key && null !== key && key.$$typeof === REACT_LAZY_TYPE && resolveLazy(key) === currentFirstChild.type) {
                          deleteRemainingChildren(
                            returnFiber,
                            currentFirstChild.sibling
                          );
                          lanes = useFiber(currentFirstChild, newChild.props);
                          coerceRef(lanes, newChild);
                          lanes.return = returnFiber;
                          returnFiber = lanes;
                          break a;
                        }
                        deleteRemainingChildren(returnFiber, currentFirstChild);
                        break;
                      } else deleteChild(returnFiber, currentFirstChild);
                      currentFirstChild = currentFirstChild.sibling;
                    }
                    newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(
                      newChild.props.children,
                      returnFiber.mode,
                      lanes,
                      newChild.key
                    ), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(
                      newChild.type,
                      newChild.key,
                      newChild.props,
                      null,
                      returnFiber.mode,
                      lanes
                    ), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
                  }
                  return placeSingleChild(returnFiber);
                case REACT_PORTAL_TYPE:
                  a: {
                    for (key = newChild.key; null !== currentFirstChild; ) {
                      if (currentFirstChild.key === key)
                        if (4 === currentFirstChild.tag && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                          deleteRemainingChildren(
                            returnFiber,
                            currentFirstChild.sibling
                          );
                          lanes = useFiber(
                            currentFirstChild,
                            newChild.children || []
                          );
                          lanes.return = returnFiber;
                          returnFiber = lanes;
                          break a;
                        } else {
                          deleteRemainingChildren(returnFiber, currentFirstChild);
                          break;
                        }
                      else deleteChild(returnFiber, currentFirstChild);
                      currentFirstChild = currentFirstChild.sibling;
                    }
                    lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
                    lanes.return = returnFiber;
                    returnFiber = lanes;
                  }
                  return placeSingleChild(returnFiber);
                case REACT_LAZY_TYPE:
                  return key = newChild._init, newChild = key(newChild._payload), reconcileChildFibersImpl(
                    returnFiber,
                    currentFirstChild,
                    newChild,
                    lanes
                  );
              }
              if (isArrayImpl(newChild))
                return reconcileChildrenArray(
                  returnFiber,
                  currentFirstChild,
                  newChild,
                  lanes
                );
              if (getIteratorFn(newChild)) {
                key = getIteratorFn(newChild);
                if ("function" !== typeof key)
                  throw Error(formatProdErrorMessage(150));
                newChild = key.call(newChild);
                return reconcileChildrenIterator(
                  returnFiber,
                  currentFirstChild,
                  newChild,
                  lanes
                );
              }
              if ("function" === typeof newChild.then)
                return reconcileChildFibersImpl(
                  returnFiber,
                  currentFirstChild,
                  unwrapThenable(newChild),
                  lanes
                );
              if (newChild.$$typeof === REACT_CONTEXT_TYPE)
                return reconcileChildFibersImpl(
                  returnFiber,
                  currentFirstChild,
                  readContextDuringReconciliation(returnFiber, newChild),
                  lanes
                );
              throwOnInvalidObjectType(returnFiber, newChild);
            }
            return "string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild ? (newChild = "" + newChild, null !== currentFirstChild && 6 === currentFirstChild.tag ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
          }
          return function(returnFiber, currentFirstChild, newChild, lanes) {
            try {
              thenableIndexCounter$1 = 0;
              var firstChildFiber = reconcileChildFibersImpl(
                returnFiber,
                currentFirstChild,
                newChild,
                lanes
              );
              thenableState$1 = null;
              return firstChildFiber;
            } catch (x) {
              if (x === SuspenseException) throw x;
              var fiber = createFiber(29, x, null, returnFiber.mode);
              fiber.lanes = lanes;
              fiber.return = returnFiber;
              return fiber;
            } finally {
            }
          };
        }
        function pushHiddenContext(fiber, context) {
          fiber = entangledRenderLanes;
          push(prevEntangledRenderLanesCursor, fiber);
          push(currentTreeHiddenStackCursor, context);
          entangledRenderLanes = fiber | context.baseLanes;
        }
        function reuseHiddenContextOnStack() {
          push(prevEntangledRenderLanesCursor, entangledRenderLanes);
          push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
        }
        function popHiddenContext() {
          entangledRenderLanes = prevEntangledRenderLanesCursor.current;
          pop(currentTreeHiddenStackCursor);
          pop(prevEntangledRenderLanesCursor);
        }
        function pushPrimaryTreeSuspenseHandler(handler) {
          var current = handler.alternate;
          push(suspenseStackCursor, suspenseStackCursor.current & 1);
          push(suspenseHandlerStackCursor, handler);
          null === shellBoundary && (null === current || null !== currentTreeHiddenStackCursor.current ? shellBoundary = handler : null !== current.memoizedState && (shellBoundary = handler));
        }
        function pushOffscreenSuspenseHandler(fiber) {
          if (22 === fiber.tag) {
            if (push(suspenseStackCursor, suspenseStackCursor.current), push(suspenseHandlerStackCursor, fiber), null === shellBoundary) {
              var current = fiber.alternate;
              null !== current && null !== current.memoizedState && (shellBoundary = fiber);
            }
          } else reuseSuspenseHandlerOnStack();
        }
        function reuseSuspenseHandlerOnStack() {
          push(suspenseStackCursor, suspenseStackCursor.current);
          push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
        }
        function popSuspenseHandler(fiber) {
          pop(suspenseHandlerStackCursor);
          shellBoundary === fiber && (shellBoundary = null);
          pop(suspenseStackCursor);
        }
        function findFirstSuspended(row) {
          for (var node = row; null !== node; ) {
            if (13 === node.tag) {
              var state = node.memoizedState;
              if (null !== state && (state = state.dehydrated, null === state || isSuspenseInstancePending(state) || isSuspenseInstanceFallback(state)))
                return node;
            } else if (19 === node.tag && void 0 !== node.memoizedProps.revealOrder) {
              if (0 !== (node.flags & 128)) return node;
            } else if (null !== node.child) {
              node.child.return = node;
              node = node.child;
              continue;
            }
            if (node === row) break;
            for (; null === node.sibling; ) {
              if (null === node.return || node.return === row) return null;
              node = node.return;
            }
            node.sibling.return = node.return;
            node = node.sibling;
          }
          return null;
        }
        function throwInvalidHookError() {
          throw Error(formatProdErrorMessage(321));
        }
        function areHookInputsEqual(nextDeps, prevDeps) {
          if (null === prevDeps) return false;
          for (var i = 0; i < prevDeps.length && i < nextDeps.length; i++)
            if (!objectIs(nextDeps[i], prevDeps[i])) return false;
          return true;
        }
        function renderWithHooks(current, workInProgress2, Component, props, secondArg, nextRenderLanes) {
          renderLanes = nextRenderLanes;
          currentlyRenderingFiber$1 = workInProgress2;
          workInProgress2.memoizedState = null;
          workInProgress2.updateQueue = null;
          workInProgress2.lanes = 0;
          ReactSharedInternals.H = null === current || null === current.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
          shouldDoubleInvokeUserFnsInHooksDEV = false;
          nextRenderLanes = Component(props, secondArg);
          shouldDoubleInvokeUserFnsInHooksDEV = false;
          didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(
            workInProgress2,
            Component,
            props,
            secondArg
          ));
          finishRenderingHooks(current);
          return nextRenderLanes;
        }
        function finishRenderingHooks(current) {
          ReactSharedInternals.H = ContextOnlyDispatcher;
          var didRenderTooFewHooks = null !== currentHook && null !== currentHook.next;
          renderLanes = 0;
          workInProgressHook = currentHook = currentlyRenderingFiber$1 = null;
          didScheduleRenderPhaseUpdate = false;
          thenableIndexCounter = 0;
          thenableState = null;
          if (didRenderTooFewHooks) throw Error(formatProdErrorMessage(300));
          null === current || didReceiveUpdate || (current = current.dependencies, null !== current && checkIfContextChanged(current) && (didReceiveUpdate = true));
        }
        function renderWithHooksAgain(workInProgress2, Component, props, secondArg) {
          currentlyRenderingFiber$1 = workInProgress2;
          var numberOfReRenders = 0;
          do {
            didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
            thenableIndexCounter = 0;
            didScheduleRenderPhaseUpdateDuringThisPass = false;
            if (25 <= numberOfReRenders) throw Error(formatProdErrorMessage(301));
            numberOfReRenders += 1;
            workInProgressHook = currentHook = null;
            if (null != workInProgress2.updateQueue) {
              var children = workInProgress2.updateQueue;
              children.lastEffect = null;
              children.events = null;
              children.stores = null;
              null != children.memoCache && (children.memoCache.index = 0);
            }
            ReactSharedInternals.H = HooksDispatcherOnRerender;
            children = Component(props, secondArg);
          } while (didScheduleRenderPhaseUpdateDuringThisPass);
          return children;
        }
        function TransitionAwareHostComponent() {
          var dispatcher = ReactSharedInternals.H, maybeThenable = dispatcher.useState()[0];
          maybeThenable = "function" === typeof maybeThenable.then ? useThenable(maybeThenable) : maybeThenable;
          dispatcher = dispatcher.useState()[0];
          (null !== currentHook ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber$1.flags |= 1024);
          return maybeThenable;
        }
        function checkDidRenderIdHook() {
          var didRenderIdHook = 0 !== localIdCounter;
          localIdCounter = 0;
          return didRenderIdHook;
        }
        function bailoutHooks(current, workInProgress2, lanes) {
          workInProgress2.updateQueue = current.updateQueue;
          workInProgress2.flags &= -2053;
          current.lanes &= ~lanes;
        }
        function resetHooksOnUnwind(workInProgress2) {
          if (didScheduleRenderPhaseUpdate) {
            for (workInProgress2 = workInProgress2.memoizedState; null !== workInProgress2; ) {
              var queue = workInProgress2.queue;
              null !== queue && (queue.pending = null);
              workInProgress2 = workInProgress2.next;
            }
            didScheduleRenderPhaseUpdate = false;
          }
          renderLanes = 0;
          workInProgressHook = currentHook = currentlyRenderingFiber$1 = null;
          didScheduleRenderPhaseUpdateDuringThisPass = false;
          thenableIndexCounter = localIdCounter = 0;
          thenableState = null;
        }
        function mountWorkInProgressHook() {
          var hook = {
            memoizedState: null,
            baseState: null,
            baseQueue: null,
            queue: null,
            next: null
          };
          null === workInProgressHook ? currentlyRenderingFiber$1.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
          return workInProgressHook;
        }
        function updateWorkInProgressHook() {
          if (null === currentHook) {
            var nextCurrentHook = currentlyRenderingFiber$1.alternate;
            nextCurrentHook = null !== nextCurrentHook ? nextCurrentHook.memoizedState : null;
          } else nextCurrentHook = currentHook.next;
          var nextWorkInProgressHook = null === workInProgressHook ? currentlyRenderingFiber$1.memoizedState : workInProgressHook.next;
          if (null !== nextWorkInProgressHook)
            workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
          else {
            if (null === nextCurrentHook) {
              if (null === currentlyRenderingFiber$1.alternate)
                throw Error(formatProdErrorMessage(467));
              throw Error(formatProdErrorMessage(310));
            }
            currentHook = nextCurrentHook;
            nextCurrentHook = {
              memoizedState: currentHook.memoizedState,
              baseState: currentHook.baseState,
              baseQueue: currentHook.baseQueue,
              queue: currentHook.queue,
              next: null
            };
            null === workInProgressHook ? currentlyRenderingFiber$1.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
          }
          return workInProgressHook;
        }
        function useThenable(thenable) {
          var index = thenableIndexCounter;
          thenableIndexCounter += 1;
          null === thenableState && (thenableState = []);
          thenable = trackUsedThenable(thenableState, thenable, index);
          index = currentlyRenderingFiber$1;
          null === (null === workInProgressHook ? index.memoizedState : workInProgressHook.next) && (index = index.alternate, ReactSharedInternals.H = null === index || null === index.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
          return thenable;
        }
        function use(usable) {
          if (null !== usable && "object" === typeof usable) {
            if ("function" === typeof usable.then) return useThenable(usable);
            if (usable.$$typeof === REACT_CONTEXT_TYPE) return readContext(usable);
          }
          throw Error(formatProdErrorMessage(438, String(usable)));
        }
        function useMemoCache(size) {
          var memoCache = null, updateQueue = currentlyRenderingFiber$1.updateQueue;
          null !== updateQueue && (memoCache = updateQueue.memoCache);
          if (null == memoCache) {
            var current = currentlyRenderingFiber$1.alternate;
            null !== current && (current = current.updateQueue, null !== current && (current = current.memoCache, null != current && (memoCache = {
              data: current.data.map(function(array) {
                return array.slice();
              }),
              index: 0
            })));
          }
          null == memoCache && (memoCache = { data: [], index: 0 });
          null === updateQueue && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber$1.updateQueue = updateQueue);
          updateQueue.memoCache = memoCache;
          updateQueue = memoCache.data[memoCache.index];
          if (void 0 === updateQueue)
            for (updateQueue = memoCache.data[memoCache.index] = Array(size), current = 0; current < size; current++)
              updateQueue[current] = REACT_MEMO_CACHE_SENTINEL;
          memoCache.index++;
          return updateQueue;
        }
        function basicStateReducer(state, action) {
          return "function" === typeof action ? action(state) : action;
        }
        function updateReducer(reducer) {
          var hook = updateWorkInProgressHook();
          return updateReducerImpl(hook, currentHook, reducer);
        }
        function updateReducerImpl(hook, current, reducer) {
          var queue = hook.queue;
          if (null === queue) throw Error(formatProdErrorMessage(311));
          queue.lastRenderedReducer = reducer;
          var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
          if (null !== pendingQueue) {
            if (null !== baseQueue) {
              var baseFirst = baseQueue.next;
              baseQueue.next = pendingQueue.next;
              pendingQueue.next = baseFirst;
            }
            current.baseQueue = baseQueue = pendingQueue;
            queue.pending = null;
          }
          pendingQueue = hook.baseState;
          if (null === baseQueue) hook.memoizedState = pendingQueue;
          else {
            current = baseQueue.next;
            var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current, didReadFromEntangledAsyncAction$48 = false;
            do {
              var updateLane = update.lane & -536870913;
              if (updateLane !== update.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
                var revertLane = update.revertLane;
                if (0 === revertLane)
                  null !== newBaseQueueLast && (newBaseQueueLast = newBaseQueueLast.next = {
                    lane: 0,
                    revertLane: 0,
                    action: update.action,
                    hasEagerState: update.hasEagerState,
                    eagerState: update.eagerState,
                    next: null
                  }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$48 = true);
                else if ((renderLanes & revertLane) === revertLane) {
                  update = update.next;
                  revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$48 = true);
                  continue;
                } else
                  updateLane = {
                    lane: 0,
                    revertLane: update.revertLane,
                    action: update.action,
                    hasEagerState: update.hasEagerState,
                    eagerState: update.eagerState,
                    next: null
                  }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber$1.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
                updateLane = update.action;
                shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
                pendingQueue = update.hasEagerState ? update.eagerState : reducer(pendingQueue, updateLane);
              } else
                revertLane = {
                  lane: updateLane,
                  revertLane: update.revertLane,
                  action: update.action,
                  hasEagerState: update.hasEagerState,
                  eagerState: update.eagerState,
                  next: null
                }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber$1.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
              update = update.next;
            } while (null !== update && update !== current);
            null === newBaseQueueLast ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
            if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$48 && (reducer = currentEntangledActionThenable, null !== reducer)))
              throw reducer;
            hook.memoizedState = pendingQueue;
            hook.baseState = baseFirst;
            hook.baseQueue = newBaseQueueLast;
            queue.lastRenderedState = pendingQueue;
          }
          null === baseQueue && (queue.lanes = 0);
          return [hook.memoizedState, queue.dispatch];
        }
        function rerenderReducer(reducer) {
          var hook = updateWorkInProgressHook(), queue = hook.queue;
          if (null === queue) throw Error(formatProdErrorMessage(311));
          queue.lastRenderedReducer = reducer;
          var dispatch = queue.dispatch, lastRenderPhaseUpdate = queue.pending, newState = hook.memoizedState;
          if (null !== lastRenderPhaseUpdate) {
            queue.pending = null;
            var update = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
            do
              newState = reducer(newState, update.action), update = update.next;
            while (update !== lastRenderPhaseUpdate);
            objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
            hook.memoizedState = newState;
            null === hook.baseQueue && (hook.baseState = newState);
            queue.lastRenderedState = newState;
          }
          return [newState, dispatch];
        }
        function updateSyncExternalStore(subscribe2, getSnapshot2, getServerSnapshot2) {
          var fiber = currentlyRenderingFiber$1, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
          if (isHydrating$jscomp$0) {
            if (void 0 === getServerSnapshot2)
              throw Error(formatProdErrorMessage(407));
            getServerSnapshot2 = getServerSnapshot2();
          } else getServerSnapshot2 = getSnapshot2();
          var snapshotChanged = !objectIs(
            (currentHook || hook).memoizedState,
            getServerSnapshot2
          );
          snapshotChanged && (hook.memoizedState = getServerSnapshot2, didReceiveUpdate = true);
          hook = hook.queue;
          updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe2), [
            subscribe2
          ]);
          if (hook.getSnapshot !== getSnapshot2 || snapshotChanged || null !== workInProgressHook && workInProgressHook.memoizedState.tag & 1) {
            fiber.flags |= 2048;
            pushEffect(
              9,
              updateStoreInstance.bind(
                null,
                fiber,
                hook,
                getServerSnapshot2,
                getSnapshot2
              ),
              { destroy: void 0 },
              null
            );
            if (null === workInProgressRoot) throw Error(formatProdErrorMessage(349));
            isHydrating$jscomp$0 || 0 !== (renderLanes & 60) || pushStoreConsistencyCheck(fiber, getSnapshot2, getServerSnapshot2);
          }
          return getServerSnapshot2;
        }
        function pushStoreConsistencyCheck(fiber, getSnapshot2, renderedSnapshot) {
          fiber.flags |= 16384;
          fiber = { getSnapshot: getSnapshot2, value: renderedSnapshot };
          getSnapshot2 = currentlyRenderingFiber$1.updateQueue;
          null === getSnapshot2 ? (getSnapshot2 = createFunctionComponentUpdateQueue(), currentlyRenderingFiber$1.updateQueue = getSnapshot2, getSnapshot2.stores = [fiber]) : (renderedSnapshot = getSnapshot2.stores, null === renderedSnapshot ? getSnapshot2.stores = [fiber] : renderedSnapshot.push(fiber));
        }
        function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot2) {
          inst.value = nextSnapshot;
          inst.getSnapshot = getSnapshot2;
          checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
        }
        function subscribeToStore(fiber, inst, subscribe2) {
          return subscribe2(function() {
            checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
          });
        }
        function checkIfSnapshotChanged(inst) {
          var latestGetSnapshot = inst.getSnapshot;
          inst = inst.value;
          try {
            var nextValue = latestGetSnapshot();
            return !objectIs(inst, nextValue);
          } catch (error) {
            return true;
          }
        }
        function forceStoreRerender(fiber) {
          var root = enqueueConcurrentRenderForLane(fiber, 2);
          null !== root && scheduleUpdateOnFiber(root, fiber, 2);
        }
        function mountStateImpl(initialState) {
          var hook = mountWorkInProgressHook();
          if ("function" === typeof initialState) {
            var initialStateInitializer = initialState;
            initialState = initialStateInitializer();
            if (shouldDoubleInvokeUserFnsInHooksDEV) {
              setIsStrictModeForDevtools(true);
              try {
                initialStateInitializer();
              } finally {
                setIsStrictModeForDevtools(false);
              }
            }
          }
          hook.memoizedState = hook.baseState = initialState;
          hook.queue = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: basicStateReducer,
            lastRenderedState: initialState
          };
          return hook;
        }
        function updateOptimisticImpl(hook, current, passthrough, reducer) {
          hook.baseState = passthrough;
          return updateReducerImpl(
            hook,
            currentHook,
            "function" === typeof reducer ? reducer : basicStateReducer
          );
        }
        function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
          if (isRenderPhaseUpdate(fiber)) throw Error(formatProdErrorMessage(485));
          fiber = actionQueue.action;
          if (null !== fiber) {
            var actionNode = {
              payload,
              action: fiber,
              next: null,
              isTransition: true,
              status: "pending",
              value: null,
              reason: null,
              listeners: [],
              then: function(listener) {
                actionNode.listeners.push(listener);
              }
            };
            null !== ReactSharedInternals.T ? setPendingState(true) : actionNode.isTransition = false;
            setState(actionNode);
            setPendingState = actionQueue.pending;
            null === setPendingState ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
          }
        }
        function runActionStateAction(actionQueue, node) {
          var action = node.action, payload = node.payload, prevState = actionQueue.state;
          if (node.isTransition) {
            var prevTransition = ReactSharedInternals.T, currentTransition = {};
            ReactSharedInternals.T = currentTransition;
            try {
              var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
              null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
              handleActionReturnValue(actionQueue, node, returnValue);
            } catch (error) {
              onActionError(actionQueue, node, error);
            } finally {
              ReactSharedInternals.T = prevTransition;
            }
          } else
            try {
              prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
            } catch (error$52) {
              onActionError(actionQueue, node, error$52);
            }
        }
        function handleActionReturnValue(actionQueue, node, returnValue) {
          null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then ? returnValue.then(
            function(nextState) {
              onActionSuccess(actionQueue, node, nextState);
            },
            function(error) {
              return onActionError(actionQueue, node, error);
            }
          ) : onActionSuccess(actionQueue, node, returnValue);
        }
        function onActionSuccess(actionQueue, actionNode, nextState) {
          actionNode.status = "fulfilled";
          actionNode.value = nextState;
          notifyActionListeners(actionNode);
          actionQueue.state = nextState;
          actionNode = actionQueue.pending;
          null !== actionNode && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
        }
        function onActionError(actionQueue, actionNode, error) {
          var last = actionQueue.pending;
          actionQueue.pending = null;
          if (null !== last) {
            last = last.next;
            do
              actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
            while (actionNode !== last);
          }
          actionQueue.action = null;
        }
        function notifyActionListeners(actionNode) {
          actionNode = actionNode.listeners;
          for (var i = 0; i < actionNode.length; i++) (0, actionNode[i])();
        }
        function actionStateReducer(oldState, newState) {
          return newState;
        }
        function mountActionState(action, initialStateProp) {
          if (isHydrating) {
            var ssrFormState = workInProgressRoot.formState;
            if (null !== ssrFormState) {
              a: {
                var JSCompiler_inline_result = currentlyRenderingFiber$1;
                if (isHydrating) {
                  if (nextHydratableInstance) {
                    var markerInstance = canHydrateFormStateMarker(
                      nextHydratableInstance,
                      rootOrSingletonContext
                    );
                    if (markerInstance) {
                      nextHydratableInstance = getNextHydratableSibling(markerInstance);
                      JSCompiler_inline_result = isFormStateMarkerMatching(markerInstance);
                      break a;
                    }
                  }
                  throwOnHydrationMismatch(JSCompiler_inline_result);
                }
                JSCompiler_inline_result = false;
              }
              JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
            }
          }
          ssrFormState = mountWorkInProgressHook();
          ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
          JSCompiler_inline_result = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: actionStateReducer,
            lastRenderedState: initialStateProp
          };
          ssrFormState.queue = JSCompiler_inline_result;
          ssrFormState = dispatchSetState.bind(
            null,
            currentlyRenderingFiber$1,
            JSCompiler_inline_result
          );
          JSCompiler_inline_result.dispatch = ssrFormState;
          JSCompiler_inline_result = mountStateImpl(false);
          var setPendingState = dispatchOptimisticSetState.bind(
            null,
            currentlyRenderingFiber$1,
            false,
            JSCompiler_inline_result.queue
          );
          JSCompiler_inline_result = mountWorkInProgressHook();
          markerInstance = {
            state: initialStateProp,
            dispatch: null,
            action,
            pending: null
          };
          JSCompiler_inline_result.queue = markerInstance;
          ssrFormState = dispatchActionState.bind(
            null,
            currentlyRenderingFiber$1,
            markerInstance,
            setPendingState,
            ssrFormState
          );
          markerInstance.dispatch = ssrFormState;
          JSCompiler_inline_result.memoizedState = action;
          return [initialStateProp, ssrFormState, false];
        }
        function updateActionState(action) {
          var stateHook = updateWorkInProgressHook();
          return updateActionStateImpl(stateHook, currentHook, action);
        }
        function updateActionStateImpl(stateHook, currentStateHook, action) {
          currentStateHook = updateReducerImpl(
            stateHook,
            currentStateHook,
            actionStateReducer
          )[0];
          stateHook = updateReducer(basicStateReducer)[0];
          currentStateHook = "object" === typeof currentStateHook && null !== currentStateHook && "function" === typeof currentStateHook.then ? useThenable(currentStateHook) : currentStateHook;
          var actionQueueHook = updateWorkInProgressHook(), actionQueue = actionQueueHook.queue, dispatch = actionQueue.dispatch;
          action !== actionQueueHook.memoizedState && (currentlyRenderingFiber$1.flags |= 2048, pushEffect(
            9,
            actionStateActionEffect.bind(null, actionQueue, action),
            { destroy: void 0 },
            null
          ));
          return [currentStateHook, dispatch, stateHook];
        }
        function actionStateActionEffect(actionQueue, action) {
          actionQueue.action = action;
        }
        function rerenderActionState(action) {
          var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
          if (null !== currentStateHook)
            return updateActionStateImpl(stateHook, currentStateHook, action);
          updateWorkInProgressHook();
          stateHook = stateHook.memoizedState;
          currentStateHook = updateWorkInProgressHook();
          var dispatch = currentStateHook.queue.dispatch;
          currentStateHook.memoizedState = action;
          return [stateHook, dispatch, false];
        }
        function pushEffect(tag, create, inst, deps) {
          tag = { tag, create, inst, deps, next: null };
          create = currentlyRenderingFiber$1.updateQueue;
          null === create && (create = createFunctionComponentUpdateQueue(), currentlyRenderingFiber$1.updateQueue = create);
          inst = create.lastEffect;
          null === inst ? create.lastEffect = tag.next = tag : (deps = inst.next, inst.next = tag, tag.next = deps, create.lastEffect = tag);
          return tag;
        }
        function updateRef() {
          return updateWorkInProgressHook().memoizedState;
        }
        function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
          var hook = mountWorkInProgressHook();
          currentlyRenderingFiber$1.flags |= fiberFlags;
          hook.memoizedState = pushEffect(
            1 | hookFlags,
            create,
            { destroy: void 0 },
            void 0 === deps ? null : deps
          );
        }
        function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
          var hook = updateWorkInProgressHook();
          deps = void 0 === deps ? null : deps;
          var inst = hook.memoizedState.inst;
          null !== currentHook && null !== deps && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushEffect(hookFlags, create, inst, deps) : (currentlyRenderingFiber$1.flags |= fiberFlags, hook.memoizedState = pushEffect(1 | hookFlags, create, inst, deps));
        }
        function mountEffect(create, deps) {
          mountEffectImpl(8390656, 8, create, deps);
        }
        function updateEffect(create, deps) {
          updateEffectImpl(2048, 8, create, deps);
        }
        function updateInsertionEffect(create, deps) {
          return updateEffectImpl(4, 2, create, deps);
        }
        function updateLayoutEffect(create, deps) {
          return updateEffectImpl(4, 4, create, deps);
        }
        function imperativeHandleEffect(create, ref) {
          if ("function" === typeof ref) {
            create = create();
            var refCleanup = ref(create);
            return function() {
              "function" === typeof refCleanup ? refCleanup() : ref(null);
            };
          }
          if (null !== ref && void 0 !== ref)
            return create = create(), ref.current = create, function() {
              ref.current = null;
            };
        }
        function updateImperativeHandle(ref, create, deps) {
          deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
          updateEffectImpl(
            4,
            4,
            imperativeHandleEffect.bind(null, create, ref),
            deps
          );
        }
        function mountDebugValue() {
        }
        function updateCallback(callback, deps) {
          var hook = updateWorkInProgressHook();
          deps = void 0 === deps ? null : deps;
          var prevState = hook.memoizedState;
          if (null !== deps && areHookInputsEqual(deps, prevState[1]))
            return prevState[0];
          hook.memoizedState = [callback, deps];
          return callback;
        }
        function updateMemo(nextCreate, deps) {
          var hook = updateWorkInProgressHook();
          deps = void 0 === deps ? null : deps;
          var prevState = hook.memoizedState;
          if (null !== deps && areHookInputsEqual(deps, prevState[1]))
            return prevState[0];
          prevState = nextCreate();
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              nextCreate();
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          hook.memoizedState = [prevState, deps];
          return prevState;
        }
        function mountDeferredValueImpl(hook, value, initialValue) {
          if (void 0 === initialValue || 0 !== (renderLanes & 1073741824))
            return hook.memoizedState = value;
          hook.memoizedState = initialValue;
          hook = requestDeferredLane();
          currentlyRenderingFiber$1.lanes |= hook;
          workInProgressRootSkippedLanes |= hook;
          return initialValue;
        }
        function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
          if (objectIs(value, prevValue)) return value;
          if (null !== currentTreeHiddenStackCursor.current)
            return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
          if (0 === (renderLanes & 42))
            return didReceiveUpdate = true, hook.memoizedState = value;
          hook = requestDeferredLane();
          currentlyRenderingFiber$1.lanes |= hook;
          workInProgressRootSkippedLanes |= hook;
          return prevValue;
        }
        function startTransition(fiber, queue, pendingState, finishedState, callback) {
          var previousPriority = getCurrentUpdatePriority();
          setCurrentUpdatePriority(
            0 !== previousPriority && 8 > previousPriority ? previousPriority : 8
          );
          var prevTransition = ReactSharedInternals.T, currentTransition = {};
          ReactSharedInternals.T = currentTransition;
          dispatchOptimisticSetState(fiber, false, queue, pendingState);
          try {
            var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
            null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
            if (null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then) {
              var thenableForFinishedState = chainThenableValue(
                returnValue,
                finishedState
              );
              dispatchSetStateInternal(
                fiber,
                queue,
                thenableForFinishedState,
                requestUpdateLane(fiber)
              );
            } else
              dispatchSetStateInternal(
                fiber,
                queue,
                finishedState,
                requestUpdateLane(fiber)
              );
          } catch (error) {
            dispatchSetStateInternal(
              fiber,
              queue,
              { then: function() {
              }, status: "rejected", reason: error },
              requestUpdateLane()
            );
          } finally {
            setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = prevTransition;
          }
        }
        function ensureFormComponentIsStateful(formFiber) {
          var existingStateHook = formFiber.memoizedState;
          if (null !== existingStateHook) return existingStateHook;
          existingStateHook = {
            memoizedState: NotPendingTransition,
            baseState: NotPendingTransition,
            baseQueue: null,
            queue: {
              pending: null,
              lanes: 0,
              dispatch: null,
              lastRenderedReducer: basicStateReducer,
              lastRenderedState: NotPendingTransition
            },
            next: null
          };
          var initialResetState = {};
          existingStateHook.next = {
            memoizedState: initialResetState,
            baseState: initialResetState,
            baseQueue: null,
            queue: {
              pending: null,
              lanes: 0,
              dispatch: null,
              lastRenderedReducer: basicStateReducer,
              lastRenderedState: initialResetState
            },
            next: null
          };
          formFiber.memoizedState = existingStateHook;
          formFiber = formFiber.alternate;
          null !== formFiber && (formFiber.memoizedState = existingStateHook);
          return existingStateHook;
        }
        function useHostTransitionStatus() {
          return readContext(HostTransitionContext2);
        }
        function updateId() {
          return updateWorkInProgressHook().memoizedState;
        }
        function updateRefresh() {
          return updateWorkInProgressHook().memoizedState;
        }
        function refreshCache(fiber) {
          for (var provider = fiber.return; null !== provider; ) {
            switch (provider.tag) {
              case 24:
              case 3:
                var lane = requestUpdateLane();
                fiber = createUpdate(lane);
                var root = enqueueUpdate(provider, fiber, lane);
                null !== root && (scheduleUpdateOnFiber(root, provider, lane), entangleTransitions(root, provider, lane));
                provider = { cache: createCache() };
                fiber.payload = provider;
                return;
            }
            provider = provider.return;
          }
        }
        function dispatchReducerAction(fiber, queue, action) {
          var lane = requestUpdateLane();
          action = {
            lane,
            revertLane: 0,
            action,
            hasEagerState: false,
            eagerState: null,
            next: null
          };
          isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), null !== action && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
        }
        function dispatchSetState(fiber, queue, action) {
          var lane = requestUpdateLane();
          dispatchSetStateInternal(fiber, queue, action, lane);
        }
        function dispatchSetStateInternal(fiber, queue, action, lane) {
          var update = {
            lane,
            revertLane: 0,
            action,
            hasEagerState: false,
            eagerState: null,
            next: null
          };
          if (isRenderPhaseUpdate(fiber)) enqueueRenderPhaseUpdate(queue, update);
          else {
            var alternate = fiber.alternate;
            if (0 === fiber.lanes && (null === alternate || 0 === alternate.lanes) && (alternate = queue.lastRenderedReducer, null !== alternate))
              try {
                var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
                update.hasEagerState = true;
                update.eagerState = eagerState;
                if (objectIs(eagerState, currentState))
                  return enqueueUpdate$1(fiber, queue, update, 0), null === workInProgressRoot && finishQueueingConcurrentUpdates(), false;
              } catch (error) {
              } finally {
              }
            action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
            if (null !== action)
              return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
          }
          return false;
        }
        function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
          action = {
            lane: 2,
            revertLane: requestTransitionLane(),
            action,
            hasEagerState: false,
            eagerState: null,
            next: null
          };
          if (isRenderPhaseUpdate(fiber)) {
            if (throwIfDuringRender) throw Error(formatProdErrorMessage(479));
          } else
            throwIfDuringRender = enqueueConcurrentHookUpdate(
              fiber,
              queue,
              action,
              2
            ), null !== throwIfDuringRender && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
        }
        function isRenderPhaseUpdate(fiber) {
          var alternate = fiber.alternate;
          return fiber === currentlyRenderingFiber$1 || null !== alternate && alternate === currentlyRenderingFiber$1;
        }
        function enqueueRenderPhaseUpdate(queue, update) {
          didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
          var pending = queue.pending;
          null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
          queue.pending = update;
        }
        function entangleTransitionUpdate(root, queue, lane) {
          if (0 !== (lane & 4194176)) {
            var queueLanes = queue.lanes;
            queueLanes &= root.pendingLanes;
            lane |= queueLanes;
            queue.lanes = lane;
            markRootEntangled(root, lane);
          }
        }
        function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
          ctor = workInProgress2.memoizedState;
          getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
          getDerivedStateFromProps = null === getDerivedStateFromProps || void 0 === getDerivedStateFromProps ? ctor : assign({}, ctor, getDerivedStateFromProps);
          workInProgress2.memoizedState = getDerivedStateFromProps;
          0 === workInProgress2.lanes && (workInProgress2.updateQueue.baseState = getDerivedStateFromProps);
        }
        function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
          workInProgress2 = workInProgress2.stateNode;
          return "function" === typeof workInProgress2.shouldComponentUpdate ? workInProgress2.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
        }
        function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
          workInProgress2 = instance.state;
          "function" === typeof instance.componentWillReceiveProps && instance.componentWillReceiveProps(newProps, nextContext);
          "function" === typeof instance.UNSAFE_componentWillReceiveProps && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
          instance.state !== workInProgress2 && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
        }
        function resolveClassComponentProps(Component, baseProps) {
          var newProps = baseProps;
          if ("ref" in baseProps) {
            newProps = {};
            for (var propName in baseProps)
              "ref" !== propName && (newProps[propName] = baseProps[propName]);
          }
          if (Component = Component.defaultProps) {
            newProps === baseProps && (newProps = assign({}, newProps));
            for (var propName$54 in Component)
              void 0 === newProps[propName$54] && (newProps[propName$54] = Component[propName$54]);
          }
          return newProps;
        }
        function logUncaughtError(root, errorInfo) {
          try {
            var onUncaughtError = root.onUncaughtError;
            onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
          } catch (e) {
            setTimeout(function() {
              throw e;
            });
          }
        }
        function logCaughtError(root, boundary, errorInfo) {
          try {
            var onCaughtError = root.onCaughtError;
            onCaughtError(errorInfo.value, {
              componentStack: errorInfo.stack,
              errorBoundary: 1 === boundary.tag ? boundary.stateNode : null
            });
          } catch (e) {
            setTimeout(function() {
              throw e;
            });
          }
        }
        function createRootErrorUpdate(root, errorInfo, lane) {
          lane = createUpdate(lane);
          lane.tag = 3;
          lane.payload = { element: null };
          lane.callback = function() {
            logUncaughtError(root, errorInfo);
          };
          return lane;
        }
        function createClassErrorUpdate(lane) {
          lane = createUpdate(lane);
          lane.tag = 3;
          return lane;
        }
        function initializeClassErrorUpdate(update, root, fiber, errorInfo) {
          var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
          if ("function" === typeof getDerivedStateFromError) {
            var error = errorInfo.value;
            update.payload = function() {
              return getDerivedStateFromError(error);
            };
            update.callback = function() {
              logCaughtError(root, fiber, errorInfo);
            };
          }
          var inst = fiber.stateNode;
          null !== inst && "function" === typeof inst.componentDidCatch && (update.callback = function() {
            logCaughtError(root, fiber, errorInfo);
            "function" !== typeof getDerivedStateFromError && (null === legacyErrorBoundariesThatAlreadyFailed ? legacyErrorBoundariesThatAlreadyFailed = /* @__PURE__ */ new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
            var stack = errorInfo.stack;
            this.componentDidCatch(errorInfo.value, {
              componentStack: null !== stack ? stack : ""
            });
          });
        }
        function throwException(root, returnFiber, sourceFiber, value, rootRenderLanes) {
          sourceFiber.flags |= 32768;
          if (null !== value && "object" === typeof value && "function" === typeof value.then) {
            returnFiber = sourceFiber.alternate;
            null !== returnFiber && propagateParentContextChanges(
              returnFiber,
              sourceFiber,
              rootRenderLanes,
              true
            );
            sourceFiber = suspenseHandlerStackCursor.current;
            if (null !== sourceFiber) {
              switch (sourceFiber.tag) {
                case 13:
                  return null === shellBoundary ? renderDidSuspendDelayIfPossible() : null === sourceFiber.alternate && 0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? sourceFiber.updateQueue = /* @__PURE__ */ new Set([value]) : returnFiber.add(value), attachPingListener(root, value, rootRenderLanes)), false;
                case 22:
                  return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? (returnFiber = {
                    transitions: null,
                    markerInstances: null,
                    retryQueue: /* @__PURE__ */ new Set([value])
                  }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, null === sourceFiber ? returnFiber.retryQueue = /* @__PURE__ */ new Set([value]) : sourceFiber.add(value)), attachPingListener(root, value, rootRenderLanes)), false;
              }
              throw Error(formatProdErrorMessage(435, sourceFiber.tag));
            }
            attachPingListener(root, value, rootRenderLanes);
            renderDidSuspendDelayIfPossible();
            return false;
          }
          if (isHydrating)
            return returnFiber = suspenseHandlerStackCursor.current, null !== returnFiber ? (0 === (returnFiber.flags & 65536) && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(
              createCapturedValueAtFiber(root, sourceFiber)
            ))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
              cause: value
            }), queueHydrationError(
              createCapturedValueAtFiber(returnFiber, sourceFiber)
            )), root = root.current.alternate, root.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(
              root.stateNode,
              value,
              rootRenderLanes
            ), enqueueCapturedUpdate(root, rootRenderLanes), 4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2)), false;
          var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
          wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
          null === workInProgressRootConcurrentErrors ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
          4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2);
          if (null === returnFiber) return true;
          value = createCapturedValueAtFiber(value, sourceFiber);
          sourceFiber = returnFiber;
          do {
            switch (sourceFiber.tag) {
              case 3:
                return sourceFiber.flags |= 65536, root = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root, root = createRootErrorUpdate(sourceFiber.stateNode, value, root), enqueueCapturedUpdate(sourceFiber, root), false;
              case 1:
                if (returnFiber = sourceFiber.type, wrapperError = sourceFiber.stateNode, 0 === (sourceFiber.flags & 128) && ("function" === typeof returnFiber.getDerivedStateFromError || null !== wrapperError && "function" === typeof wrapperError.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(
                  wrapperError
                ))))
                  return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(
                    rootRenderLanes,
                    root,
                    sourceFiber,
                    value
                  ), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
            }
            sourceFiber = sourceFiber.return;
          } while (null !== sourceFiber);
          return false;
        }
        function reconcileChildren(current, workInProgress2, nextChildren, renderLanes2) {
          workInProgress2.child = null === current ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(
            workInProgress2,
            current.child,
            nextChildren,
            renderLanes2
          );
        }
        function updateForwardRef(current, workInProgress2, Component, nextProps, renderLanes2) {
          Component = Component.render;
          var ref = workInProgress2.ref;
          if ("ref" in nextProps) {
            var propsWithoutRef = {};
            for (var key in nextProps)
              "ref" !== key && (propsWithoutRef[key] = nextProps[key]);
          } else propsWithoutRef = nextProps;
          prepareToReadContext(workInProgress2);
          nextProps = renderWithHooks(
            current,
            workInProgress2,
            Component,
            propsWithoutRef,
            ref,
            renderLanes2
          );
          key = checkDidRenderIdHook();
          if (null !== current && !didReceiveUpdate)
            return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
          isHydrating && key && pushMaterializedTreeId(workInProgress2);
          workInProgress2.flags |= 1;
          reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
          return workInProgress2.child;
        }
        function updateMemoComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
          if (null === current) {
            var type = Component.type;
            if ("function" === typeof type && !shouldConstruct(type) && void 0 === type.defaultProps && null === Component.compare)
              return workInProgress2.tag = 15, workInProgress2.type = type, updateSimpleMemoComponent(
                current,
                workInProgress2,
                type,
                nextProps,
                renderLanes2
              );
            current = createFiberFromTypeAndProps(
              Component.type,
              null,
              nextProps,
              workInProgress2,
              workInProgress2.mode,
              renderLanes2
            );
            current.ref = workInProgress2.ref;
            current.return = workInProgress2;
            return workInProgress2.child = current;
          }
          type = current.child;
          if (!checkScheduledUpdateOrContext(current, renderLanes2)) {
            var prevProps = type.memoizedProps;
            Component = Component.compare;
            Component = null !== Component ? Component : shallowEqual;
            if (Component(prevProps, nextProps) && current.ref === workInProgress2.ref)
              return bailoutOnAlreadyFinishedWork(
                current,
                workInProgress2,
                renderLanes2
              );
          }
          workInProgress2.flags |= 1;
          current = createWorkInProgress(type, nextProps);
          current.ref = workInProgress2.ref;
          current.return = workInProgress2;
          return workInProgress2.child = current;
        }
        function updateSimpleMemoComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
          if (null !== current) {
            var prevProps = current.memoizedProps;
            if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress2.ref)
              if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current, renderLanes2))
                0 !== (current.flags & 131072) && (didReceiveUpdate = true);
              else
                return workInProgress2.lanes = current.lanes, bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
          }
          return updateFunctionComponent(
            current,
            workInProgress2,
            Component,
            nextProps,
            renderLanes2
          );
        }
        function updateOffscreenComponent(current, workInProgress2, renderLanes2) {
          var nextProps = workInProgress2.pendingProps, nextChildren = nextProps.children, nextIsDetached = 0 !== (workInProgress2.stateNode._pendingVisibility & 2), prevState = null !== current ? current.memoizedState : null;
          markRef(current, workInProgress2);
          if ("hidden" === nextProps.mode || nextIsDetached) {
            if (0 !== (workInProgress2.flags & 128)) {
              nextProps = null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2;
              if (null !== current) {
                nextChildren = workInProgress2.child = current.child;
                for (nextIsDetached = 0; null !== nextChildren; )
                  nextIsDetached = nextIsDetached | nextChildren.lanes | nextChildren.childLanes, nextChildren = nextChildren.sibling;
                workInProgress2.childLanes = nextIsDetached & ~nextProps;
              } else workInProgress2.childLanes = 0, workInProgress2.child = null;
              return deferHiddenOffscreenComponent(
                current,
                workInProgress2,
                nextProps,
                renderLanes2
              );
            }
            if (0 !== (renderLanes2 & 536870912))
              workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, null !== current && pushTransition(
                workInProgress2,
                null !== prevState ? prevState.cachePool : null
              ), null !== prevState ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress2);
            else
              return workInProgress2.lanes = workInProgress2.childLanes = 536870912, deferHiddenOffscreenComponent(
                current,
                workInProgress2,
                null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2,
                renderLanes2
              );
          } else
            null !== prevState ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(), workInProgress2.memoizedState = null) : (null !== current && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack());
          reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
          return workInProgress2.child;
        }
        function deferHiddenOffscreenComponent(current, workInProgress2, nextBaseLanes, renderLanes2) {
          var JSCompiler_inline_result = peekCacheFromPool();
          JSCompiler_inline_result = null === JSCompiler_inline_result ? null : {
            parent: isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2,
            pool: JSCompiler_inline_result
          };
          workInProgress2.memoizedState = {
            baseLanes: nextBaseLanes,
            cachePool: JSCompiler_inline_result
          };
          null !== current && pushTransition(workInProgress2, null);
          reuseHiddenContextOnStack();
          pushOffscreenSuspenseHandler(workInProgress2);
          null !== current && propagateParentContextChanges(current, workInProgress2, renderLanes2, true);
          return null;
        }
        function markRef(current, workInProgress2) {
          var ref = workInProgress2.ref;
          if (null === ref)
            null !== current && null !== current.ref && (workInProgress2.flags |= 2097664);
          else {
            if ("function" !== typeof ref && "object" !== typeof ref)
              throw Error(formatProdErrorMessage(284));
            if (null === current || current.ref !== ref)
              workInProgress2.flags |= 2097664;
          }
        }
        function updateFunctionComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
          prepareToReadContext(workInProgress2);
          Component = renderWithHooks(
            current,
            workInProgress2,
            Component,
            nextProps,
            void 0,
            renderLanes2
          );
          nextProps = checkDidRenderIdHook();
          if (null !== current && !didReceiveUpdate)
            return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
          isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
          workInProgress2.flags |= 1;
          reconcileChildren(current, workInProgress2, Component, renderLanes2);
          return workInProgress2.child;
        }
        function replayFunctionComponent(current, workInProgress2, nextProps, Component, secondArg, renderLanes2) {
          prepareToReadContext(workInProgress2);
          workInProgress2.updateQueue = null;
          nextProps = renderWithHooksAgain(
            workInProgress2,
            Component,
            nextProps,
            secondArg
          );
          finishRenderingHooks(current);
          Component = checkDidRenderIdHook();
          if (null !== current && !didReceiveUpdate)
            return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
          isHydrating && Component && pushMaterializedTreeId(workInProgress2);
          workInProgress2.flags |= 1;
          reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
          return workInProgress2.child;
        }
        function updateClassComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
          prepareToReadContext(workInProgress2);
          if (null === workInProgress2.stateNode) {
            var context = emptyContextObject, contextType = Component.contextType;
            "object" === typeof contextType && null !== contextType && (context = readContext(contextType));
            context = new Component(nextProps, context);
            workInProgress2.memoizedState = null !== context.state && void 0 !== context.state ? context.state : null;
            context.updater = classComponentUpdater;
            workInProgress2.stateNode = context;
            context._reactInternals = workInProgress2;
            context = workInProgress2.stateNode;
            context.props = nextProps;
            context.state = workInProgress2.memoizedState;
            context.refs = {};
            initializeUpdateQueue(workInProgress2);
            contextType = Component.contextType;
            context.context = "object" === typeof contextType && null !== contextType ? readContext(contextType) : emptyContextObject;
            context.state = workInProgress2.memoizedState;
            contextType = Component.getDerivedStateFromProps;
            "function" === typeof contextType && (applyDerivedStateFromProps(
              workInProgress2,
              Component,
              contextType,
              nextProps
            ), context.state = workInProgress2.memoizedState);
            "function" === typeof Component.getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || (contextType = context.state, "function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(
              context,
              context.state,
              null
            ), processUpdateQueue(workInProgress2, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress2.memoizedState);
            "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308);
            nextProps = true;
          } else if (null === current) {
            context = workInProgress2.stateNode;
            var unresolvedOldProps = workInProgress2.memoizedProps, oldProps = resolveClassComponentProps(Component, unresolvedOldProps);
            context.props = oldProps;
            var oldContext = context.context, contextType$jscomp$0 = Component.contextType;
            contextType = emptyContextObject;
            "object" === typeof contextType$jscomp$0 && null !== contextType$jscomp$0 && (contextType = readContext(contextType$jscomp$0));
            var getDerivedStateFromProps = Component.getDerivedStateFromProps;
            contextType$jscomp$0 = "function" === typeof getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate;
            unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
            contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(
              workInProgress2,
              context,
              nextProps,
              contextType
            );
            hasForceUpdate = false;
            var oldState = workInProgress2.memoizedState;
            context.state = oldState;
            processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
            suspendIfUpdateReadFromEntangledAsyncAction();
            oldContext = workInProgress2.memoizedState;
            unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? ("function" === typeof getDerivedStateFromProps && (applyDerivedStateFromProps(
              workInProgress2,
              Component,
              getDerivedStateFromProps,
              nextProps
            ), oldContext = workInProgress2.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(
              workInProgress2,
              Component,
              oldProps,
              nextProps,
              oldState,
              oldContext,
              contextType
            )) ? (contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || ("function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount()), "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308)) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), nextProps = false);
          } else {
            context = workInProgress2.stateNode;
            cloneUpdateQueue(current, workInProgress2);
            contextType = workInProgress2.memoizedProps;
            contextType$jscomp$0 = resolveClassComponentProps(Component, contextType);
            context.props = contextType$jscomp$0;
            getDerivedStateFromProps = workInProgress2.pendingProps;
            oldState = context.context;
            oldContext = Component.contextType;
            oldProps = emptyContextObject;
            "object" === typeof oldContext && null !== oldContext && (oldProps = readContext(oldContext));
            unresolvedOldProps = Component.getDerivedStateFromProps;
            (oldContext = "function" === typeof unresolvedOldProps || "function" === typeof context.getSnapshotBeforeUpdate) || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(
              workInProgress2,
              context,
              nextProps,
              oldProps
            );
            hasForceUpdate = false;
            oldState = workInProgress2.memoizedState;
            context.state = oldState;
            processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
            suspendIfUpdateReadFromEntangledAsyncAction();
            var newState = workInProgress2.memoizedState;
            contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies) ? ("function" === typeof unresolvedOldProps && (applyDerivedStateFromProps(
              workInProgress2,
              Component,
              unresolvedOldProps,
              nextProps
            ), newState = workInProgress2.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(
              workInProgress2,
              Component,
              contextType$jscomp$0,
              nextProps,
              oldState,
              newState,
              oldProps
            ) || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies)) ? (oldContext || "function" !== typeof context.UNSAFE_componentWillUpdate && "function" !== typeof context.componentWillUpdate || ("function" === typeof context.componentWillUpdate && context.componentWillUpdate(nextProps, newState, oldProps), "function" === typeof context.UNSAFE_componentWillUpdate && context.UNSAFE_componentWillUpdate(
              nextProps,
              newState,
              oldProps
            )), "function" === typeof context.componentDidUpdate && (workInProgress2.flags |= 4), "function" === typeof context.getSnapshotBeforeUpdate && (workInProgress2.flags |= 1024)) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), nextProps = false);
          }
          context = nextProps;
          markRef(current, workInProgress2);
          nextProps = 0 !== (workInProgress2.flags & 128);
          context || nextProps ? (context = workInProgress2.stateNode, Component = nextProps && "function" !== typeof Component.getDerivedStateFromError ? null : context.render(), workInProgress2.flags |= 1, null !== current && nextProps ? (workInProgress2.child = reconcileChildFibers(
            workInProgress2,
            current.child,
            null,
            renderLanes2
          ), workInProgress2.child = reconcileChildFibers(
            workInProgress2,
            null,
            Component,
            renderLanes2
          )) : reconcileChildren(current, workInProgress2, Component, renderLanes2), workInProgress2.memoizedState = context.state, current = workInProgress2.child) : current = bailoutOnAlreadyFinishedWork(
            current,
            workInProgress2,
            renderLanes2
          );
          return current;
        }
        function mountHostRootWithoutHydrating(current, workInProgress2, nextChildren, renderLanes2) {
          resetHydrationState();
          workInProgress2.flags |= 256;
          reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
          return workInProgress2.child;
        }
        function mountSuspenseOffscreenState(renderLanes2) {
          return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
        }
        function getRemainingWorkInPrimaryTree(current, primaryTreeDidDefer, renderLanes2) {
          current = null !== current ? current.childLanes & ~renderLanes2 : 0;
          primaryTreeDidDefer && (current |= workInProgressDeferredLane);
          return current;
        }
        function updateSuspenseComponent(current, workInProgress2, renderLanes2) {
          var nextProps = workInProgress2.pendingProps, showFallback = false, didSuspend = 0 !== (workInProgress2.flags & 128), JSCompiler_temp;
          (JSCompiler_temp = didSuspend) || (JSCompiler_temp = null !== current && null === current.memoizedState ? false : 0 !== (suspenseStackCursor.current & 2));
          JSCompiler_temp && (showFallback = true, workInProgress2.flags &= -129);
          JSCompiler_temp = 0 !== (workInProgress2.flags & 32);
          workInProgress2.flags &= -33;
          if (null === current) {
            if (isHydrating) {
              showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack();
              if (isHydrating) {
                var nextInstance = nextHydratableInstance, JSCompiler_temp$jscomp$0;
                if (JSCompiler_temp$jscomp$0 = nextInstance)
                  nextInstance = canHydrateSuspenseInstance(
                    nextInstance,
                    rootOrSingletonContext
                  ), null !== nextInstance ? (workInProgress2.memoizedState = {
                    dehydrated: nextInstance,
                    treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
                    retryLane: 536870912
                  }, JSCompiler_temp$jscomp$0 = createFiber(18, null, null, 0), JSCompiler_temp$jscomp$0.stateNode = nextInstance, JSCompiler_temp$jscomp$0.return = workInProgress2, workInProgress2.child = JSCompiler_temp$jscomp$0, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, JSCompiler_temp$jscomp$0 = true) : JSCompiler_temp$jscomp$0 = false;
                JSCompiler_temp$jscomp$0 || throwOnHydrationMismatch(workInProgress2);
              }
              nextInstance = workInProgress2.memoizedState;
              if (null !== nextInstance && (nextInstance = nextInstance.dehydrated, null !== nextInstance))
                return isSuspenseInstanceFallback(nextInstance) ? workInProgress2.lanes = 16 : workInProgress2.lanes = 536870912, null;
              popSuspenseHandler(workInProgress2);
            }
            nextInstance = nextProps.children;
            nextProps = nextProps.fallback;
            if (showFallback)
              return reuseSuspenseHandlerOnStack(), showFallback = workInProgress2.mode, nextInstance = mountWorkInProgressOffscreenFiber(
                { mode: "hidden", children: nextInstance },
                showFallback
              ), nextProps = createFiberFromFragment(
                nextProps,
                showFallback,
                renderLanes2,
                null
              ), nextInstance.return = workInProgress2, nextProps.return = workInProgress2, nextInstance.sibling = nextProps, workInProgress2.child = nextInstance, showFallback = workInProgress2.child, showFallback.memoizedState = mountSuspenseOffscreenState(renderLanes2), showFallback.childLanes = getRemainingWorkInPrimaryTree(
                current,
                JSCompiler_temp,
                renderLanes2
              ), workInProgress2.memoizedState = SUSPENDED_MARKER, nextProps;
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            return mountSuspensePrimaryChildren(workInProgress2, nextInstance);
          }
          JSCompiler_temp$jscomp$0 = current.memoizedState;
          if (null !== JSCompiler_temp$jscomp$0 && (nextInstance = JSCompiler_temp$jscomp$0.dehydrated, null !== nextInstance)) {
            if (didSuspend)
              workInProgress2.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, workInProgress2 = retrySuspenseComponentWithoutHydrating(
                current,
                workInProgress2,
                renderLanes2
              )) : null !== workInProgress2.memoizedState ? (reuseSuspenseHandlerOnStack(), workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null) : (reuseSuspenseHandlerOnStack(), showFallback = nextProps.fallback, nextInstance = workInProgress2.mode, nextProps = mountWorkInProgressOffscreenFiber(
                { mode: "visible", children: nextProps.children },
                nextInstance
              ), showFallback = createFiberFromFragment(
                showFallback,
                nextInstance,
                renderLanes2,
                null
              ), showFallback.flags |= 2, nextProps.return = workInProgress2, showFallback.return = workInProgress2, nextProps.sibling = showFallback, workInProgress2.child = nextProps, reconcileChildFibers(
                workInProgress2,
                current.child,
                null,
                renderLanes2
              ), nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
                current,
                JSCompiler_temp,
                renderLanes2
              ), workInProgress2.memoizedState = SUSPENDED_MARKER, workInProgress2 = showFallback);
            else if (pushPrimaryTreeSuspenseHandler(workInProgress2), isSuspenseInstanceFallback(nextInstance))
              JSCompiler_temp = getSuspenseInstanceFallbackErrorDetails(nextInstance).digest, nextProps = Error(formatProdErrorMessage(419)), nextProps.stack = "", nextProps.digest = JSCompiler_temp, queueHydrationError({ value: nextProps, source: null, stack: null }), workInProgress2 = retrySuspenseComponentWithoutHydrating(
                current,
                workInProgress2,
                renderLanes2
              );
            else if (didReceiveUpdate || propagateParentContextChanges(
              current,
              workInProgress2,
              renderLanes2,
              false
            ), JSCompiler_temp = 0 !== (renderLanes2 & current.childLanes), didReceiveUpdate || JSCompiler_temp) {
              JSCompiler_temp = workInProgressRoot;
              if (null !== JSCompiler_temp) {
                nextProps = renderLanes2 & -renderLanes2;
                if (0 !== (nextProps & 42)) nextProps = 1;
                else
                  switch (nextProps) {
                    case 2:
                      nextProps = 1;
                      break;
                    case 8:
                      nextProps = 4;
                      break;
                    case 32:
                      nextProps = 16;
                      break;
                    case 128:
                    case 256:
                    case 512:
                    case 1024:
                    case 2048:
                    case 4096:
                    case 8192:
                    case 16384:
                    case 32768:
                    case 65536:
                    case 131072:
                    case 262144:
                    case 524288:
                    case 1048576:
                    case 2097152:
                    case 4194304:
                    case 8388608:
                    case 16777216:
                    case 33554432:
                      nextProps = 64;
                      break;
                    case 268435456:
                      nextProps = 134217728;
                      break;
                    default:
                      nextProps = 0;
                  }
                nextProps = 0 !== (nextProps & (JSCompiler_temp.suspendedLanes | renderLanes2)) ? 0 : nextProps;
                if (0 !== nextProps && nextProps !== JSCompiler_temp$jscomp$0.retryLane)
                  throw JSCompiler_temp$jscomp$0.retryLane = nextProps, enqueueConcurrentRenderForLane(current, nextProps), scheduleUpdateOnFiber(JSCompiler_temp, current, nextProps), SelectiveHydrationException;
              }
              isSuspenseInstancePending(nextInstance) || renderDidSuspendDelayIfPossible();
              workInProgress2 = retrySuspenseComponentWithoutHydrating(
                current,
                workInProgress2,
                renderLanes2
              );
            } else
              isSuspenseInstancePending(nextInstance) ? (workInProgress2.flags |= 128, workInProgress2.child = current.child, workInProgress2 = retryDehydratedSuspenseBoundary.bind(
                null,
                current
              ), registerSuspenseInstanceRetry(nextInstance, workInProgress2), workInProgress2 = null) : (current = JSCompiler_temp$jscomp$0.treeContext, supportsHydration && (nextHydratableInstance = getFirstHydratableChildWithinSuspenseInstance(nextInstance), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current && (idStack[idStackIndex++] = treeContextId, idStack[idStackIndex++] = treeContextOverflow, idStack[idStackIndex++] = treeContextProvider, treeContextId = current.id, treeContextOverflow = current.overflow, treeContextProvider = workInProgress2)), workInProgress2 = mountSuspensePrimaryChildren(
                workInProgress2,
                nextProps.children
              ), workInProgress2.flags |= 4096);
            return workInProgress2;
          }
          if (showFallback)
            return reuseSuspenseHandlerOnStack(), showFallback = nextProps.fallback, nextInstance = workInProgress2.mode, JSCompiler_temp$jscomp$0 = current.child, didSuspend = JSCompiler_temp$jscomp$0.sibling, nextProps = createWorkInProgress(JSCompiler_temp$jscomp$0, {
              mode: "hidden",
              children: nextProps.children
            }), nextProps.subtreeFlags = JSCompiler_temp$jscomp$0.subtreeFlags & 31457280, null !== didSuspend ? showFallback = createWorkInProgress(didSuspend, showFallback) : (showFallback = createFiberFromFragment(
              showFallback,
              nextInstance,
              renderLanes2,
              null
            ), showFallback.flags |= 2), showFallback.return = workInProgress2, nextProps.return = workInProgress2, nextProps.sibling = showFallback, workInProgress2.child = nextProps, nextProps = showFallback, showFallback = workInProgress2.child, nextInstance = current.child.memoizedState, null === nextInstance ? nextInstance = mountSuspenseOffscreenState(renderLanes2) : (JSCompiler_temp$jscomp$0 = nextInstance.cachePool, null !== JSCompiler_temp$jscomp$0 ? (didSuspend = isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2, JSCompiler_temp$jscomp$0 = JSCompiler_temp$jscomp$0.parent !== didSuspend ? { parent: didSuspend, pool: didSuspend } : JSCompiler_temp$jscomp$0) : JSCompiler_temp$jscomp$0 = getSuspendedCache(), nextInstance = {
              baseLanes: nextInstance.baseLanes | renderLanes2,
              cachePool: JSCompiler_temp$jscomp$0
            }), showFallback.memoizedState = nextInstance, showFallback.childLanes = getRemainingWorkInPrimaryTree(
              current,
              JSCompiler_temp,
              renderLanes2
            ), workInProgress2.memoizedState = SUSPENDED_MARKER, nextProps;
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          renderLanes2 = current.child;
          current = renderLanes2.sibling;
          renderLanes2 = createWorkInProgress(renderLanes2, {
            mode: "visible",
            children: nextProps.children
          });
          renderLanes2.return = workInProgress2;
          renderLanes2.sibling = null;
          null !== current && (JSCompiler_temp = workInProgress2.deletions, null === JSCompiler_temp ? (workInProgress2.deletions = [current], workInProgress2.flags |= 16) : JSCompiler_temp.push(current));
          workInProgress2.child = renderLanes2;
          workInProgress2.memoizedState = null;
          return renderLanes2;
        }
        function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
          primaryChildren = mountWorkInProgressOffscreenFiber(
            { mode: "visible", children: primaryChildren },
            workInProgress2.mode
          );
          primaryChildren.return = workInProgress2;
          return workInProgress2.child = primaryChildren;
        }
        function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
          return createFiberFromOffscreen(offscreenProps, mode, 0, null);
        }
        function retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
          reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
          current = mountSuspensePrimaryChildren(
            workInProgress2,
            workInProgress2.pendingProps.children
          );
          current.flags |= 2;
          workInProgress2.memoizedState = null;
          return current;
        }
        function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
          fiber.lanes |= renderLanes2;
          var alternate = fiber.alternate;
          null !== alternate && (alternate.lanes |= renderLanes2);
          scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
        }
        function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode) {
          var renderState = workInProgress2.memoizedState;
          null === renderState ? workInProgress2.memoizedState = {
            isBackwards,
            rendering: null,
            renderingStartTime: 0,
            last: lastContentRow,
            tail,
            tailMode
          } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode);
        }
        function updateSuspenseListComponent(current, workInProgress2, renderLanes2) {
          var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
          reconcileChildren(current, workInProgress2, nextProps.children, renderLanes2);
          nextProps = suspenseStackCursor.current;
          if (0 !== (nextProps & 2))
            nextProps = nextProps & 1 | 2, workInProgress2.flags |= 128;
          else {
            if (null !== current && 0 !== (current.flags & 128))
              a: for (current = workInProgress2.child; null !== current; ) {
                if (13 === current.tag)
                  null !== current.memoizedState && scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
                else if (19 === current.tag)
                  scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
                else if (null !== current.child) {
                  current.child.return = current;
                  current = current.child;
                  continue;
                }
                if (current === workInProgress2) break a;
                for (; null === current.sibling; ) {
                  if (null === current.return || current.return === workInProgress2)
                    break a;
                  current = current.return;
                }
                current.sibling.return = current.return;
                current = current.sibling;
              }
            nextProps &= 1;
          }
          push(suspenseStackCursor, nextProps);
          switch (revealOrder) {
            case "forwards":
              renderLanes2 = workInProgress2.child;
              for (revealOrder = null; null !== renderLanes2; )
                current = renderLanes2.alternate, null !== current && null === findFirstSuspended(current) && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
              renderLanes2 = revealOrder;
              null === renderLanes2 ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
              initSuspenseListRenderState(
                workInProgress2,
                false,
                revealOrder,
                renderLanes2,
                tailMode
              );
              break;
            case "backwards":
              renderLanes2 = null;
              revealOrder = workInProgress2.child;
              for (workInProgress2.child = null; null !== revealOrder; ) {
                current = revealOrder.alternate;
                if (null !== current && null === findFirstSuspended(current)) {
                  workInProgress2.child = revealOrder;
                  break;
                }
                current = revealOrder.sibling;
                revealOrder.sibling = renderLanes2;
                renderLanes2 = revealOrder;
                revealOrder = current;
              }
              initSuspenseListRenderState(
                workInProgress2,
                true,
                renderLanes2,
                null,
                tailMode
              );
              break;
            case "together":
              initSuspenseListRenderState(workInProgress2, false, null, null, void 0);
              break;
            default:
              workInProgress2.memoizedState = null;
          }
          return workInProgress2.child;
        }
        function bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2) {
          null !== current && (workInProgress2.dependencies = current.dependencies);
          workInProgressRootSkippedLanes |= workInProgress2.lanes;
          if (0 === (renderLanes2 & workInProgress2.childLanes))
            if (null !== current) {
              if (propagateParentContextChanges(
                current,
                workInProgress2,
                renderLanes2,
                false
              ), 0 === (renderLanes2 & workInProgress2.childLanes))
                return null;
            } else return null;
          if (null !== current && workInProgress2.child !== current.child)
            throw Error(formatProdErrorMessage(153));
          if (null !== workInProgress2.child) {
            current = workInProgress2.child;
            renderLanes2 = createWorkInProgress(current, current.pendingProps);
            workInProgress2.child = renderLanes2;
            for (renderLanes2.return = workInProgress2; null !== current.sibling; )
              current = current.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current, current.pendingProps), renderLanes2.return = workInProgress2;
            renderLanes2.sibling = null;
          }
          return workInProgress2.child;
        }
        function checkScheduledUpdateOrContext(current, renderLanes2) {
          if (0 !== (current.lanes & renderLanes2)) return true;
          current = current.dependencies;
          return null !== current && checkIfContextChanged(current) ? true : false;
        }
        function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress2, renderLanes2) {
          switch (workInProgress2.tag) {
            case 3:
              pushHostContainer(
                workInProgress2,
                workInProgress2.stateNode.containerInfo
              );
              pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
              resetHydrationState();
              break;
            case 27:
            case 5:
              pushHostContext(workInProgress2);
              break;
            case 4:
              pushHostContainer(
                workInProgress2,
                workInProgress2.stateNode.containerInfo
              );
              break;
            case 10:
              pushProvider(
                workInProgress2,
                workInProgress2.type,
                workInProgress2.memoizedProps.value
              );
              break;
            case 13:
              var state = workInProgress2.memoizedState;
              if (null !== state) {
                if (null !== state.dehydrated)
                  return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
                if (0 !== (renderLanes2 & workInProgress2.child.childLanes))
                  return updateSuspenseComponent(
                    current,
                    workInProgress2,
                    renderLanes2
                  );
                pushPrimaryTreeSuspenseHandler(workInProgress2);
                current = bailoutOnAlreadyFinishedWork(
                  current,
                  workInProgress2,
                  renderLanes2
                );
                return null !== current ? current.sibling : null;
              }
              pushPrimaryTreeSuspenseHandler(workInProgress2);
              break;
            case 19:
              var didSuspendBefore = 0 !== (current.flags & 128);
              state = 0 !== (renderLanes2 & workInProgress2.childLanes);
              state || (propagateParentContextChanges(
                current,
                workInProgress2,
                renderLanes2,
                false
              ), state = 0 !== (renderLanes2 & workInProgress2.childLanes));
              if (didSuspendBefore) {
                if (state)
                  return updateSuspenseListComponent(
                    current,
                    workInProgress2,
                    renderLanes2
                  );
                workInProgress2.flags |= 128;
              }
              didSuspendBefore = workInProgress2.memoizedState;
              null !== didSuspendBefore && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
              push(suspenseStackCursor, suspenseStackCursor.current);
              if (state) break;
              else return null;
            case 22:
            case 23:
              return workInProgress2.lanes = 0, updateOffscreenComponent(current, workInProgress2, renderLanes2);
            case 24:
              pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
          }
          return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        }
        function beginWork(current, workInProgress2, renderLanes2) {
          if (null !== current)
            if (current.memoizedProps !== workInProgress2.pendingProps)
              didReceiveUpdate = true;
            else {
              if (!checkScheduledUpdateOrContext(current, renderLanes2) && 0 === (workInProgress2.flags & 128))
                return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(
                  current,
                  workInProgress2,
                  renderLanes2
                );
              didReceiveUpdate = 0 !== (current.flags & 131072) ? true : false;
            }
          else
            didReceiveUpdate = false, isHydrating && 0 !== (workInProgress2.flags & 1048576) && pushTreeId(workInProgress2, treeForkCount, workInProgress2.index);
          workInProgress2.lanes = 0;
          switch (workInProgress2.tag) {
            case 16:
              a: {
                current = workInProgress2.pendingProps;
                var lazyComponent = workInProgress2.elementType, init = lazyComponent._init;
                lazyComponent = init(lazyComponent._payload);
                workInProgress2.type = lazyComponent;
                if ("function" === typeof lazyComponent)
                  shouldConstruct(lazyComponent) ? (current = resolveClassComponentProps(lazyComponent, current), workInProgress2.tag = 1, workInProgress2 = updateClassComponent(
                    null,
                    workInProgress2,
                    lazyComponent,
                    current,
                    renderLanes2
                  )) : (workInProgress2.tag = 0, workInProgress2 = updateFunctionComponent(
                    null,
                    workInProgress2,
                    lazyComponent,
                    current,
                    renderLanes2
                  ));
                else {
                  if (void 0 !== lazyComponent && null !== lazyComponent) {
                    if (init = lazyComponent.$$typeof, init === REACT_FORWARD_REF_TYPE) {
                      workInProgress2.tag = 11;
                      workInProgress2 = updateForwardRef(
                        null,
                        workInProgress2,
                        lazyComponent,
                        current,
                        renderLanes2
                      );
                      break a;
                    } else if (init === REACT_MEMO_TYPE) {
                      workInProgress2.tag = 14;
                      workInProgress2 = updateMemoComponent(
                        null,
                        workInProgress2,
                        lazyComponent,
                        current,
                        renderLanes2
                      );
                      break a;
                    }
                  }
                  workInProgress2 = getComponentNameFromType(lazyComponent) || lazyComponent;
                  throw Error(formatProdErrorMessage(306, workInProgress2, ""));
                }
              }
              return workInProgress2;
            case 0:
              return updateFunctionComponent(
                current,
                workInProgress2,
                workInProgress2.type,
                workInProgress2.pendingProps,
                renderLanes2
              );
            case 1:
              return lazyComponent = workInProgress2.type, init = resolveClassComponentProps(
                lazyComponent,
                workInProgress2.pendingProps
              ), updateClassComponent(
                current,
                workInProgress2,
                lazyComponent,
                init,
                renderLanes2
              );
            case 3:
              a: {
                pushHostContainer(
                  workInProgress2,
                  workInProgress2.stateNode.containerInfo
                );
                if (null === current) throw Error(formatProdErrorMessage(387));
                var nextProps = workInProgress2.pendingProps;
                init = workInProgress2.memoizedState;
                lazyComponent = init.element;
                cloneUpdateQueue(current, workInProgress2);
                processUpdateQueue(workInProgress2, nextProps, null, renderLanes2);
                var nextState = workInProgress2.memoizedState;
                nextProps = nextState.cache;
                pushProvider(workInProgress2, CacheContext, nextProps);
                nextProps !== init.cache && propagateContextChanges(
                  workInProgress2,
                  [CacheContext],
                  renderLanes2,
                  true
                );
                suspendIfUpdateReadFromEntangledAsyncAction();
                nextProps = nextState.element;
                if (supportsHydration && init.isDehydrated)
                  if (init = {
                    element: nextProps,
                    isDehydrated: false,
                    cache: nextState.cache
                  }, workInProgress2.updateQueue.baseState = init, workInProgress2.memoizedState = init, workInProgress2.flags & 256) {
                    workInProgress2 = mountHostRootWithoutHydrating(
                      current,
                      workInProgress2,
                      nextProps,
                      renderLanes2
                    );
                    break a;
                  } else if (nextProps !== lazyComponent) {
                    lazyComponent = createCapturedValueAtFiber(
                      Error(formatProdErrorMessage(424)),
                      workInProgress2
                    );
                    queueHydrationError(lazyComponent);
                    workInProgress2 = mountHostRootWithoutHydrating(
                      current,
                      workInProgress2,
                      nextProps,
                      renderLanes2
                    );
                    break a;
                  } else
                    for (supportsHydration && (nextHydratableInstance = getFirstHydratableChildWithinContainer(
                      workInProgress2.stateNode.containerInfo
                    ), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = true), renderLanes2 = mountChildFibers(
                      workInProgress2,
                      null,
                      nextProps,
                      renderLanes2
                    ), workInProgress2.child = renderLanes2; renderLanes2; )
                      renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
                else {
                  resetHydrationState();
                  if (nextProps === lazyComponent) {
                    workInProgress2 = bailoutOnAlreadyFinishedWork(
                      current,
                      workInProgress2,
                      renderLanes2
                    );
                    break a;
                  }
                  reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
                }
                workInProgress2 = workInProgress2.child;
              }
              return workInProgress2;
            case 26:
              if (supportsResources)
                return markRef(current, workInProgress2), null === current ? (renderLanes2 = getResource(
                  workInProgress2.type,
                  null,
                  workInProgress2.pendingProps,
                  null
                )) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (workInProgress2.stateNode = createHoistableInstance(
                  workInProgress2.type,
                  workInProgress2.pendingProps,
                  rootInstanceStackCursor.current,
                  workInProgress2
                )) : workInProgress2.memoizedState = getResource(
                  workInProgress2.type,
                  current.memoizedProps,
                  workInProgress2.pendingProps,
                  current.memoizedState
                ), null;
            case 27:
              if (supportsSingletons)
                return pushHostContext(workInProgress2), null === current && supportsSingletons && isHydrating && (lazyComponent = workInProgress2.stateNode = resolveSingletonInstance(
                  workInProgress2.type,
                  workInProgress2.pendingProps,
                  rootInstanceStackCursor.current,
                  contextStackCursor.current,
                  false
                ), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, nextHydratableInstance = getFirstHydratableChild(lazyComponent)), lazyComponent = workInProgress2.pendingProps.children, null !== current || isHydrating ? reconcileChildren(
                  current,
                  workInProgress2,
                  lazyComponent,
                  renderLanes2
                ) : workInProgress2.child = reconcileChildFibers(
                  workInProgress2,
                  null,
                  lazyComponent,
                  renderLanes2
                ), markRef(current, workInProgress2), workInProgress2.child;
            case 5:
              if (null === current && isHydrating) {
                validateHydratableInstance(
                  workInProgress2.type,
                  workInProgress2.pendingProps,
                  contextStackCursor.current
                );
                if (init = lazyComponent = nextHydratableInstance)
                  lazyComponent = canHydrateInstance(
                    lazyComponent,
                    workInProgress2.type,
                    workInProgress2.pendingProps,
                    rootOrSingletonContext
                  ), null !== lazyComponent ? (workInProgress2.stateNode = lazyComponent, hydrationParentFiber = workInProgress2, nextHydratableInstance = getFirstHydratableChild(lazyComponent), rootOrSingletonContext = false, init = true) : init = false;
                init || throwOnHydrationMismatch(workInProgress2);
              }
              pushHostContext(workInProgress2);
              init = workInProgress2.type;
              nextProps = workInProgress2.pendingProps;
              nextState = null !== current ? current.memoizedProps : null;
              lazyComponent = nextProps.children;
              shouldSetTextContent(init, nextProps) ? lazyComponent = null : null !== nextState && shouldSetTextContent(init, nextState) && (workInProgress2.flags |= 32);
              null !== workInProgress2.memoizedState && (init = renderWithHooks(
                current,
                workInProgress2,
                TransitionAwareHostComponent,
                null,
                null,
                renderLanes2
              ), isPrimaryRenderer ? HostTransitionContext2._currentValue = init : HostTransitionContext2._currentValue2 = init);
              markRef(current, workInProgress2);
              reconcileChildren(current, workInProgress2, lazyComponent, renderLanes2);
              return workInProgress2.child;
            case 6:
              if (null === current && isHydrating) {
                validateHydratableTextInstance(
                  workInProgress2.pendingProps,
                  contextStackCursor.current
                );
                if (current = renderLanes2 = nextHydratableInstance)
                  renderLanes2 = canHydrateTextInstance(
                    renderLanes2,
                    workInProgress2.pendingProps,
                    rootOrSingletonContext
                  ), null !== renderLanes2 ? (workInProgress2.stateNode = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, current = true) : current = false;
                current || throwOnHydrationMismatch(workInProgress2);
              }
              return null;
            case 13:
              return updateSuspenseComponent(current, workInProgress2, renderLanes2);
            case 4:
              return pushHostContainer(
                workInProgress2,
                workInProgress2.stateNode.containerInfo
              ), lazyComponent = workInProgress2.pendingProps, null === current ? workInProgress2.child = reconcileChildFibers(
                workInProgress2,
                null,
                lazyComponent,
                renderLanes2
              ) : reconcileChildren(
                current,
                workInProgress2,
                lazyComponent,
                renderLanes2
              ), workInProgress2.child;
            case 11:
              return updateForwardRef(
                current,
                workInProgress2,
                workInProgress2.type,
                workInProgress2.pendingProps,
                renderLanes2
              );
            case 7:
              return reconcileChildren(
                current,
                workInProgress2,
                workInProgress2.pendingProps,
                renderLanes2
              ), workInProgress2.child;
            case 8:
              return reconcileChildren(
                current,
                workInProgress2,
                workInProgress2.pendingProps.children,
                renderLanes2
              ), workInProgress2.child;
            case 12:
              return reconcileChildren(
                current,
                workInProgress2,
                workInProgress2.pendingProps.children,
                renderLanes2
              ), workInProgress2.child;
            case 10:
              return lazyComponent = workInProgress2.pendingProps, pushProvider(
                workInProgress2,
                workInProgress2.type,
                lazyComponent.value
              ), reconcileChildren(
                current,
                workInProgress2,
                lazyComponent.children,
                renderLanes2
              ), workInProgress2.child;
            case 9:
              return init = workInProgress2.type._context, lazyComponent = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), init = readContext(init), lazyComponent = lazyComponent(init), workInProgress2.flags |= 1, reconcileChildren(
                current,
                workInProgress2,
                lazyComponent,
                renderLanes2
              ), workInProgress2.child;
            case 14:
              return updateMemoComponent(
                current,
                workInProgress2,
                workInProgress2.type,
                workInProgress2.pendingProps,
                renderLanes2
              );
            case 15:
              return updateSimpleMemoComponent(
                current,
                workInProgress2,
                workInProgress2.type,
                workInProgress2.pendingProps,
                renderLanes2
              );
            case 19:
              return updateSuspenseListComponent(
                current,
                workInProgress2,
                renderLanes2
              );
            case 22:
              return updateOffscreenComponent(current, workInProgress2, renderLanes2);
            case 24:
              return prepareToReadContext(workInProgress2), lazyComponent = readContext(CacheContext), null === current ? (init = peekCacheFromPool(), null === init && (init = workInProgressRoot, nextProps = createCache(), init.pooledCache = nextProps, nextProps.refCount++, null !== nextProps && (init.pooledCacheLanes |= renderLanes2), init = nextProps), workInProgress2.memoizedState = {
                parent: lazyComponent,
                cache: init
              }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, init)) : (0 !== (current.lanes & renderLanes2) && (cloneUpdateQueue(current, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), init = current.memoizedState, nextProps = workInProgress2.memoizedState, init.parent !== lazyComponent ? (init = { parent: lazyComponent, cache: lazyComponent }, workInProgress2.memoizedState = init, 0 === workInProgress2.lanes && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = init), pushProvider(workInProgress2, CacheContext, lazyComponent)) : (lazyComponent = nextProps.cache, pushProvider(workInProgress2, CacheContext, lazyComponent), lazyComponent !== init.cache && propagateContextChanges(
                workInProgress2,
                [CacheContext],
                renderLanes2,
                true
              ))), reconcileChildren(
                current,
                workInProgress2,
                workInProgress2.pendingProps.children,
                renderLanes2
              ), workInProgress2.child;
            case 29:
              throw workInProgress2.pendingProps;
          }
          throw Error(formatProdErrorMessage(156, workInProgress2.tag));
        }
        function pushProvider(providerFiber, context, nextValue) {
          isPrimaryRenderer ? (push(valueCursor, context._currentValue), context._currentValue = nextValue) : (push(valueCursor, context._currentValue2), context._currentValue2 = nextValue);
        }
        function popProvider(context) {
          var currentValue = valueCursor.current;
          isPrimaryRenderer ? context._currentValue = currentValue : context._currentValue2 = currentValue;
          pop(valueCursor);
        }
        function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
          for (; null !== parent; ) {
            var alternate = parent.alternate;
            (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, null !== alternate && (alternate.childLanes |= renderLanes2)) : null !== alternate && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
            if (parent === propagationRoot) break;
            parent = parent.return;
          }
        }
        function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
          var fiber = workInProgress2.child;
          null !== fiber && (fiber.return = workInProgress2);
          for (; null !== fiber; ) {
            var list = fiber.dependencies;
            if (null !== list) {
              var nextFiber = fiber.child;
              list = list.firstContext;
              a: for (; null !== list; ) {
                var dependency = list;
                list = fiber;
                for (var i = 0; i < contexts.length; i++)
                  if (dependency.context === contexts[i]) {
                    list.lanes |= renderLanes2;
                    dependency = list.alternate;
                    null !== dependency && (dependency.lanes |= renderLanes2);
                    scheduleContextWorkOnParentPath(
                      list.return,
                      renderLanes2,
                      workInProgress2
                    );
                    forcePropagateEntireTree || (nextFiber = null);
                    break a;
                  }
                list = dependency.next;
              }
            } else if (18 === fiber.tag) {
              nextFiber = fiber.return;
              if (null === nextFiber) throw Error(formatProdErrorMessage(341));
              nextFiber.lanes |= renderLanes2;
              list = nextFiber.alternate;
              null !== list && (list.lanes |= renderLanes2);
              scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
              nextFiber = null;
            } else nextFiber = fiber.child;
            if (null !== nextFiber) nextFiber.return = fiber;
            else
              for (nextFiber = fiber; null !== nextFiber; ) {
                if (nextFiber === workInProgress2) {
                  nextFiber = null;
                  break;
                }
                fiber = nextFiber.sibling;
                if (null !== fiber) {
                  fiber.return = nextFiber.return;
                  nextFiber = fiber;
                  break;
                }
                nextFiber = nextFiber.return;
              }
            fiber = nextFiber;
          }
        }
        function propagateParentContextChanges(current, workInProgress2, renderLanes2, forcePropagateEntireTree) {
          current = null;
          for (var parent = workInProgress2, isInsidePropagationBailout = false; null !== parent; ) {
            if (!isInsidePropagationBailout) {
              if (0 !== (parent.flags & 524288)) isInsidePropagationBailout = true;
              else if (0 !== (parent.flags & 262144)) break;
            }
            if (10 === parent.tag) {
              var currentParent = parent.alternate;
              if (null === currentParent) throw Error(formatProdErrorMessage(387));
              currentParent = currentParent.memoizedProps;
              if (null !== currentParent) {
                var context = parent.type;
                objectIs(parent.pendingProps.value, currentParent.value) || (null !== current ? current.push(context) : current = [context]);
              }
            } else if (parent === hostTransitionProviderCursor.current) {
              currentParent = parent.alternate;
              if (null === currentParent) throw Error(formatProdErrorMessage(387));
              currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (null !== current ? current.push(HostTransitionContext2) : current = [HostTransitionContext2]);
            }
            parent = parent.return;
          }
          null !== current && propagateContextChanges(
            workInProgress2,
            current,
            renderLanes2,
            forcePropagateEntireTree
          );
          workInProgress2.flags |= 262144;
        }
        function checkIfContextChanged(currentDependencies) {
          for (currentDependencies = currentDependencies.firstContext; null !== currentDependencies; ) {
            var context = currentDependencies.context;
            if (!objectIs(
              isPrimaryRenderer ? context._currentValue : context._currentValue2,
              currentDependencies.memoizedValue
            ))
              return true;
            currentDependencies = currentDependencies.next;
          }
          return false;
        }
        function prepareToReadContext(workInProgress2) {
          currentlyRenderingFiber = workInProgress2;
          lastContextDependency = null;
          workInProgress2 = workInProgress2.dependencies;
          null !== workInProgress2 && (workInProgress2.firstContext = null);
        }
        function readContext(context) {
          return readContextForConsumer(currentlyRenderingFiber, context);
        }
        function readContextDuringReconciliation(consumer, context) {
          null === currentlyRenderingFiber && prepareToReadContext(consumer);
          return readContextForConsumer(consumer, context);
        }
        function readContextForConsumer(consumer, context) {
          var value = isPrimaryRenderer ? context._currentValue : context._currentValue2;
          context = { context, memoizedValue: value, next: null };
          if (null === lastContextDependency) {
            if (null === consumer) throw Error(formatProdErrorMessage(308));
            lastContextDependency = context;
            consumer.dependencies = { lanes: 0, firstContext: context };
            consumer.flags |= 524288;
          } else lastContextDependency = lastContextDependency.next = context;
          return value;
        }
        function createCache() {
          return {
            controller: new AbortControllerLocal(),
            data: /* @__PURE__ */ new Map(),
            refCount: 0
          };
        }
        function releaseCache(cache) {
          cache.refCount--;
          0 === cache.refCount && scheduleCallback$1(NormalPriority, function() {
            cache.controller.abort();
          });
        }
        function peekCacheFromPool() {
          var cacheResumedFromPreviousRender = resumedCache.current;
          return null !== cacheResumedFromPreviousRender ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
        }
        function pushTransition(offscreenWorkInProgress, prevCachePool) {
          null === prevCachePool ? push(resumedCache, resumedCache.current) : push(resumedCache, prevCachePool.pool);
        }
        function getSuspendedCache() {
          var cacheFromPool = peekCacheFromPool();
          return null === cacheFromPool ? null : {
            parent: isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2,
            pool: cacheFromPool
          };
        }
        function markUpdate(workInProgress2) {
          workInProgress2.flags |= 4;
        }
        function doesRequireClone(current, completedWork) {
          if (null !== current && current.child === completedWork.child) return false;
          if (0 !== (completedWork.flags & 16)) return true;
          for (current = completedWork.child; null !== current; ) {
            if (0 !== (current.flags & 13878) || 0 !== (current.subtreeFlags & 13878))
              return true;
            current = current.sibling;
          }
          return false;
        }
        function appendAllChildren(parent, workInProgress2, needsVisibilityToggle, isHidden) {
          if (supportsMutation)
            for (needsVisibilityToggle = workInProgress2.child; null !== needsVisibilityToggle; ) {
              if (5 === needsVisibilityToggle.tag || 6 === needsVisibilityToggle.tag)
                appendInitialChild(parent, needsVisibilityToggle.stateNode);
              else if (!(4 === needsVisibilityToggle.tag || supportsSingletons && 27 === needsVisibilityToggle.tag) && null !== needsVisibilityToggle.child) {
                needsVisibilityToggle.child.return = needsVisibilityToggle;
                needsVisibilityToggle = needsVisibilityToggle.child;
                continue;
              }
              if (needsVisibilityToggle === workInProgress2) break;
              for (; null === needsVisibilityToggle.sibling; ) {
                if (null === needsVisibilityToggle.return || needsVisibilityToggle.return === workInProgress2)
                  return;
                needsVisibilityToggle = needsVisibilityToggle.return;
              }
              needsVisibilityToggle.sibling.return = needsVisibilityToggle.return;
              needsVisibilityToggle = needsVisibilityToggle.sibling;
            }
          else if (supportsPersistence)
            for (var node$91 = workInProgress2.child; null !== node$91; ) {
              if (5 === node$91.tag) {
                var instance = node$91.stateNode;
                needsVisibilityToggle && isHidden && (instance = cloneHiddenInstance(
                  instance,
                  node$91.type,
                  node$91.memoizedProps
                ));
                appendInitialChild(parent, instance);
              } else if (6 === node$91.tag)
                instance = node$91.stateNode, needsVisibilityToggle && isHidden && (instance = cloneHiddenTextInstance(
                  instance,
                  node$91.memoizedProps
                )), appendInitialChild(parent, instance);
              else if (4 !== node$91.tag) {
                if (22 === node$91.tag && null !== node$91.memoizedState)
                  instance = node$91.child, null !== instance && (instance.return = node$91), appendAllChildren(parent, node$91, true, true);
                else if (null !== node$91.child) {
                  node$91.child.return = node$91;
                  node$91 = node$91.child;
                  continue;
                }
              }
              if (node$91 === workInProgress2) break;
              for (; null === node$91.sibling; ) {
                if (null === node$91.return || node$91.return === workInProgress2)
                  return;
                node$91 = node$91.return;
              }
              node$91.sibling.return = node$91.return;
              node$91 = node$91.sibling;
            }
        }
        function appendAllChildrenToContainer(containerChildSet, workInProgress2, needsVisibilityToggle, isHidden) {
          if (supportsPersistence)
            for (var node = workInProgress2.child; null !== node; ) {
              if (5 === node.tag) {
                var instance = node.stateNode;
                needsVisibilityToggle && isHidden && (instance = cloneHiddenInstance(
                  instance,
                  node.type,
                  node.memoizedProps
                ));
                appendChildToContainerChildSet(containerChildSet, instance);
              } else if (6 === node.tag)
                instance = node.stateNode, needsVisibilityToggle && isHidden && (instance = cloneHiddenTextInstance(
                  instance,
                  node.memoizedProps
                )), appendChildToContainerChildSet(containerChildSet, instance);
              else if (4 !== node.tag) {
                if (22 === node.tag && null !== node.memoizedState)
                  instance = node.child, null !== instance && (instance.return = node), appendAllChildrenToContainer(
                    containerChildSet,
                    node,
                    !(null !== node.memoizedProps && "manual" === node.memoizedProps.mode),
                    true
                  );
                else if (null !== node.child) {
                  node.child.return = node;
                  node = node.child;
                  continue;
                }
              }
              if (node === workInProgress2) break;
              for (; null === node.sibling; ) {
                if (null === node.return || node.return === workInProgress2) return;
                node = node.return;
              }
              node.sibling.return = node.return;
              node = node.sibling;
            }
        }
        function updateHostContainer(current, workInProgress2) {
          if (supportsPersistence && doesRequireClone(current, workInProgress2)) {
            current = workInProgress2.stateNode;
            var container = current.containerInfo, newChildSet = createContainerChildSet();
            appendAllChildrenToContainer(newChildSet, workInProgress2, false, false);
            current.pendingChildren = newChildSet;
            markUpdate(workInProgress2);
            finalizeContainerChildren(container, newChildSet);
          }
        }
        function updateHostComponent(current, workInProgress2, type, newProps) {
          if (supportsMutation)
            current.memoizedProps !== newProps && markUpdate(workInProgress2);
          else if (supportsPersistence) {
            var currentInstance = current.stateNode, oldProps$94 = current.memoizedProps;
            if ((current = doesRequireClone(current, workInProgress2)) || oldProps$94 !== newProps) {
              var currentHostContext = contextStackCursor.current;
              oldProps$94 = cloneInstance(
                currentInstance,
                type,
                oldProps$94,
                newProps,
                !current,
                null
              );
              oldProps$94 === currentInstance ? workInProgress2.stateNode = currentInstance : (finalizeInitialChildren(
                oldProps$94,
                type,
                newProps,
                currentHostContext
              ) && markUpdate(workInProgress2), workInProgress2.stateNode = oldProps$94, current ? appendAllChildren(oldProps$94, workInProgress2, false, false) : markUpdate(workInProgress2));
            } else workInProgress2.stateNode = currentInstance;
          }
        }
        function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, props) {
          if (maySuspendCommit(type, props)) {
            if (workInProgress2.flags |= 16777216, !preloadInstance(type, props))
              if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
              else
                throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
          } else workInProgress2.flags &= -16777217;
        }
        function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
          if (mayResourceSuspendCommit(resource)) {
            if (workInProgress2.flags |= 16777216, !preloadResource(resource))
              if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
              else
                throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
          } else workInProgress2.flags &= -16777217;
        }
        function scheduleRetryEffect(workInProgress2, retryQueue) {
          null !== retryQueue && (workInProgress2.flags |= 4);
          workInProgress2.flags & 16384 && (retryQueue = 22 !== workInProgress2.tag ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
        }
        function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
          if (!isHydrating)
            switch (renderState.tailMode) {
              case "hidden":
                hasRenderedATailFallback = renderState.tail;
                for (var lastTailNode = null; null !== hasRenderedATailFallback; )
                  null !== hasRenderedATailFallback.alternate && (lastTailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
                null === lastTailNode ? renderState.tail = null : lastTailNode.sibling = null;
                break;
              case "collapsed":
                lastTailNode = renderState.tail;
                for (var lastTailNode$96 = null; null !== lastTailNode; )
                  null !== lastTailNode.alternate && (lastTailNode$96 = lastTailNode), lastTailNode = lastTailNode.sibling;
                null === lastTailNode$96 ? hasRenderedATailFallback || null === renderState.tail ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode$96.sibling = null;
            }
        }
        function bubbleProperties(completedWork) {
          var didBailout = null !== completedWork.alternate && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
          if (didBailout)
            for (var child$97 = completedWork.child; null !== child$97; )
              newChildLanes |= child$97.lanes | child$97.childLanes, subtreeFlags |= child$97.subtreeFlags & 31457280, subtreeFlags |= child$97.flags & 31457280, child$97.return = completedWork, child$97 = child$97.sibling;
          else
            for (child$97 = completedWork.child; null !== child$97; )
              newChildLanes |= child$97.lanes | child$97.childLanes, subtreeFlags |= child$97.subtreeFlags, subtreeFlags |= child$97.flags, child$97.return = completedWork, child$97 = child$97.sibling;
          completedWork.subtreeFlags |= subtreeFlags;
          completedWork.childLanes = newChildLanes;
          return didBailout;
        }
        function completeWork(current, workInProgress2, renderLanes2) {
          var newProps = workInProgress2.pendingProps;
          popTreeContext(workInProgress2);
          switch (workInProgress2.tag) {
            case 16:
            case 15:
            case 0:
            case 11:
            case 7:
            case 8:
            case 12:
            case 9:
            case 14:
              return bubbleProperties(workInProgress2), null;
            case 1:
              return bubbleProperties(workInProgress2), null;
            case 3:
              renderLanes2 = workInProgress2.stateNode;
              newProps = null;
              null !== current && (newProps = current.memoizedState.cache);
              workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
              popProvider(CacheContext);
              popHostContainer();
              renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
              if (null === current || null === current.child)
                popHydrationState(workInProgress2) ? markUpdate(workInProgress2) : null === current || current.memoizedState.isDehydrated && 0 === (workInProgress2.flags & 256) || (workInProgress2.flags |= 1024, null !== hydrationErrors && (queueRecoverableErrors(hydrationErrors), hydrationErrors = null));
              updateHostContainer(current, workInProgress2);
              bubbleProperties(workInProgress2);
              return null;
            case 26:
              if (supportsResources) {
                renderLanes2 = workInProgress2.type;
                var nextResource = workInProgress2.memoizedState;
                null === current ? (markUpdate(workInProgress2), null !== nextResource ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(
                  workInProgress2,
                  nextResource
                )) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
                  workInProgress2,
                  renderLanes2,
                  newProps
                ))) : nextResource ? nextResource !== current.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(
                  workInProgress2,
                  nextResource
                )) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (supportsMutation ? current.memoizedProps !== newProps && markUpdate(workInProgress2) : updateHostComponent(
                  current,
                  workInProgress2,
                  renderLanes2,
                  newProps
                ), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
                  workInProgress2,
                  renderLanes2,
                  newProps
                ));
                return null;
              }
            case 27:
              if (supportsSingletons) {
                popHostContext(workInProgress2);
                renderLanes2 = rootInstanceStackCursor.current;
                nextResource = workInProgress2.type;
                if (null !== current && null != workInProgress2.stateNode)
                  supportsMutation ? current.memoizedProps !== newProps && markUpdate(workInProgress2) : updateHostComponent(
                    current,
                    workInProgress2,
                    nextResource,
                    newProps
                  );
                else {
                  if (!newProps) {
                    if (null === workInProgress2.stateNode)
                      throw Error(formatProdErrorMessage(166));
                    bubbleProperties(workInProgress2);
                    return null;
                  }
                  current = contextStackCursor.current;
                  popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current) : (current = resolveSingletonInstance(
                    nextResource,
                    newProps,
                    renderLanes2,
                    current,
                    true
                  ), workInProgress2.stateNode = current, markUpdate(workInProgress2));
                }
                bubbleProperties(workInProgress2);
                return null;
              }
            case 5:
              popHostContext(workInProgress2);
              renderLanes2 = workInProgress2.type;
              if (null !== current && null != workInProgress2.stateNode)
                updateHostComponent(current, workInProgress2, renderLanes2, newProps);
              else {
                if (!newProps) {
                  if (null === workInProgress2.stateNode)
                    throw Error(formatProdErrorMessage(166));
                  bubbleProperties(workInProgress2);
                  return null;
                }
                current = contextStackCursor.current;
                popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current) : (nextResource = createInstance(
                  renderLanes2,
                  newProps,
                  rootInstanceStackCursor.current,
                  current,
                  workInProgress2
                ), appendAllChildren(nextResource, workInProgress2, false, false), workInProgress2.stateNode = nextResource, finalizeInitialChildren(
                  nextResource,
                  renderLanes2,
                  newProps,
                  current
                ) && markUpdate(workInProgress2));
              }
              bubbleProperties(workInProgress2);
              preloadInstanceAndSuspendIfNeeded(
                workInProgress2,
                workInProgress2.type,
                workInProgress2.pendingProps
              );
              return null;
            case 6:
              if (current && null != workInProgress2.stateNode)
                renderLanes2 = current.memoizedProps, supportsMutation ? renderLanes2 !== newProps && markUpdate(workInProgress2) : supportsPersistence && (renderLanes2 !== newProps ? (workInProgress2.stateNode = createTextInstance(
                  newProps,
                  rootInstanceStackCursor.current,
                  contextStackCursor.current,
                  workInProgress2
                ), markUpdate(workInProgress2)) : workInProgress2.stateNode = current.stateNode);
              else {
                if ("string" !== typeof newProps && null === workInProgress2.stateNode)
                  throw Error(formatProdErrorMessage(166));
                current = rootInstanceStackCursor.current;
                renderLanes2 = contextStackCursor.current;
                if (popHydrationState(workInProgress2)) {
                  if (!supportsHydration) throw Error(formatProdErrorMessage(176));
                  current = workInProgress2.stateNode;
                  renderLanes2 = workInProgress2.memoizedProps;
                  newProps = null;
                  nextResource = hydrationParentFiber;
                  if (null !== nextResource)
                    switch (nextResource.tag) {
                      case 27:
                      case 5:
                        newProps = nextResource.memoizedProps;
                    }
                  hydrateTextInstance(
                    current,
                    renderLanes2,
                    workInProgress2,
                    newProps
                  ) || throwOnHydrationMismatch(workInProgress2);
                } else
                  workInProgress2.stateNode = createTextInstance(
                    newProps,
                    current,
                    renderLanes2,
                    workInProgress2
                  );
              }
              bubbleProperties(workInProgress2);
              return null;
            case 13:
              newProps = workInProgress2.memoizedState;
              if (null === current || null !== current.memoizedState && null !== current.memoizedState.dehydrated) {
                nextResource = popHydrationState(workInProgress2);
                if (null !== newProps && null !== newProps.dehydrated) {
                  if (null === current) {
                    if (!nextResource) throw Error(formatProdErrorMessage(318));
                    if (!supportsHydration) throw Error(formatProdErrorMessage(344));
                    nextResource = workInProgress2.memoizedState;
                    nextResource = null !== nextResource ? nextResource.dehydrated : null;
                    if (!nextResource) throw Error(formatProdErrorMessage(317));
                    hydrateSuspenseInstance(nextResource, workInProgress2);
                  } else
                    resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
                  bubbleProperties(workInProgress2);
                  nextResource = false;
                } else
                  null !== hydrationErrors && (queueRecoverableErrors(hydrationErrors), hydrationErrors = null), nextResource = true;
                if (!nextResource) {
                  if (workInProgress2.flags & 256)
                    return popSuspenseHandler(workInProgress2), workInProgress2;
                  popSuspenseHandler(workInProgress2);
                  return null;
                }
              }
              popSuspenseHandler(workInProgress2);
              if (0 !== (workInProgress2.flags & 128))
                return workInProgress2.lanes = renderLanes2, workInProgress2;
              renderLanes2 = null !== newProps;
              current = null !== current && null !== current.memoizedState;
              if (renderLanes2) {
                newProps = workInProgress2.child;
                nextResource = null;
                null !== newProps.alternate && null !== newProps.alternate.memoizedState && null !== newProps.alternate.memoizedState.cachePool && (nextResource = newProps.alternate.memoizedState.cachePool.pool);
                var cache$110 = null;
                null !== newProps.memoizedState && null !== newProps.memoizedState.cachePool && (cache$110 = newProps.memoizedState.cachePool.pool);
                cache$110 !== nextResource && (newProps.flags |= 2048);
              }
              renderLanes2 !== current && renderLanes2 && (workInProgress2.child.flags |= 8192);
              scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
              bubbleProperties(workInProgress2);
              return null;
            case 4:
              return popHostContainer(), updateHostContainer(current, workInProgress2), null === current && preparePortalMount(workInProgress2.stateNode.containerInfo), bubbleProperties(workInProgress2), null;
            case 10:
              return popProvider(workInProgress2.type), bubbleProperties(workInProgress2), null;
            case 19:
              pop(suspenseStackCursor);
              nextResource = workInProgress2.memoizedState;
              if (null === nextResource)
                return bubbleProperties(workInProgress2), null;
              newProps = 0 !== (workInProgress2.flags & 128);
              cache$110 = nextResource.rendering;
              if (null === cache$110)
                if (newProps) cutOffTailIfNeeded(nextResource, false);
                else {
                  if (0 !== workInProgressRootExitStatus || null !== current && 0 !== (current.flags & 128))
                    for (current = workInProgress2.child; null !== current; ) {
                      cache$110 = findFirstSuspended(current);
                      if (null !== cache$110) {
                        workInProgress2.flags |= 128;
                        cutOffTailIfNeeded(nextResource, false);
                        current = cache$110.updateQueue;
                        workInProgress2.updateQueue = current;
                        scheduleRetryEffect(workInProgress2, current);
                        workInProgress2.subtreeFlags = 0;
                        current = renderLanes2;
                        for (renderLanes2 = workInProgress2.child; null !== renderLanes2; )
                          resetWorkInProgress(renderLanes2, current), renderLanes2 = renderLanes2.sibling;
                        push(
                          suspenseStackCursor,
                          suspenseStackCursor.current & 1 | 2
                        );
                        return workInProgress2.child;
                      }
                      current = current.sibling;
                    }
                  null !== nextResource.tail && now() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, newProps = true, cutOffTailIfNeeded(nextResource, false), workInProgress2.lanes = 4194304);
                }
              else {
                if (!newProps)
                  if (current = findFirstSuspended(cache$110), null !== current) {
                    if (workInProgress2.flags |= 128, newProps = true, current = current.updateQueue, workInProgress2.updateQueue = current, scheduleRetryEffect(workInProgress2, current), cutOffTailIfNeeded(nextResource, true), null === nextResource.tail && "hidden" === nextResource.tailMode && !cache$110.alternate && !isHydrating)
                      return bubbleProperties(workInProgress2), null;
                  } else
                    2 * now() - nextResource.renderingStartTime > workInProgressRootRenderTargetTime && 536870912 !== renderLanes2 && (workInProgress2.flags |= 128, newProps = true, cutOffTailIfNeeded(nextResource, false), workInProgress2.lanes = 4194304);
                nextResource.isBackwards ? (cache$110.sibling = workInProgress2.child, workInProgress2.child = cache$110) : (current = nextResource.last, null !== current ? current.sibling = cache$110 : workInProgress2.child = cache$110, nextResource.last = cache$110);
              }
              if (null !== nextResource.tail)
                return workInProgress2 = nextResource.tail, nextResource.rendering = workInProgress2, nextResource.tail = workInProgress2.sibling, nextResource.renderingStartTime = now(), workInProgress2.sibling = null, current = suspenseStackCursor.current, push(
                  suspenseStackCursor,
                  newProps ? current & 1 | 2 : current & 1
                ), workInProgress2;
              bubbleProperties(workInProgress2);
              return null;
            case 22:
            case 23:
              return popSuspenseHandler(workInProgress2), popHiddenContext(), newProps = null !== workInProgress2.memoizedState, null !== current ? null !== current.memoizedState !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? 0 !== (renderLanes2 & 536870912) && 0 === (workInProgress2.flags & 128) && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, null !== renderLanes2 && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (renderLanes2 = current.memoizedState.cachePool.pool), newProps = null, null !== workInProgress2.memoizedState && null !== workInProgress2.memoizedState.cachePool && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), null !== current && pop(resumedCache), null;
            case 24:
              return renderLanes2 = null, null !== current && (renderLanes2 = current.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress2), null;
            case 25:
              return null;
          }
          throw Error(formatProdErrorMessage(156, workInProgress2.tag));
        }
        function unwindWork(current, workInProgress2) {
          popTreeContext(workInProgress2);
          switch (workInProgress2.tag) {
            case 1:
              return current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
            case 3:
              return popProvider(CacheContext), popHostContainer(), current = workInProgress2.flags, 0 !== (current & 65536) && 0 === (current & 128) ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
            case 26:
            case 27:
            case 5:
              return popHostContext(workInProgress2), null;
            case 13:
              popSuspenseHandler(workInProgress2);
              current = workInProgress2.memoizedState;
              if (null !== current && null !== current.dehydrated) {
                if (null === workInProgress2.alternate)
                  throw Error(formatProdErrorMessage(340));
                resetHydrationState();
              }
              current = workInProgress2.flags;
              return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
            case 19:
              return pop(suspenseStackCursor), null;
            case 4:
              return popHostContainer(), null;
            case 10:
              return popProvider(workInProgress2.type), null;
            case 22:
            case 23:
              return popSuspenseHandler(workInProgress2), popHiddenContext(), null !== current && pop(resumedCache), current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
            case 24:
              return popProvider(CacheContext), null;
            case 25:
              return null;
            default:
              return null;
          }
        }
        function unwindInterruptedWork(current, interruptedWork) {
          popTreeContext(interruptedWork);
          switch (interruptedWork.tag) {
            case 3:
              popProvider(CacheContext);
              popHostContainer();
              break;
            case 26:
            case 27:
            case 5:
              popHostContext(interruptedWork);
              break;
            case 4:
              popHostContainer();
              break;
            case 13:
              popSuspenseHandler(interruptedWork);
              break;
            case 19:
              pop(suspenseStackCursor);
              break;
            case 10:
              popProvider(interruptedWork.type);
              break;
            case 22:
            case 23:
              popSuspenseHandler(interruptedWork);
              popHiddenContext();
              null !== current && pop(resumedCache);
              break;
            case 24:
              popProvider(CacheContext);
          }
        }
        function commitHookEffectListMount(flags, finishedWork) {
          try {
            var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
            if (null !== lastEffect) {
              var firstEffect = lastEffect.next;
              updateQueue = firstEffect;
              do {
                if ((updateQueue.tag & flags) === flags) {
                  lastEffect = void 0;
                  var create = updateQueue.create, inst = updateQueue.inst;
                  lastEffect = create();
                  inst.destroy = lastEffect;
                }
                updateQueue = updateQueue.next;
              } while (updateQueue !== firstEffect);
            }
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
        function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
          try {
            var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
            if (null !== lastEffect) {
              var firstEffect = lastEffect.next;
              updateQueue = firstEffect;
              do {
                if ((updateQueue.tag & flags) === flags) {
                  var inst = updateQueue.inst, destroy = inst.destroy;
                  if (void 0 !== destroy) {
                    inst.destroy = void 0;
                    lastEffect = finishedWork;
                    var nearestMountedAncestor = nearestMountedAncestor$jscomp$0;
                    try {
                      destroy();
                    } catch (error) {
                      captureCommitPhaseError(
                        lastEffect,
                        nearestMountedAncestor,
                        error
                      );
                    }
                  }
                }
                updateQueue = updateQueue.next;
              } while (updateQueue !== firstEffect);
            }
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
        function commitClassCallbacks(finishedWork) {
          var updateQueue = finishedWork.updateQueue;
          if (null !== updateQueue) {
            var instance = finishedWork.stateNode;
            try {
              commitCallbacks(updateQueue, instance);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }
        function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
          instance.props = resolveClassComponentProps(
            current.type,
            current.memoizedProps
          );
          instance.state = current.memoizedState;
          try {
            instance.componentWillUnmount();
          } catch (error) {
            captureCommitPhaseError(current, nearestMountedAncestor, error);
          }
        }
        function safelyAttachRef(current, nearestMountedAncestor) {
          try {
            var ref = current.ref;
            if (null !== ref) {
              var instance = current.stateNode;
              switch (current.tag) {
                case 26:
                case 27:
                case 5:
                  var instanceToUse = getPublicInstance(instance);
                  break;
                default:
                  instanceToUse = instance;
              }
              "function" === typeof ref ? current.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
            }
          } catch (error) {
            captureCommitPhaseError(current, nearestMountedAncestor, error);
          }
        }
        function safelyDetachRef(current, nearestMountedAncestor) {
          var ref = current.ref, refCleanup = current.refCleanup;
          if (null !== ref)
            if ("function" === typeof refCleanup)
              try {
                refCleanup();
              } catch (error) {
                captureCommitPhaseError(current, nearestMountedAncestor, error);
              } finally {
                current.refCleanup = null, current = current.alternate, null != current && (current.refCleanup = null);
              }
            else if ("function" === typeof ref)
              try {
                ref(null);
              } catch (error$126) {
                captureCommitPhaseError(current, nearestMountedAncestor, error$126);
              }
            else ref.current = null;
        }
        function commitHostMount(finishedWork) {
          var type = finishedWork.type, props = finishedWork.memoizedProps, instance = finishedWork.stateNode;
          try {
            commitMount(instance, type, props, finishedWork);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
        function commitHostUpdate(finishedWork, newProps, oldProps) {
          try {
            commitUpdate(
              finishedWork.stateNode,
              finishedWork.type,
              oldProps,
              newProps,
              finishedWork
            );
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
        function isHostParent(fiber) {
          return 5 === fiber.tag || 3 === fiber.tag || (supportsResources ? 26 === fiber.tag : false) || (supportsSingletons ? 27 === fiber.tag : false) || 4 === fiber.tag;
        }
        function getHostSibling(fiber) {
          a: for (; ; ) {
            for (; null === fiber.sibling; ) {
              if (null === fiber.return || isHostParent(fiber.return)) return null;
              fiber = fiber.return;
            }
            fiber.sibling.return = fiber.return;
            for (fiber = fiber.sibling; 5 !== fiber.tag && 6 !== fiber.tag && (supportsSingletons ? 27 !== fiber.tag : 1) && 18 !== fiber.tag; ) {
              if (fiber.flags & 2) continue a;
              if (null === fiber.child || 4 === fiber.tag) continue a;
              else fiber.child.return = fiber, fiber = fiber.child;
            }
            if (!(fiber.flags & 2)) return fiber.stateNode;
          }
        }
        function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
          var tag = node.tag;
          if (5 === tag || 6 === tag)
            node = node.stateNode, before ? insertInContainerBefore(parent, node, before) : appendChildToContainer(parent, node);
          else if (!(4 === tag || supportsSingletons && 27 === tag) && (node = node.child, null !== node))
            for (insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling; null !== node; )
              insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;
        }
        function insertOrAppendPlacementNode(node, before, parent) {
          var tag = node.tag;
          if (5 === tag || 6 === tag)
            node = node.stateNode, before ? insertBefore2(parent, node, before) : appendChild2(parent, node);
          else if (!(4 === tag || supportsSingletons && 27 === tag) && (node = node.child, null !== node))
            for (insertOrAppendPlacementNode(node, before, parent), node = node.sibling; null !== node; )
              insertOrAppendPlacementNode(node, before, parent), node = node.sibling;
        }
        function commitHostPortalContainerChildren(portal, finishedWork, pendingChildren) {
          portal = portal.containerInfo;
          try {
            replaceContainerChildren(portal, pendingChildren);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
        function commitBeforeMutationEffects(root, firstChild) {
          prepareForCommit(root.containerInfo);
          for (nextEffect = firstChild; null !== nextEffect; )
            if (root = nextEffect, firstChild = root.child, 0 !== (root.subtreeFlags & 1028) && null !== firstChild)
              firstChild.return = root, nextEffect = firstChild;
            else
              for (; null !== nextEffect; ) {
                root = nextEffect;
                var current = root.alternate;
                firstChild = root.flags;
                switch (root.tag) {
                  case 0:
                    break;
                  case 11:
                  case 15:
                    break;
                  case 1:
                    if (0 !== (firstChild & 1024) && null !== current) {
                      firstChild = void 0;
                      var finishedWork = root, prevProps = current.memoizedProps;
                      current = current.memoizedState;
                      var instance = finishedWork.stateNode;
                      try {
                        var resolvedPrevProps = resolveClassComponentProps(
                          finishedWork.type,
                          prevProps,
                          finishedWork.elementType === finishedWork.type
                        );
                        firstChild = instance.getSnapshotBeforeUpdate(
                          resolvedPrevProps,
                          current
                        );
                        instance.__reactInternalSnapshotBeforeUpdate = firstChild;
                      } catch (error) {
                        captureCommitPhaseError(
                          finishedWork,
                          finishedWork.return,
                          error
                        );
                      }
                    }
                    break;
                  case 3:
                    0 !== (firstChild & 1024) && supportsMutation && clearContainer(root.stateNode.containerInfo);
                    break;
                  case 5:
                  case 26:
                  case 27:
                  case 6:
                  case 4:
                  case 17:
                    break;
                  default:
                    if (0 !== (firstChild & 1024))
                      throw Error(formatProdErrorMessage(163));
                }
                firstChild = root.sibling;
                if (null !== firstChild) {
                  firstChild.return = root.return;
                  nextEffect = firstChild;
                  break;
                }
                nextEffect = root.return;
              }
          resolvedPrevProps = shouldFireAfterActiveInstanceBlur;
          shouldFireAfterActiveInstanceBlur = false;
          return resolvedPrevProps;
        }
        function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork) {
          var flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 15:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              flags & 4 && commitHookEffectListMount(5, finishedWork);
              break;
            case 1:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              if (flags & 4)
                if (finishedRoot = finishedWork.stateNode, null === current)
                  try {
                    finishedRoot.componentDidMount();
                  } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error);
                  }
                else {
                  var prevProps = resolveClassComponentProps(
                    finishedWork.type,
                    current.memoizedProps
                  );
                  current = current.memoizedState;
                  try {
                    finishedRoot.componentDidUpdate(
                      prevProps,
                      current,
                      finishedRoot.__reactInternalSnapshotBeforeUpdate
                    );
                  } catch (error$125) {
                    captureCommitPhaseError(
                      finishedWork,
                      finishedWork.return,
                      error$125
                    );
                  }
                }
              flags & 64 && commitClassCallbacks(finishedWork);
              flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
              break;
            case 3:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              if (flags & 64 && (flags = finishedWork.updateQueue, null !== flags)) {
                finishedRoot = null;
                if (null !== finishedWork.child)
                  switch (finishedWork.child.tag) {
                    case 27:
                    case 5:
                      finishedRoot = getPublicInstance(finishedWork.child.stateNode);
                      break;
                    case 1:
                      finishedRoot = finishedWork.child.stateNode;
                  }
                try {
                  commitCallbacks(flags, finishedRoot);
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              }
              break;
            case 26:
              if (supportsResources) {
                recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
                flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
                break;
              }
            case 27:
            case 5:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              null === current && flags & 4 && commitHostMount(finishedWork);
              flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
              break;
            case 12:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              break;
            case 13:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
              break;
            case 22:
              prevProps = null !== finishedWork.memoizedState || offscreenSubtreeIsHidden;
              if (!prevProps) {
                current = null !== current && null !== current.memoizedState || offscreenSubtreeWasHidden;
                var prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
                offscreenSubtreeIsHidden = prevProps;
                (offscreenSubtreeWasHidden = current) && !prevOffscreenSubtreeWasHidden ? recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  0 !== (finishedWork.subtreeFlags & 8772)
                ) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
                offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
                offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
              }
              flags & 512 && ("manual" === finishedWork.memoizedProps.mode ? safelyAttachRef(finishedWork, finishedWork.return) : safelyDetachRef(finishedWork, finishedWork.return));
              break;
            default:
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          }
        }
        function detachFiberAfterEffects(fiber) {
          var alternate = fiber.alternate;
          null !== alternate && (fiber.alternate = null, detachFiberAfterEffects(alternate));
          fiber.child = null;
          fiber.deletions = null;
          fiber.sibling = null;
          5 === fiber.tag && (alternate = fiber.stateNode, null !== alternate && detachDeletedInstance(alternate));
          fiber.stateNode = null;
          fiber.return = null;
          fiber.dependencies = null;
          fiber.memoizedProps = null;
          fiber.memoizedState = null;
          fiber.pendingProps = null;
          fiber.stateNode = null;
          fiber.updateQueue = null;
        }
        function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
          for (parent = parent.child; null !== parent; )
            commitDeletionEffectsOnFiber(
              finishedRoot,
              nearestMountedAncestor,
              parent
            ), parent = parent.sibling;
        }
        function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
          if (injectedHook && "function" === typeof injectedHook.onCommitFiberUnmount)
            try {
              injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
            } catch (err) {
            }
          switch (deletedFiber.tag) {
            case 26:
              if (supportsResources) {
                offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
                recursivelyTraverseDeletionEffects(
                  finishedRoot,
                  nearestMountedAncestor,
                  deletedFiber
                );
                deletedFiber.memoizedState ? releaseResource(deletedFiber.memoizedState) : deletedFiber.stateNode && unmountHoistable(deletedFiber.stateNode);
                break;
              }
            case 27:
              if (supportsSingletons) {
                offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
                var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
                hostParent = deletedFiber.stateNode;
                recursivelyTraverseDeletionEffects(
                  finishedRoot,
                  nearestMountedAncestor,
                  deletedFiber
                );
                releaseSingletonInstance(deletedFiber.stateNode);
                hostParent = prevHostParent;
                hostParentIsContainer = prevHostParentIsContainer;
                break;
              }
            case 5:
              offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
            case 6:
              if (supportsMutation) {
                if (prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer, hostParent = null, recursivelyTraverseDeletionEffects(
                  finishedRoot,
                  nearestMountedAncestor,
                  deletedFiber
                ), hostParent = prevHostParent, hostParentIsContainer = prevHostParentIsContainer, null !== hostParent)
                  if (hostParentIsContainer)
                    try {
                      removeChildFromContainer(hostParent, deletedFiber.stateNode);
                    } catch (error) {
                      captureCommitPhaseError(
                        deletedFiber,
                        nearestMountedAncestor,
                        error
                      );
                    }
                  else
                    try {
                      removeChild2(hostParent, deletedFiber.stateNode);
                    } catch (error) {
                      captureCommitPhaseError(
                        deletedFiber,
                        nearestMountedAncestor,
                        error
                      );
                    }
              } else
                recursivelyTraverseDeletionEffects(
                  finishedRoot,
                  nearestMountedAncestor,
                  deletedFiber
                );
              break;
            case 18:
              supportsMutation && null !== hostParent && (hostParentIsContainer ? clearSuspenseBoundaryFromContainer(
                hostParent,
                deletedFiber.stateNode
              ) : clearSuspenseBoundary(hostParent, deletedFiber.stateNode));
              break;
            case 4:
              supportsMutation ? (prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer, hostParent = deletedFiber.stateNode.containerInfo, hostParentIsContainer = true, recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              ), hostParent = prevHostParent, hostParentIsContainer = prevHostParentIsContainer) : (supportsPersistence && commitHostPortalContainerChildren(
                deletedFiber.stateNode,
                deletedFiber,
                createContainerChildSet()
              ), recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              ));
              break;
            case 0:
            case 11:
            case 14:
            case 15:
              offscreenSubtreeWasHidden || commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
              offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
              recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              );
              break;
            case 1:
              offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, "function" === typeof prevHostParent.componentWillUnmount && safelyCallComponentWillUnmount(
                deletedFiber,
                nearestMountedAncestor,
                prevHostParent
              ));
              recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              );
              break;
            case 21:
              recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              );
              break;
            case 22:
              offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
              offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || null !== deletedFiber.memoizedState;
              recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              );
              offscreenSubtreeWasHidden = prevHostParent;
              break;
            default:
              recursivelyTraverseDeletionEffects(
                finishedRoot,
                nearestMountedAncestor,
                deletedFiber
              );
          }
        }
        function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
          if (supportsHydration && null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot))))
            try {
              commitHydratedSuspenseInstance(finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
        }
        function getRetryCache(finishedWork) {
          switch (finishedWork.tag) {
            case 13:
            case 19:
              var retryCache = finishedWork.stateNode;
              null === retryCache && (retryCache = finishedWork.stateNode = new PossiblyWeakSet());
              return retryCache;
            case 22:
              return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, null === retryCache && (retryCache = finishedWork._retryCache = new PossiblyWeakSet()), retryCache;
            default:
              throw Error(formatProdErrorMessage(435, finishedWork.tag));
          }
        }
        function attachSuspenseRetryListeners(finishedWork, wakeables) {
          var retryCache = getRetryCache(finishedWork);
          wakeables.forEach(function(wakeable) {
            var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
            retryCache.has(wakeable) || (retryCache.add(wakeable), wakeable.then(retry, retry));
          });
        }
        function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
          var deletions = parentFiber.deletions;
          if (null !== deletions)
            for (var i = 0; i < deletions.length; i++) {
              var childToDelete = deletions[i], root = root$jscomp$0, returnFiber = parentFiber;
              if (supportsMutation) {
                var parent = returnFiber;
                a: for (; null !== parent; ) {
                  switch (parent.tag) {
                    case 27:
                    case 5:
                      hostParent = parent.stateNode;
                      hostParentIsContainer = false;
                      break a;
                    case 3:
                      hostParent = parent.stateNode.containerInfo;
                      hostParentIsContainer = true;
                      break a;
                    case 4:
                      hostParent = parent.stateNode.containerInfo;
                      hostParentIsContainer = true;
                      break a;
                  }
                  parent = parent.return;
                }
                if (null === hostParent) throw Error(formatProdErrorMessage(160));
                commitDeletionEffectsOnFiber(root, returnFiber, childToDelete);
                hostParent = null;
                hostParentIsContainer = false;
              } else commitDeletionEffectsOnFiber(root, returnFiber, childToDelete);
              root = childToDelete.alternate;
              null !== root && (root.return = null);
              childToDelete.return = null;
            }
          if (parentFiber.subtreeFlags & 13878)
            for (parentFiber = parentFiber.child; null !== parentFiber; )
              commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
        }
        function commitMutationEffectsOnFiber(finishedWork, root) {
          var current = finishedWork.alternate, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 14:
            case 15:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
              break;
            case 1:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
              flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, null !== finishedWork && (flags = finishedWork.callbacks, null !== flags && (current = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = null === current ? flags : current.concat(flags))));
              break;
            case 26:
              if (supportsResources) {
                var hoistableRoot = currentHoistableRoot;
                recursivelyTraverseMutationEffects(root, finishedWork);
                commitReconciliationEffects(finishedWork);
                flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
                flags & 4 && (flags = null !== current ? current.memoizedState : null, root = finishedWork.memoizedState, null === current ? null === root ? null === finishedWork.stateNode ? finishedWork.stateNode = hydrateHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.memoizedProps,
                  finishedWork
                ) : mountHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.stateNode
                ) : finishedWork.stateNode = acquireResource(
                  hoistableRoot,
                  root,
                  finishedWork.memoizedProps
                ) : flags !== root ? (null === flags ? null !== current.stateNode && unmountHoistable(current.stateNode) : releaseResource(flags), null === root ? mountHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.stateNode
                ) : acquireResource(
                  hoistableRoot,
                  root,
                  finishedWork.memoizedProps
                )) : null === root && null !== finishedWork.stateNode && commitHostUpdate(
                  finishedWork,
                  finishedWork.memoizedProps,
                  current.memoizedProps
                ));
                break;
              }
            case 27:
              if (supportsSingletons && flags & 4 && null === finishedWork.alternate) {
                hoistableRoot = finishedWork.stateNode;
                var props = finishedWork.memoizedProps;
                try {
                  clearSingleton(hoistableRoot), acquireSingletonInstance(
                    finishedWork.type,
                    props,
                    hoistableRoot,
                    finishedWork
                  );
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              }
            case 5:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
              if (supportsMutation) {
                if (finishedWork.flags & 32) {
                  root = finishedWork.stateNode;
                  try {
                    resetTextContent(root);
                  } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error);
                  }
                }
                flags & 4 && null != finishedWork.stateNode && (root = finishedWork.memoizedProps, commitHostUpdate(
                  finishedWork,
                  root,
                  null !== current ? current.memoizedProps : root
                ));
                flags & 1024 && (needsFormReset = true);
              }
              break;
            case 6:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              if (flags & 4 && supportsMutation) {
                if (null === finishedWork.stateNode)
                  throw Error(formatProdErrorMessage(162));
                flags = finishedWork.memoizedProps;
                current = null !== current ? current.memoizedProps : flags;
                root = finishedWork.stateNode;
                try {
                  commitTextUpdate(root, current, flags);
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              }
              break;
            case 3:
              supportsResources ? (prepareToCommitHoistables(), hoistableRoot = currentHoistableRoot, currentHoistableRoot = getHoistableRoot(root.containerInfo), recursivelyTraverseMutationEffects(root, finishedWork), currentHoistableRoot = hoistableRoot) : recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              if (flags & 4) {
                if (supportsMutation && supportsHydration && null !== current && current.memoizedState.isDehydrated)
                  try {
                    commitHydratedContainer(root.containerInfo);
                  } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error);
                  }
                if (supportsPersistence) {
                  flags = root.containerInfo;
                  current = root.pendingChildren;
                  try {
                    replaceContainerChildren(flags, current);
                  } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error);
                  }
                }
              }
              needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
              break;
            case 4:
              supportsResources ? (current = currentHoistableRoot, currentHoistableRoot = getHoistableRoot(
                finishedWork.stateNode.containerInfo
              ), recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork), currentHoistableRoot = current) : (recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork));
              flags & 4 && supportsPersistence && commitHostPortalContainerChildren(
                finishedWork.stateNode,
                finishedWork,
                finishedWork.stateNode.pendingChildren
              );
              break;
            case 12:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              break;
            case 13:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              finishedWork.child.flags & 8192 && null !== finishedWork.memoizedState !== (null !== current && null !== current.memoizedState) && (globalMostRecentFallbackTime = now());
              flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
              break;
            case 22:
              flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
              hoistableRoot = null !== finishedWork.memoizedState;
              var wasHidden = null !== current && null !== current.memoizedState, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
              offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || hoistableRoot;
              offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
              recursivelyTraverseMutationEffects(root, finishedWork);
              offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
              offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
              commitReconciliationEffects(finishedWork);
              root = finishedWork.stateNode;
              root._current = finishedWork;
              root._visibility &= -3;
              root._visibility |= root._pendingVisibility & 2;
              if (flags & 8192 && (root._visibility = hoistableRoot ? root._visibility & -2 : root._visibility | 1, hoistableRoot && (root = offscreenSubtreeIsHidden || offscreenSubtreeWasHidden, null === current || wasHidden || root || recursivelyTraverseDisappearLayoutEffects(finishedWork)), supportsMutation && (null === finishedWork.memoizedProps || "manual" !== finishedWork.memoizedProps.mode))) {
                a: if (current = null, supportsMutation)
                  for (root = finishedWork; ; ) {
                    if (5 === root.tag || supportsResources && 26 === root.tag || supportsSingletons && 27 === root.tag) {
                      if (null === current) {
                        wasHidden = current = root;
                        try {
                          props = wasHidden.stateNode, hoistableRoot ? hideInstance(props) : unhideInstance(
                            wasHidden.stateNode,
                            wasHidden.memoizedProps
                          );
                        } catch (error) {
                          captureCommitPhaseError(wasHidden, wasHidden.return, error);
                        }
                      }
                    } else if (6 === root.tag) {
                      if (null === current) {
                        wasHidden = root;
                        try {
                          var instance = wasHidden.stateNode;
                          hoistableRoot ? hideTextInstance(instance) : unhideTextInstance(instance, wasHidden.memoizedProps);
                        } catch (error) {
                          captureCommitPhaseError(wasHidden, wasHidden.return, error);
                        }
                      }
                    } else if ((22 !== root.tag && 23 !== root.tag || null === root.memoizedState || root === finishedWork) && null !== root.child) {
                      root.child.return = root;
                      root = root.child;
                      continue;
                    }
                    if (root === finishedWork) break a;
                    for (; null === root.sibling; ) {
                      if (null === root.return || root.return === finishedWork)
                        break a;
                      current === root && (current = null);
                      root = root.return;
                    }
                    current === root && (current = null);
                    root.sibling.return = root.return;
                    root = root.sibling;
                  }
              }
              flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (current = flags.retryQueue, null !== current && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current))));
              break;
            case 19:
              recursivelyTraverseMutationEffects(root, finishedWork);
              commitReconciliationEffects(finishedWork);
              flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
              break;
            case 21:
              break;
            default:
              recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork);
          }
        }
        function commitReconciliationEffects(finishedWork) {
          var flags = finishedWork.flags;
          if (flags & 2) {
            try {
              if (supportsMutation && (!supportsSingletons || 27 !== finishedWork.tag)) {
                a: {
                  for (var parent = finishedWork.return; null !== parent; ) {
                    if (isHostParent(parent)) {
                      var JSCompiler_inline_result = parent;
                      break a;
                    }
                    parent = parent.return;
                  }
                  throw Error(formatProdErrorMessage(160));
                }
                switch (JSCompiler_inline_result.tag) {
                  case 27:
                    if (supportsSingletons) {
                      var parent$jscomp$0 = JSCompiler_inline_result.stateNode, before = getHostSibling(finishedWork);
                      insertOrAppendPlacementNode(
                        finishedWork,
                        before,
                        parent$jscomp$0
                      );
                      break;
                    }
                  case 5:
                    var parent$127 = JSCompiler_inline_result.stateNode;
                    JSCompiler_inline_result.flags & 32 && (resetTextContent(parent$127), JSCompiler_inline_result.flags &= -33);
                    var before$128 = getHostSibling(finishedWork);
                    insertOrAppendPlacementNode(finishedWork, before$128, parent$127);
                    break;
                  case 3:
                  case 4:
                    var parent$129 = JSCompiler_inline_result.stateNode.containerInfo, before$130 = getHostSibling(finishedWork);
                    insertOrAppendPlacementNodeIntoContainer(
                      finishedWork,
                      before$130,
                      parent$129
                    );
                    break;
                  default:
                    throw Error(formatProdErrorMessage(161));
                }
              }
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
            finishedWork.flags &= -3;
          }
          flags & 4096 && (finishedWork.flags &= -4097);
        }
        function recursivelyResetForms(parentFiber) {
          if (parentFiber.subtreeFlags & 1024)
            for (parentFiber = parentFiber.child; null !== parentFiber; ) {
              var fiber = parentFiber;
              recursivelyResetForms(fiber);
              5 === fiber.tag && fiber.flags & 1024 && resetFormInstance(fiber.stateNode);
              parentFiber = parentFiber.sibling;
            }
        }
        function recursivelyTraverseLayoutEffects(root, parentFiber) {
          if (parentFiber.subtreeFlags & 8772)
            for (parentFiber = parentFiber.child; null !== parentFiber; )
              commitLayoutEffectOnFiber(root, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
        }
        function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            var finishedWork = parentFiber;
            switch (finishedWork.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
                recursivelyTraverseDisappearLayoutEffects(finishedWork);
                break;
              case 1:
                safelyDetachRef(finishedWork, finishedWork.return);
                var instance = finishedWork.stateNode;
                "function" === typeof instance.componentWillUnmount && safelyCallComponentWillUnmount(
                  finishedWork,
                  finishedWork.return,
                  instance
                );
                recursivelyTraverseDisappearLayoutEffects(finishedWork);
                break;
              case 26:
              case 27:
              case 5:
                safelyDetachRef(finishedWork, finishedWork.return);
                recursivelyTraverseDisappearLayoutEffects(finishedWork);
                break;
              case 22:
                safelyDetachRef(finishedWork, finishedWork.return);
                null === finishedWork.memoizedState && recursivelyTraverseDisappearLayoutEffects(finishedWork);
                break;
              default:
                recursivelyTraverseDisappearLayoutEffects(finishedWork);
            }
            parentFiber = parentFiber.sibling;
          }
        }
        function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, includeWorkInProgressEffects) {
          includeWorkInProgressEffects = includeWorkInProgressEffects && 0 !== (parentFiber.subtreeFlags & 8772);
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            var current = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
            switch (finishedWork.tag) {
              case 0:
              case 11:
              case 15:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                commitHookEffectListMount(4, finishedWork);
                break;
              case 1:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                current = finishedWork;
                finishedRoot = current.stateNode;
                if ("function" === typeof finishedRoot.componentDidMount)
                  try {
                    finishedRoot.componentDidMount();
                  } catch (error) {
                    captureCommitPhaseError(current, current.return, error);
                  }
                current = finishedWork;
                finishedRoot = current.updateQueue;
                if (null !== finishedRoot) {
                  var instance = current.stateNode;
                  try {
                    var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
                    if (null !== hiddenCallbacks)
                      for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0; finishedRoot < hiddenCallbacks.length; finishedRoot++)
                        callCallback(hiddenCallbacks[finishedRoot], instance);
                  } catch (error) {
                    captureCommitPhaseError(current, current.return, error);
                  }
                }
                includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
                safelyAttachRef(finishedWork, finishedWork.return);
                break;
              case 26:
              case 27:
              case 5:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                includeWorkInProgressEffects && null === current && flags & 4 && commitHostMount(finishedWork);
                safelyAttachRef(finishedWork, finishedWork.return);
                break;
              case 12:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                break;
              case 13:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
                break;
              case 22:
                null === finishedWork.memoizedState && recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
                safelyAttachRef(finishedWork, finishedWork.return);
                break;
              default:
                recursivelyTraverseReappearLayoutEffects(
                  finishedRoot,
                  finishedWork,
                  includeWorkInProgressEffects
                );
            }
            parentFiber = parentFiber.sibling;
          }
        }
        function commitOffscreenPassiveMountEffects(current, finishedWork) {
          var previousCache = null;
          null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (previousCache = current.memoizedState.cachePool.pool);
          current = null;
          null !== finishedWork.memoizedState && null !== finishedWork.memoizedState.cachePool && (current = finishedWork.memoizedState.cachePool.pool);
          current !== previousCache && (null != current && current.refCount++, null != previousCache && releaseCache(previousCache));
        }
        function commitCachePassiveMountEffect(current, finishedWork) {
          current = null;
          null !== finishedWork.alternate && (current = finishedWork.alternate.memoizedState.cache);
          finishedWork = finishedWork.memoizedState.cache;
          finishedWork !== current && (finishedWork.refCount++, null != current && releaseCache(current));
        }
        function recursivelyTraversePassiveMountEffects(root, parentFiber, committedLanes, committedTransitions) {
          if (parentFiber.subtreeFlags & 10256)
            for (parentFiber = parentFiber.child; null !== parentFiber; )
              commitPassiveMountOnFiber(
                root,
                parentFiber,
                committedLanes,
                committedTransitions
              ), parentFiber = parentFiber.sibling;
        }
        function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
          var flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 15:
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
              flags & 2048 && commitHookEffectListMount(9, finishedWork);
              break;
            case 3:
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
              flags & 2048 && (finishedRoot = null, null !== finishedWork.alternate && (finishedRoot = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== finishedRoot && (finishedWork.refCount++, null != finishedRoot && releaseCache(finishedRoot)));
              break;
            case 12:
              if (flags & 2048) {
                recursivelyTraversePassiveMountEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions
                );
                finishedRoot = finishedWork.stateNode;
                try {
                  var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
                  "function" === typeof onPostCommit && onPostCommit(
                    id,
                    null === finishedWork.alternate ? "mount" : "update",
                    finishedRoot.passiveEffectDuration,
                    -0
                  );
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              } else
                recursivelyTraversePassiveMountEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions
                );
              break;
            case 23:
              break;
            case 22:
              _finishedWork$memoize2 = finishedWork.stateNode;
              null !== finishedWork.memoizedState ? _finishedWork$memoize2._visibility & 4 ? recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              ) : recursivelyTraverseAtomicPassiveEffects(
                finishedRoot,
                finishedWork
              ) : _finishedWork$memoize2._visibility & 4 ? recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              ) : (_finishedWork$memoize2._visibility |= 4, recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                0 !== (finishedWork.subtreeFlags & 10256)
              ));
              flags & 2048 && commitOffscreenPassiveMountEffects(
                finishedWork.alternate,
                finishedWork
              );
              break;
            case 24:
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
              flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
              break;
            default:
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
          }
        }
        function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
          includeWorkInProgressEffects = includeWorkInProgressEffects && 0 !== (parentFiber.subtreeFlags & 10256);
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
            switch (finishedWork.tag) {
              case 0:
              case 11:
              case 15:
                recursivelyTraverseReconnectPassiveEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions,
                  includeWorkInProgressEffects
                );
                commitHookEffectListMount(8, finishedWork);
                break;
              case 23:
                break;
              case 22:
                var instance = finishedWork.stateNode;
                null !== finishedWork.memoizedState ? instance._visibility & 4 ? recursivelyTraverseReconnectPassiveEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions,
                  includeWorkInProgressEffects
                ) : recursivelyTraverseAtomicPassiveEffects(
                  finishedRoot,
                  finishedWork
                ) : (instance._visibility |= 4, recursivelyTraverseReconnectPassiveEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions,
                  includeWorkInProgressEffects
                ));
                includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(
                  finishedWork.alternate,
                  finishedWork
                );
                break;
              case 24:
                recursivelyTraverseReconnectPassiveEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions,
                  includeWorkInProgressEffects
                );
                includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
                break;
              default:
                recursivelyTraverseReconnectPassiveEffects(
                  finishedRoot,
                  finishedWork,
                  committedLanes,
                  committedTransitions,
                  includeWorkInProgressEffects
                );
            }
            parentFiber = parentFiber.sibling;
          }
        }
        function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
          if (parentFiber.subtreeFlags & 10256)
            for (parentFiber = parentFiber.child; null !== parentFiber; ) {
              var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
              switch (finishedWork.tag) {
                case 22:
                  recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
                  flags & 2048 && commitOffscreenPassiveMountEffects(
                    finishedWork.alternate,
                    finishedWork
                  );
                  break;
                case 24:
                  recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
                  flags & 2048 && commitCachePassiveMountEffect(
                    finishedWork.alternate,
                    finishedWork
                  );
                  break;
                default:
                  recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              }
              parentFiber = parentFiber.sibling;
            }
        }
        function recursivelyAccumulateSuspenseyCommit(parentFiber) {
          if (parentFiber.subtreeFlags & suspenseyCommitFlag)
            for (parentFiber = parentFiber.child; null !== parentFiber; )
              accumulateSuspenseyCommitOnFiber(parentFiber), parentFiber = parentFiber.sibling;
        }
        function accumulateSuspenseyCommitOnFiber(fiber) {
          switch (fiber.tag) {
            case 26:
              recursivelyAccumulateSuspenseyCommit(fiber);
              fiber.flags & suspenseyCommitFlag && (null !== fiber.memoizedState ? suspendResource(
                currentHoistableRoot,
                fiber.memoizedState,
                fiber.memoizedProps
              ) : suspendInstance(fiber.type, fiber.memoizedProps));
              break;
            case 5:
              recursivelyAccumulateSuspenseyCommit(fiber);
              fiber.flags & suspenseyCommitFlag && suspendInstance(fiber.type, fiber.memoizedProps);
              break;
            case 3:
            case 4:
              if (supportsResources) {
                var previousHoistableRoot = currentHoistableRoot;
                currentHoistableRoot = getHoistableRoot(
                  fiber.stateNode.containerInfo
                );
                recursivelyAccumulateSuspenseyCommit(fiber);
                currentHoistableRoot = previousHoistableRoot;
              } else recursivelyAccumulateSuspenseyCommit(fiber);
              break;
            case 22:
              null === fiber.memoizedState && (previousHoistableRoot = fiber.alternate, null !== previousHoistableRoot && null !== previousHoistableRoot.memoizedState ? (previousHoistableRoot = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(fiber), suspenseyCommitFlag = previousHoistableRoot) : recursivelyAccumulateSuspenseyCommit(fiber));
              break;
            default:
              recursivelyAccumulateSuspenseyCommit(fiber);
          }
        }
        function detachAlternateSiblings(parentFiber) {
          var previousFiber = parentFiber.alternate;
          if (null !== previousFiber && (parentFiber = previousFiber.child, null !== parentFiber)) {
            previousFiber.child = null;
            do
              previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
            while (null !== parentFiber);
          }
        }
        function recursivelyTraversePassiveUnmountEffects(parentFiber) {
          var deletions = parentFiber.deletions;
          if (0 !== (parentFiber.flags & 16)) {
            if (null !== deletions)
              for (var i = 0; i < deletions.length; i++) {
                var childToDelete = deletions[i];
                nextEffect = childToDelete;
                commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
                  childToDelete,
                  parentFiber
                );
              }
            detachAlternateSiblings(parentFiber);
          }
          if (parentFiber.subtreeFlags & 10256)
            for (parentFiber = parentFiber.child; null !== parentFiber; )
              commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
        }
        function commitPassiveUnmountOnFiber(finishedWork) {
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 15:
              recursivelyTraversePassiveUnmountEffects(finishedWork);
              finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
              break;
            case 3:
              recursivelyTraversePassiveUnmountEffects(finishedWork);
              break;
            case 12:
              recursivelyTraversePassiveUnmountEffects(finishedWork);
              break;
            case 22:
              var instance = finishedWork.stateNode;
              null !== finishedWork.memoizedState && instance._visibility & 4 && (null === finishedWork.return || 13 !== finishedWork.return.tag) ? (instance._visibility &= -5, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
              break;
            default:
              recursivelyTraversePassiveUnmountEffects(finishedWork);
          }
        }
        function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
          var deletions = parentFiber.deletions;
          if (0 !== (parentFiber.flags & 16)) {
            if (null !== deletions)
              for (var i = 0; i < deletions.length; i++) {
                var childToDelete = deletions[i];
                nextEffect = childToDelete;
                commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
                  childToDelete,
                  parentFiber
                );
              }
            detachAlternateSiblings(parentFiber);
          }
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            deletions = parentFiber;
            switch (deletions.tag) {
              case 0:
              case 11:
              case 15:
                commitHookEffectListUnmount(8, deletions, deletions.return);
                recursivelyTraverseDisconnectPassiveEffects(deletions);
                break;
              case 22:
                i = deletions.stateNode;
                i._visibility & 4 && (i._visibility &= -5, recursivelyTraverseDisconnectPassiveEffects(deletions));
                break;
              default:
                recursivelyTraverseDisconnectPassiveEffects(deletions);
            }
            parentFiber = parentFiber.sibling;
          }
        }
        function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
          for (; null !== nextEffect; ) {
            var fiber = nextEffect;
            switch (fiber.tag) {
              case 0:
              case 11:
              case 15:
                commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
                break;
              case 23:
              case 22:
                if (null !== fiber.memoizedState && null !== fiber.memoizedState.cachePool) {
                  var cache = fiber.memoizedState.cachePool.pool;
                  null != cache && cache.refCount++;
                }
                break;
              case 24:
                releaseCache(fiber.memoizedState.cache);
            }
            cache = fiber.child;
            if (null !== cache) cache.return = fiber, nextEffect = cache;
            else
              a: for (fiber = deletedSubtreeRoot; null !== nextEffect; ) {
                cache = nextEffect;
                var sibling = cache.sibling, returnFiber = cache.return;
                detachFiberAfterEffects(cache);
                if (cache === fiber) {
                  nextEffect = null;
                  break a;
                }
                if (null !== sibling) {
                  sibling.return = returnFiber;
                  nextEffect = sibling;
                  break a;
                }
                nextEffect = returnFiber;
              }
          }
        }
        function findFiberRootForHostRoot(hostRoot) {
          var maybeFiber = getInstanceFromNode(hostRoot);
          if (null != maybeFiber) {
            if ("string" !== typeof maybeFiber.memoizedProps["data-testname"])
              throw Error(formatProdErrorMessage(364));
            return maybeFiber;
          }
          hostRoot = findFiberRoot(hostRoot);
          if (null === hostRoot) throw Error(formatProdErrorMessage(362));
          return hostRoot.stateNode.current;
        }
        function matchSelector(fiber$jscomp$0, selector) {
          var tag = fiber$jscomp$0.tag;
          switch (selector.$$typeof) {
            case COMPONENT_TYPE:
              if (fiber$jscomp$0.type === selector.value) return true;
              break;
            case HAS_PSEUDO_CLASS_TYPE:
              a: {
                selector = selector.value;
                fiber$jscomp$0 = [fiber$jscomp$0, 0];
                for (tag = 0; tag < fiber$jscomp$0.length; ) {
                  var fiber = fiber$jscomp$0[tag++], tag$jscomp$0 = fiber.tag, selectorIndex = fiber$jscomp$0[tag++], selector$jscomp$0 = selector[selectorIndex];
                  if (5 !== tag$jscomp$0 && 26 !== tag$jscomp$0 && 27 !== tag$jscomp$0 || !isHiddenSubtree(fiber)) {
                    for (; null != selector$jscomp$0 && matchSelector(fiber, selector$jscomp$0); )
                      selectorIndex++, selector$jscomp$0 = selector[selectorIndex];
                    if (selectorIndex === selector.length) {
                      selector = true;
                      break a;
                    } else
                      for (fiber = fiber.child; null !== fiber; )
                        fiber$jscomp$0.push(fiber, selectorIndex), fiber = fiber.sibling;
                  }
                }
                selector = false;
              }
              return selector;
            case ROLE_TYPE:
              if ((5 === tag || 26 === tag || 27 === tag) && matchAccessibilityRole(fiber$jscomp$0.stateNode, selector.value))
                return true;
              break;
            case TEXT_TYPE:
              if (5 === tag || 6 === tag || 26 === tag || 27 === tag) {
                if (fiber$jscomp$0 = getTextContent(fiber$jscomp$0), null !== fiber$jscomp$0 && 0 <= fiber$jscomp$0.indexOf(selector.value))
                  return true;
              }
              break;
            case TEST_NAME_TYPE:
              if (5 === tag || 26 === tag || 27 === tag) {
                if (fiber$jscomp$0 = fiber$jscomp$0.memoizedProps["data-testname"], "string" === typeof fiber$jscomp$0 && fiber$jscomp$0.toLowerCase() === selector.value.toLowerCase())
                  return true;
              }
              break;
            default:
              throw Error(formatProdErrorMessage(365));
          }
          return false;
        }
        function selectorToString(selector) {
          switch (selector.$$typeof) {
            case COMPONENT_TYPE:
              return "<" + (getComponentNameFromType(selector.value) || "Unknown") + ">";
            case HAS_PSEUDO_CLASS_TYPE:
              return ":has(" + (selectorToString(selector) || "") + ")";
            case ROLE_TYPE:
              return '[role="' + selector.value + '"]';
            case TEXT_TYPE:
              return '"' + selector.value + '"';
            case TEST_NAME_TYPE:
              return '[data-testname="' + selector.value + '"]';
            default:
              throw Error(formatProdErrorMessage(365));
          }
        }
        function findPaths(root, selectors) {
          var matchingFibers = [];
          root = [root, 0];
          for (var index = 0; index < root.length; ) {
            var fiber = root[index++], tag = fiber.tag, selectorIndex = root[index++], selector = selectors[selectorIndex];
            if (5 !== tag && 26 !== tag && 27 !== tag || !isHiddenSubtree(fiber)) {
              for (; null != selector && matchSelector(fiber, selector); )
                selectorIndex++, selector = selectors[selectorIndex];
              if (selectorIndex === selectors.length) matchingFibers.push(fiber);
              else
                for (fiber = fiber.child; null !== fiber; )
                  root.push(fiber, selectorIndex), fiber = fiber.sibling;
            }
          }
          return matchingFibers;
        }
        function findAllNodes(hostRoot, selectors) {
          if (!supportsTestSelectors) throw Error(formatProdErrorMessage(363));
          hostRoot = findFiberRootForHostRoot(hostRoot);
          hostRoot = findPaths(hostRoot, selectors);
          selectors = [];
          hostRoot = Array.from(hostRoot);
          for (var index = 0; index < hostRoot.length; ) {
            var node = hostRoot[index++], tag = node.tag;
            if (5 === tag || 26 === tag || 27 === tag)
              isHiddenSubtree(node) || selectors.push(node.stateNode);
            else
              for (node = node.child; null !== node; )
                hostRoot.push(node), node = node.sibling;
          }
          return selectors;
        }
        function requestUpdateLane() {
          if (0 !== (executionContext & 2) && 0 !== workInProgressRootRenderLanes)
            return workInProgressRootRenderLanes & -workInProgressRootRenderLanes;
          if (null !== ReactSharedInternals.T) {
            var actionScopeLane = currentEntangledLane;
            return 0 !== actionScopeLane ? actionScopeLane : requestTransitionLane();
          }
          return resolveUpdatePriority();
        }
        function requestDeferredLane() {
          0 === workInProgressDeferredLane && (workInProgressDeferredLane = 0 === (workInProgressRootRenderLanes & 536870912) || isHydrating ? claimNextTransitionLane() : 536870912);
          var suspenseHandler = suspenseHandlerStackCursor.current;
          null !== suspenseHandler && (suspenseHandler.flags |= 32);
          return workInProgressDeferredLane;
        }
        function scheduleUpdateOnFiber(root, fiber, lane) {
          if (root === workInProgressRoot && 2 === workInProgressSuspendedReason || null !== root.cancelPendingCommit)
            prepareFreshStack(root, 0), markRootSuspended(
              root,
              workInProgressRootRenderLanes,
              workInProgressDeferredLane,
              false
            );
          markRootUpdated$1(root, lane);
          if (0 === (executionContext & 2) || root !== workInProgressRoot)
            root === workInProgressRoot && (0 === (executionContext & 2) && (workInProgressRootInterleavedUpdatedLanes |= lane), 4 === workInProgressRootExitStatus && markRootSuspended(
              root,
              workInProgressRootRenderLanes,
              workInProgressDeferredLane,
              false
            )), ensureRootIsScheduled(root);
        }
        function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
          if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
          var shouldTimeSlice = !forceSync && 0 === (lanes & 60) && 0 === (lanes & root$jscomp$0.expiredLanes) || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
          do {
            if (0 === exitStatus) {
              workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
              break;
            } else if (6 === exitStatus)
              markRootSuspended(
                root$jscomp$0,
                lanes,
                0,
                !workInProgressRootDidSkipSuspendedSiblings
              );
            else {
              forceSync = root$jscomp$0.current.alternate;
              if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
                exitStatus = renderRootSync(root$jscomp$0, lanes, false);
                renderWasConcurrent = false;
                continue;
              }
              if (2 === exitStatus) {
                renderWasConcurrent = lanes;
                if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
                  var JSCompiler_inline_result = 0;
                else
                  JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = 0 !== JSCompiler_inline_result ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
                if (0 !== JSCompiler_inline_result) {
                  lanes = JSCompiler_inline_result;
                  a: {
                    var root = root$jscomp$0;
                    exitStatus = workInProgressRootConcurrentErrors;
                    var wasRootDehydrated = supportsHydration && root.current.memoizedState.isDehydrated;
                    wasRootDehydrated && (prepareFreshStack(root, JSCompiler_inline_result).flags |= 256);
                    JSCompiler_inline_result = renderRootSync(
                      root,
                      JSCompiler_inline_result,
                      false
                    );
                    if (2 !== JSCompiler_inline_result) {
                      if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                        root.errorRecoveryDisabledLanes |= renderWasConcurrent;
                        workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                        exitStatus = 4;
                        break a;
                      }
                      renderWasConcurrent = workInProgressRootRecoverableErrors;
                      workInProgressRootRecoverableErrors = exitStatus;
                      null !== renderWasConcurrent && queueRecoverableErrors(renderWasConcurrent);
                    }
                    exitStatus = JSCompiler_inline_result;
                  }
                  renderWasConcurrent = false;
                  if (2 !== exitStatus) continue;
                }
              }
              if (1 === exitStatus) {
                prepareFreshStack(root$jscomp$0, 0);
                markRootSuspended(root$jscomp$0, lanes, 0, true);
                break;
              }
              a: {
                shouldTimeSlice = root$jscomp$0;
                switch (exitStatus) {
                  case 0:
                  case 1:
                    throw Error(formatProdErrorMessage(345));
                  case 4:
                    if ((lanes & 4194176) === lanes) {
                      markRootSuspended(
                        shouldTimeSlice,
                        lanes,
                        workInProgressDeferredLane,
                        !workInProgressRootDidSkipSuspendedSiblings
                      );
                      break a;
                    }
                    break;
                  case 2:
                    workInProgressRootRecoverableErrors = null;
                    break;
                  case 3:
                  case 5:
                    break;
                  default:
                    throw Error(formatProdErrorMessage(329));
                }
                shouldTimeSlice.finishedWork = forceSync;
                shouldTimeSlice.finishedLanes = lanes;
                if ((lanes & 62914560) === lanes && (renderWasConcurrent = globalMostRecentFallbackTime + 300 - now(), 10 < renderWasConcurrent)) {
                  markRootSuspended(
                    shouldTimeSlice,
                    lanes,
                    workInProgressDeferredLane,
                    !workInProgressRootDidSkipSuspendedSiblings
                  );
                  if (0 !== getNextLanes(shouldTimeSlice, 0)) break a;
                  shouldTimeSlice.timeoutHandle = scheduleTimeout(
                    commitRootWhenReady.bind(
                      null,
                      shouldTimeSlice,
                      forceSync,
                      workInProgressRootRecoverableErrors,
                      workInProgressTransitions,
                      workInProgressRootDidIncludeRecursiveRenderUpdate,
                      lanes,
                      workInProgressDeferredLane,
                      workInProgressRootInterleavedUpdatedLanes,
                      workInProgressSuspendedRetryLanes,
                      workInProgressRootDidSkipSuspendedSiblings,
                      2,
                      -0,
                      0
                    ),
                    renderWasConcurrent
                  );
                  break a;
                }
                commitRootWhenReady(
                  shouldTimeSlice,
                  forceSync,
                  workInProgressRootRecoverableErrors,
                  workInProgressTransitions,
                  workInProgressRootDidIncludeRecursiveRenderUpdate,
                  lanes,
                  workInProgressDeferredLane,
                  workInProgressRootInterleavedUpdatedLanes,
                  workInProgressSuspendedRetryLanes,
                  workInProgressRootDidSkipSuspendedSiblings,
                  0,
                  -0,
                  0
                );
              }
            }
            break;
          } while (1);
          ensureRootIsScheduled(root$jscomp$0);
        }
        function queueRecoverableErrors(errors) {
          null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = errors : workInProgressRootRecoverableErrors.push.apply(
            workInProgressRootRecoverableErrors,
            errors
          );
        }
        function commitRootWhenReady(root, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
          var subtreeFlags = finishedWork.subtreeFlags;
          if (subtreeFlags & 8192 || 16785408 === (subtreeFlags & 16785408)) {
            if (startSuspendingCommit(), accumulateSuspenseyCommitOnFiber(finishedWork), finishedWork = waitForCommitToBeReady(), null !== finishedWork) {
              root.cancelPendingCommit = finishedWork(
                commitRoot.bind(
                  null,
                  root,
                  recoverableErrors,
                  transitions,
                  didIncludeRenderPhaseUpdate,
                  spawnedLane,
                  updatedLanes,
                  suspendedRetryLanes,
                  1,
                  completedRenderStartTime,
                  completedRenderEndTime
                )
              );
              markRootSuspended(root, lanes, spawnedLane, !didSkipSuspendedSiblings);
              return;
            }
          }
          commitRoot(
            root,
            recoverableErrors,
            transitions,
            didIncludeRenderPhaseUpdate,
            spawnedLane,
            updatedLanes,
            suspendedRetryLanes,
            suspendedCommitReason,
            completedRenderStartTime,
            completedRenderEndTime
          );
        }
        function isRenderConsistentWithExternalStores(finishedWork) {
          for (var node = finishedWork; ; ) {
            var tag = node.tag;
            if ((0 === tag || 11 === tag || 15 === tag) && node.flags & 16384 && (tag = node.updateQueue, null !== tag && (tag = tag.stores, null !== tag)))
              for (var i = 0; i < tag.length; i++) {
                var check = tag[i], getSnapshot2 = check.getSnapshot;
                check = check.value;
                try {
                  if (!objectIs(getSnapshot2(), check)) return false;
                } catch (error) {
                  return false;
                }
              }
            tag = node.child;
            if (node.subtreeFlags & 16384 && null !== tag)
              tag.return = node, node = tag;
            else {
              if (node === finishedWork) break;
              for (; null === node.sibling; ) {
                if (null === node.return || node.return === finishedWork) return true;
                node = node.return;
              }
              node.sibling.return = node.return;
              node = node.sibling;
            }
          }
          return true;
        }
        function markRootSuspended(root, suspendedLanes, spawnedLane, didAttemptEntireTree) {
          suspendedLanes &= ~workInProgressRootPingedLanes;
          suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
          root.suspendedLanes |= suspendedLanes;
          root.pingedLanes &= ~suspendedLanes;
          didAttemptEntireTree && (root.warmLanes |= suspendedLanes);
          didAttemptEntireTree = root.expirationTimes;
          for (var lanes = suspendedLanes; 0 < lanes; ) {
            var index$6 = 31 - clz32(lanes), lane = 1 << index$6;
            didAttemptEntireTree[index$6] = -1;
            lanes &= ~lane;
          }
          0 !== spawnedLane && markSpawnedDeferredLane(root, spawnedLane, suspendedLanes);
        }
        function flushSyncWork() {
          return 0 === (executionContext & 6) ? (flushSyncWorkAcrossRoots_impl(0), false) : true;
        }
        function resetWorkInProgressStack() {
          if (null !== workInProgress) {
            if (0 === workInProgressSuspendedReason)
              var interruptedWork = workInProgress.return;
            else
              interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
            for (; null !== interruptedWork; )
              unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
            workInProgress = null;
          }
        }
        function prepareFreshStack(root, lanes) {
          root.finishedWork = null;
          root.finishedLanes = 0;
          var timeoutHandle = root.timeoutHandle;
          timeoutHandle !== noTimeout && (root.timeoutHandle = noTimeout, cancelTimeout(timeoutHandle));
          timeoutHandle = root.cancelPendingCommit;
          null !== timeoutHandle && (root.cancelPendingCommit = null, timeoutHandle());
          resetWorkInProgressStack();
          workInProgressRoot = root;
          workInProgress = timeoutHandle = createWorkInProgress(root.current, null);
          workInProgressRootRenderLanes = lanes;
          workInProgressSuspendedReason = 0;
          workInProgressThrownValue = null;
          workInProgressRootDidSkipSuspendedSiblings = false;
          workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root, lanes);
          workInProgressRootDidAttachPingListener = false;
          workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
          workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
          workInProgressRootDidIncludeRecursiveRenderUpdate = false;
          0 !== (lanes & 8) && (lanes |= lanes & 32);
          var allEntangledLanes = root.entangledLanes;
          if (0 !== allEntangledLanes)
            for (root = root.entanglements, allEntangledLanes &= lanes; 0 < allEntangledLanes; ) {
              var index$4 = 31 - clz32(allEntangledLanes), lane = 1 << index$4;
              lanes |= root[index$4];
              allEntangledLanes &= ~lane;
            }
          entangledRenderLanes = lanes;
          finishQueueingConcurrentUpdates();
          return timeoutHandle;
        }
        function handleThrow(root, thrownValue) {
          currentlyRenderingFiber$1 = null;
          ReactSharedInternals.H = ContextOnlyDispatcher;
          thrownValue === SuspenseException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : null !== thrownValue && "object" === typeof thrownValue && "function" === typeof thrownValue.then ? 6 : 1;
          workInProgressThrownValue = thrownValue;
          null === workInProgress && (workInProgressRootExitStatus = 1, logUncaughtError(
            root,
            createCapturedValueAtFiber(thrownValue, root.current)
          ));
        }
        function shouldRemainOnPreviousScreen() {
          var handler = suspenseHandlerStackCursor.current;
          return null === handler ? true : (workInProgressRootRenderLanes & 4194176) === workInProgressRootRenderLanes ? null === shellBoundary ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || 0 !== (workInProgressRootRenderLanes & 536870912) ? handler === shellBoundary : false;
        }
        function pushDispatcher() {
          var prevDispatcher = ReactSharedInternals.H;
          ReactSharedInternals.H = ContextOnlyDispatcher;
          return null === prevDispatcher ? ContextOnlyDispatcher : prevDispatcher;
        }
        function pushAsyncDispatcher() {
          var prevAsyncDispatcher = ReactSharedInternals.A;
          ReactSharedInternals.A = DefaultAsyncDispatcher;
          return prevAsyncDispatcher;
        }
        function renderDidSuspendDelayIfPossible() {
          workInProgressRootExitStatus = 4;
          workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194176) !== workInProgressRootRenderLanes && null !== suspenseHandlerStackCursor.current || (workInProgressRootIsPrerendering = true);
          0 === (workInProgressRootSkippedLanes & 134217727) && 0 === (workInProgressRootInterleavedUpdatedLanes & 134217727) || null === workInProgressRoot || markRootSuspended(
            workInProgressRoot,
            workInProgressRootRenderLanes,
            workInProgressDeferredLane,
            false
          );
        }
        function renderRootSync(root, lanes, shouldYieldForPrerendering) {
          var prevExecutionContext = executionContext;
          executionContext |= 2;
          var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
          if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes)
            workInProgressTransitions = null, prepareFreshStack(root, lanes);
          lanes = false;
          var exitStatus = workInProgressRootExitStatus;
          a: do
            try {
              if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
                var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
                switch (workInProgressSuspendedReason) {
                  case 8:
                    resetWorkInProgressStack();
                    exitStatus = 6;
                    break a;
                  case 3:
                  case 2:
                  case 6:
                    null === suspenseHandlerStackCursor.current && (lanes = true);
                    var reason = workInProgressSuspendedReason;
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, reason);
                    if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                      exitStatus = 0;
                      break a;
                    }
                    break;
                  default:
                    reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, reason);
                }
              }
              workLoopSync();
              exitStatus = workInProgressRootExitStatus;
              break;
            } catch (thrownValue$151) {
              handleThrow(root, thrownValue$151);
            }
          while (1);
          lanes && root.shellSuspendCounter++;
          lastContextDependency = currentlyRenderingFiber = null;
          executionContext = prevExecutionContext;
          ReactSharedInternals.H = prevDispatcher;
          ReactSharedInternals.A = prevAsyncDispatcher;
          null === workInProgress && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
          return exitStatus;
        }
        function workLoopSync() {
          for (; null !== workInProgress; ) performUnitOfWork(workInProgress);
        }
        function renderRootConcurrent(root, lanes) {
          var prevExecutionContext = executionContext;
          executionContext |= 2;
          var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
          workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now() + 500, prepareFreshStack(root, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(
            root,
            lanes
          );
          a: do
            try {
              if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
                lanes = workInProgress;
                var thrownValue = workInProgressThrownValue;
                b: switch (workInProgressSuspendedReason) {
                  case 1:
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 1);
                    break;
                  case 2:
                    if (isThenableResolved(thrownValue)) {
                      workInProgressSuspendedReason = 0;
                      workInProgressThrownValue = null;
                      replaySuspendedUnitOfWork(lanes);
                      break;
                    }
                    lanes = function() {
                      2 === workInProgressSuspendedReason && workInProgressRoot === root && (workInProgressSuspendedReason = 7);
                      ensureRootIsScheduled(root);
                    };
                    thrownValue.then(lanes, lanes);
                    break a;
                  case 3:
                    workInProgressSuspendedReason = 7;
                    break a;
                  case 4:
                    workInProgressSuspendedReason = 5;
                    break a;
                  case 7:
                    isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root, lanes, thrownValue, 7));
                    break;
                  case 5:
                    var resource = null;
                    switch (workInProgress.tag) {
                      case 26:
                        resource = workInProgress.memoizedState;
                      case 5:
                      case 27:
                        var hostFiber = workInProgress, type = hostFiber.type, props = hostFiber.pendingProps;
                        if (resource ? preloadResource(resource) : preloadInstance(type, props)) {
                          workInProgressSuspendedReason = 0;
                          workInProgressThrownValue = null;
                          var sibling = hostFiber.sibling;
                          if (null !== sibling) workInProgress = sibling;
                          else {
                            var returnFiber = hostFiber.return;
                            null !== returnFiber ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                          }
                          break b;
                        }
                    }
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 5);
                    break;
                  case 6:
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 6);
                    break;
                  case 8:
                    resetWorkInProgressStack();
                    workInProgressRootExitStatus = 6;
                    break a;
                  default:
                    throw Error(formatProdErrorMessage(462));
                }
              }
              workLoopConcurrent();
              break;
            } catch (thrownValue$153) {
              handleThrow(root, thrownValue$153);
            }
          while (1);
          lastContextDependency = currentlyRenderingFiber = null;
          ReactSharedInternals.H = prevDispatcher;
          ReactSharedInternals.A = prevAsyncDispatcher;
          executionContext = prevExecutionContext;
          if (null !== workInProgress) return 0;
          workInProgressRoot = null;
          workInProgressRootRenderLanes = 0;
          finishQueueingConcurrentUpdates();
          return workInProgressRootExitStatus;
        }
        function workLoopConcurrent() {
          for (; null !== workInProgress && !shouldYield(); )
            performUnitOfWork(workInProgress);
        }
        function performUnitOfWork(unitOfWork) {
          var next = beginWork(
            unitOfWork.alternate,
            unitOfWork,
            entangledRenderLanes
          );
          unitOfWork.memoizedProps = unitOfWork.pendingProps;
          null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
        }
        function replaySuspendedUnitOfWork(unitOfWork) {
          var next = unitOfWork;
          var current = next.alternate;
          switch (next.tag) {
            case 15:
            case 0:
              next = replayFunctionComponent(
                current,
                next,
                next.pendingProps,
                next.type,
                void 0,
                workInProgressRootRenderLanes
              );
              break;
            case 11:
              next = replayFunctionComponent(
                current,
                next,
                next.pendingProps,
                next.type.render,
                next.ref,
                workInProgressRootRenderLanes
              );
              break;
            case 5:
              resetHooksOnUnwind(next);
            default:
              unwindInterruptedWork(current, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current, next, entangledRenderLanes);
          }
          unitOfWork.memoizedProps = unitOfWork.pendingProps;
          null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
        }
        function throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, suspendedReason) {
          lastContextDependency = currentlyRenderingFiber = null;
          resetHooksOnUnwind(unitOfWork);
          thenableState$1 = null;
          thenableIndexCounter$1 = 0;
          var returnFiber = unitOfWork.return;
          try {
            if (throwException(
              root,
              returnFiber,
              unitOfWork,
              thrownValue,
              workInProgressRootRenderLanes
            )) {
              workInProgressRootExitStatus = 1;
              logUncaughtError(
                root,
                createCapturedValueAtFiber(thrownValue, root.current)
              );
              workInProgress = null;
              return;
            }
          } catch (error) {
            if (null !== returnFiber) throw workInProgress = returnFiber, error;
            workInProgressRootExitStatus = 1;
            logUncaughtError(
              root,
              createCapturedValueAtFiber(thrownValue, root.current)
            );
            workInProgress = null;
            return;
          }
          if (unitOfWork.flags & 32768) {
            if (isHydrating || 1 === suspendedReason) root = true;
            else if (workInProgressRootIsPrerendering || 0 !== (workInProgressRootRenderLanes & 536870912))
              root = false;
            else if (workInProgressRootDidSkipSuspendedSiblings = root = true, 2 === suspendedReason || 3 === suspendedReason || 6 === suspendedReason)
              suspendedReason = suspenseHandlerStackCursor.current, null !== suspendedReason && 13 === suspendedReason.tag && (suspendedReason.flags |= 16384);
            unwindUnitOfWork(unitOfWork, root);
          } else completeUnitOfWork(unitOfWork);
        }
        function completeUnitOfWork(unitOfWork) {
          var completedWork = unitOfWork;
          do {
            if (0 !== (completedWork.flags & 32768)) {
              unwindUnitOfWork(
                completedWork,
                workInProgressRootDidSkipSuspendedSiblings
              );
              return;
            }
            unitOfWork = completedWork.return;
            var next = completeWork(
              completedWork.alternate,
              completedWork,
              entangledRenderLanes
            );
            if (null !== next) {
              workInProgress = next;
              return;
            }
            completedWork = completedWork.sibling;
            if (null !== completedWork) {
              workInProgress = completedWork;
              return;
            }
            workInProgress = completedWork = unitOfWork;
          } while (null !== completedWork);
          0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 5);
        }
        function unwindUnitOfWork(unitOfWork, skipSiblings) {
          do {
            var next = unwindWork(unitOfWork.alternate, unitOfWork);
            if (null !== next) {
              next.flags &= 32767;
              workInProgress = next;
              return;
            }
            next = unitOfWork.return;
            null !== next && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
            if (!skipSiblings && (unitOfWork = unitOfWork.sibling, null !== unitOfWork)) {
              workInProgress = unitOfWork;
              return;
            }
            workInProgress = unitOfWork = next;
          } while (null !== unitOfWork);
          workInProgressRootExitStatus = 6;
          workInProgress = null;
        }
        function commitRoot(root, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
          var prevTransition = ReactSharedInternals.T, previousUpdateLanePriority = getCurrentUpdatePriority();
          try {
            setCurrentUpdatePriority(2), ReactSharedInternals.T = null, commitRootImpl(
              root,
              recoverableErrors,
              transitions,
              didIncludeRenderPhaseUpdate,
              previousUpdateLanePriority,
              spawnedLane,
              updatedLanes,
              suspendedRetryLanes,
              suspendedCommitReason,
              completedRenderStartTime,
              completedRenderEndTime
            );
          } finally {
            ReactSharedInternals.T = prevTransition, setCurrentUpdatePriority(previousUpdateLanePriority);
          }
        }
        function commitRootImpl(root, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, renderPriorityLevel, spawnedLane, updatedLanes, suspendedRetryLanes) {
          do
            flushPassiveEffects();
          while (null !== rootWithPendingPassiveEffects);
          if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
          var finishedWork = root.finishedWork;
          didIncludeRenderPhaseUpdate = root.finishedLanes;
          if (null === finishedWork) return null;
          root.finishedWork = null;
          root.finishedLanes = 0;
          if (finishedWork === root.current) throw Error(formatProdErrorMessage(177));
          root.callbackNode = null;
          root.callbackPriority = 0;
          root.cancelPendingCommit = null;
          var remainingLanes = finishedWork.lanes | finishedWork.childLanes;
          remainingLanes |= concurrentlyUpdatedLanes;
          markRootFinished(
            root,
            didIncludeRenderPhaseUpdate,
            remainingLanes,
            spawnedLane,
            updatedLanes,
            suspendedRetryLanes
          );
          root === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
          0 === (finishedWork.subtreeFlags & 10256) && 0 === (finishedWork.flags & 10256) || rootDoesHavePassiveEffects || (rootDoesHavePassiveEffects = true, pendingPassiveEffectsRemainingLanes = remainingLanes, pendingPassiveTransitions = transitions, scheduleCallback(NormalPriority$1, function() {
            flushPassiveEffects();
            return null;
          }));
          transitions = 0 !== (finishedWork.flags & 15990);
          0 !== (finishedWork.subtreeFlags & 15990) || transitions ? (transitions = ReactSharedInternals.T, ReactSharedInternals.T = null, spawnedLane = getCurrentUpdatePriority(), setCurrentUpdatePriority(2), updatedLanes = executionContext, executionContext |= 4, commitBeforeMutationEffects(root, finishedWork), commitMutationEffectsOnFiber(finishedWork, root), resetAfterCommit(root.containerInfo), root.current = finishedWork, commitLayoutEffectOnFiber(root, finishedWork.alternate, finishedWork), requestPaint(), executionContext = updatedLanes, setCurrentUpdatePriority(spawnedLane), ReactSharedInternals.T = transitions) : root.current = finishedWork;
          rootDoesHavePassiveEffects ? (rootDoesHavePassiveEffects = false, rootWithPendingPassiveEffects = root, pendingPassiveEffectsLanes = didIncludeRenderPhaseUpdate) : releaseRootPooledCache(root, remainingLanes);
          remainingLanes = root.pendingLanes;
          0 === remainingLanes && (legacyErrorBoundariesThatAlreadyFailed = null);
          onCommitRoot(finishedWork.stateNode);
          ensureRootIsScheduled(root);
          if (null !== recoverableErrors)
            for (renderPriorityLevel = root.onRecoverableError, finishedWork = 0; finishedWork < recoverableErrors.length; finishedWork++)
              remainingLanes = recoverableErrors[finishedWork], renderPriorityLevel(remainingLanes.value, {
                componentStack: remainingLanes.stack
              });
          0 !== (pendingPassiveEffectsLanes & 3) && flushPassiveEffects();
          remainingLanes = root.pendingLanes;
          0 !== (didIncludeRenderPhaseUpdate & 4194218) && 0 !== (remainingLanes & 42) ? root === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root) : nestedUpdateCount = 0;
          flushSyncWorkAcrossRoots_impl(0);
          return null;
        }
        function releaseRootPooledCache(root, remainingLanes) {
          0 === (root.pooledCacheLanes &= remainingLanes) && (remainingLanes = root.pooledCache, null != remainingLanes && (root.pooledCache = null, releaseCache(remainingLanes)));
        }
        function flushPassiveEffects() {
          if (null !== rootWithPendingPassiveEffects) {
            var root = rootWithPendingPassiveEffects, remainingLanes = pendingPassiveEffectsRemainingLanes;
            pendingPassiveEffectsRemainingLanes = 0;
            var renderPriority = lanesToEventPriority(pendingPassiveEffectsLanes), priority = 32 > renderPriority ? 32 : renderPriority;
            renderPriority = ReactSharedInternals.T;
            var previousPriority = getCurrentUpdatePriority();
            try {
              setCurrentUpdatePriority(priority);
              ReactSharedInternals.T = null;
              if (null === rootWithPendingPassiveEffects)
                var JSCompiler_inline_result = false;
              else {
                priority = pendingPassiveTransitions;
                pendingPassiveTransitions = null;
                var root$jscomp$0 = rootWithPendingPassiveEffects, lanes = pendingPassiveEffectsLanes;
                rootWithPendingPassiveEffects = null;
                pendingPassiveEffectsLanes = 0;
                if (0 !== (executionContext & 6))
                  throw Error(formatProdErrorMessage(331));
                var prevExecutionContext = executionContext;
                executionContext |= 4;
                commitPassiveUnmountOnFiber(root$jscomp$0.current);
                commitPassiveMountOnFiber(
                  root$jscomp$0,
                  root$jscomp$0.current,
                  lanes,
                  priority
                );
                executionContext = prevExecutionContext;
                flushSyncWorkAcrossRoots_impl(0, false);
                if (injectedHook && "function" === typeof injectedHook.onPostCommitFiberRoot)
                  try {
                    injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
                  } catch (err) {
                  }
                JSCompiler_inline_result = true;
              }
              return JSCompiler_inline_result;
            } finally {
              setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = renderPriority, releaseRootPooledCache(root, remainingLanes);
            }
          }
          return false;
        }
        function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
          sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
          sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
          rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
          null !== rootFiber && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
        }
        function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
          if (3 === sourceFiber.tag)
            captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
          else
            for (; null !== nearestMountedAncestor; ) {
              if (3 === nearestMountedAncestor.tag) {
                captureCommitPhaseErrorOnRoot(
                  nearestMountedAncestor,
                  sourceFiber,
                  error
                );
                break;
              } else if (1 === nearestMountedAncestor.tag) {
                var instance = nearestMountedAncestor.stateNode;
                if ("function" === typeof nearestMountedAncestor.type.getDerivedStateFromError || "function" === typeof instance.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
                  sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
                  error = createClassErrorUpdate(2);
                  instance = enqueueUpdate(nearestMountedAncestor, error, 2);
                  null !== instance && (initializeClassErrorUpdate(
                    error,
                    instance,
                    nearestMountedAncestor,
                    sourceFiber
                  ), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
                  break;
                }
              }
              nearestMountedAncestor = nearestMountedAncestor.return;
            }
        }
        function attachPingListener(root, wakeable, lanes) {
          var pingCache = root.pingCache;
          if (null === pingCache) {
            pingCache = root.pingCache = new PossiblyWeakMap();
            var threadIDs = /* @__PURE__ */ new Set();
            pingCache.set(wakeable, threadIDs);
          } else
            threadIDs = pingCache.get(wakeable), void 0 === threadIDs && (threadIDs = /* @__PURE__ */ new Set(), pingCache.set(wakeable, threadIDs));
          threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root = pingSuspendedRoot.bind(null, root, wakeable, lanes), wakeable.then(root, root));
        }
        function pingSuspendedRoot(root, wakeable, pingedLanes) {
          var pingCache = root.pingCache;
          null !== pingCache && pingCache.delete(wakeable);
          root.pingedLanes |= root.suspendedLanes & pingedLanes;
          root.warmLanes &= ~pingedLanes;
          workInProgressRoot === root && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (4 === workInProgressRootExitStatus || 3 === workInProgressRootExitStatus && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now() - globalMostRecentFallbackTime ? 0 === (executionContext & 2) && prepareFreshStack(root, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
          ensureRootIsScheduled(root);
        }
        function retryTimedOutBoundary(boundaryFiber, retryLane) {
          0 === retryLane && (retryLane = claimNextRetryLane());
          boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
          null !== boundaryFiber && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
        }
        function retryDehydratedSuspenseBoundary(boundaryFiber) {
          var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
          null !== suspenseState && (retryLane = suspenseState.retryLane);
          retryTimedOutBoundary(boundaryFiber, retryLane);
        }
        function resolveRetryWakeable(boundaryFiber, wakeable) {
          var retryLane = 0;
          switch (boundaryFiber.tag) {
            case 13:
              var retryCache = boundaryFiber.stateNode;
              var suspenseState = boundaryFiber.memoizedState;
              null !== suspenseState && (retryLane = suspenseState.retryLane);
              break;
            case 19:
              retryCache = boundaryFiber.stateNode;
              break;
            case 22:
              retryCache = boundaryFiber.stateNode._retryCache;
              break;
            default:
              throw Error(formatProdErrorMessage(314));
          }
          null !== retryCache && retryCache.delete(wakeable);
          retryTimedOutBoundary(boundaryFiber, retryLane);
        }
        function scheduleCallback(priorityLevel, callback) {
          return scheduleCallback$3(priorityLevel, callback);
        }
        function FiberNode(tag, pendingProps, key, mode) {
          this.tag = tag;
          this.key = key;
          this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
          this.index = 0;
          this.refCleanup = this.ref = null;
          this.pendingProps = pendingProps;
          this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
          this.mode = mode;
          this.subtreeFlags = this.flags = 0;
          this.deletions = null;
          this.childLanes = this.lanes = 0;
          this.alternate = null;
        }
        function shouldConstruct(Component) {
          Component = Component.prototype;
          return !(!Component || !Component.isReactComponent);
        }
        function createWorkInProgress(current, pendingProps) {
          var workInProgress2 = current.alternate;
          null === workInProgress2 ? (workInProgress2 = createFiber(
            current.tag,
            pendingProps,
            current.key,
            current.mode
          ), workInProgress2.elementType = current.elementType, workInProgress2.type = current.type, workInProgress2.stateNode = current.stateNode, workInProgress2.alternate = current, current.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null);
          workInProgress2.flags = current.flags & 31457280;
          workInProgress2.childLanes = current.childLanes;
          workInProgress2.lanes = current.lanes;
          workInProgress2.child = current.child;
          workInProgress2.memoizedProps = current.memoizedProps;
          workInProgress2.memoizedState = current.memoizedState;
          workInProgress2.updateQueue = current.updateQueue;
          pendingProps = current.dependencies;
          workInProgress2.dependencies = null === pendingProps ? null : {
            lanes: pendingProps.lanes,
            firstContext: pendingProps.firstContext
          };
          workInProgress2.sibling = current.sibling;
          workInProgress2.index = current.index;
          workInProgress2.ref = current.ref;
          workInProgress2.refCleanup = current.refCleanup;
          return workInProgress2;
        }
        function resetWorkInProgress(workInProgress2, renderLanes2) {
          workInProgress2.flags &= 31457282;
          var current = workInProgress2.alternate;
          null === current ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null) : (workInProgress2.childLanes = current.childLanes, workInProgress2.lanes = current.lanes, workInProgress2.child = current.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current.memoizedProps, workInProgress2.memoizedState = current.memoizedState, workInProgress2.updateQueue = current.updateQueue, workInProgress2.type = current.type, renderLanes2 = current.dependencies, workInProgress2.dependencies = null === renderLanes2 ? null : {
            lanes: renderLanes2.lanes,
            firstContext: renderLanes2.firstContext
          });
          return workInProgress2;
        }
        function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
          var fiberTag = 0;
          owner = type;
          if ("function" === typeof type) shouldConstruct(type) && (fiberTag = 1);
          else if ("string" === typeof type)
            fiberTag = supportsResources && supportsSingletons ? isHostHoistableType(type, pendingProps, contextStackCursor.current) ? 26 : isHostSingletonType(type) ? 27 : 5 : supportsResources ? isHostHoistableType(
              type,
              pendingProps,
              contextStackCursor.current
            ) ? 26 : 5 : supportsSingletons ? isHostSingletonType(type) ? 27 : 5 : 5;
          else
            a: switch (type) {
              case REACT_FRAGMENT_TYPE:
                return createFiberFromFragment(
                  pendingProps.children,
                  mode,
                  lanes,
                  key
                );
              case REACT_STRICT_MODE_TYPE:
                fiberTag = 8;
                mode |= 24;
                break;
              case REACT_PROFILER_TYPE:
                return type = createFiber(12, pendingProps, key, mode | 2), type.elementType = REACT_PROFILER_TYPE, type.lanes = lanes, type;
              case REACT_SUSPENSE_TYPE:
                return type = createFiber(13, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_TYPE, type.lanes = lanes, type;
              case REACT_SUSPENSE_LIST_TYPE:
                return type = createFiber(19, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
              case REACT_OFFSCREEN_TYPE:
                return createFiberFromOffscreen(pendingProps, mode, lanes, key);
              default:
                if ("object" === typeof type && null !== type)
                  switch (type.$$typeof) {
                    case REACT_PROVIDER_TYPE:
                    case REACT_CONTEXT_TYPE:
                      fiberTag = 10;
                      break a;
                    case REACT_CONSUMER_TYPE:
                      fiberTag = 9;
                      break a;
                    case REACT_FORWARD_REF_TYPE:
                      fiberTag = 11;
                      break a;
                    case REACT_MEMO_TYPE:
                      fiberTag = 14;
                      break a;
                    case REACT_LAZY_TYPE:
                      fiberTag = 16;
                      owner = null;
                      break a;
                  }
                fiberTag = 29;
                pendingProps = Error(
                  formatProdErrorMessage(
                    130,
                    null === type ? "null" : typeof type,
                    ""
                  )
                );
                owner = null;
            }
          key = createFiber(fiberTag, pendingProps, key, mode);
          key.elementType = type;
          key.type = owner;
          key.lanes = lanes;
          return key;
        }
        function createFiberFromFragment(elements, mode, lanes, key) {
          elements = createFiber(7, elements, key, mode);
          elements.lanes = lanes;
          return elements;
        }
        function createFiberFromOffscreen(pendingProps, mode, lanes, key) {
          pendingProps = createFiber(22, pendingProps, key, mode);
          pendingProps.elementType = REACT_OFFSCREEN_TYPE;
          pendingProps.lanes = lanes;
          var primaryChildInstance = {
            _visibility: 1,
            _pendingVisibility: 1,
            _pendingMarkers: null,
            _retryCache: null,
            _transitions: null,
            _current: null,
            detach: function() {
              var fiber = primaryChildInstance._current;
              if (null === fiber) throw Error(formatProdErrorMessage(456));
              if (0 === (primaryChildInstance._pendingVisibility & 2)) {
                var root = enqueueConcurrentRenderForLane(fiber, 2);
                null !== root && (primaryChildInstance._pendingVisibility |= 2, scheduleUpdateOnFiber(root, fiber, 2));
              }
            },
            attach: function() {
              var fiber = primaryChildInstance._current;
              if (null === fiber) throw Error(formatProdErrorMessage(456));
              if (0 !== (primaryChildInstance._pendingVisibility & 2)) {
                var root = enqueueConcurrentRenderForLane(fiber, 2);
                null !== root && (primaryChildInstance._pendingVisibility &= -3, scheduleUpdateOnFiber(root, fiber, 2));
              }
            }
          };
          pendingProps.stateNode = primaryChildInstance;
          return pendingProps;
        }
        function createFiberFromText(content, mode, lanes) {
          content = createFiber(6, content, null, mode);
          content.lanes = lanes;
          return content;
        }
        function createFiberFromPortal(portal, mode, lanes) {
          mode = createFiber(
            4,
            null !== portal.children ? portal.children : [],
            portal.key,
            mode
          );
          mode.lanes = lanes;
          mode.stateNode = {
            containerInfo: portal.containerInfo,
            pendingChildren: null,
            implementation: portal.implementation
          };
          return mode;
        }
        function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, formState) {
          this.tag = 1;
          this.containerInfo = containerInfo;
          this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
          this.timeoutHandle = noTimeout;
          this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
          this.callbackPriority = 0;
          this.expirationTimes = createLaneMap(-1);
          this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.finishedLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
          this.entanglements = createLaneMap(0);
          this.hiddenUpdates = createLaneMap(null);
          this.identifierPrefix = identifierPrefix;
          this.onUncaughtError = onUncaughtError;
          this.onCaughtError = onCaughtError;
          this.onRecoverableError = onRecoverableError;
          this.pooledCache = null;
          this.pooledCacheLanes = 0;
          this.formState = formState;
          this.incompleteTransitions = /* @__PURE__ */ new Map();
        }
        function createFiberRoot2(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, transitionCallbacks, formState) {
          containerInfo = new FiberRootNode(
            containerInfo,
            tag,
            hydrate,
            identifierPrefix,
            onUncaughtError,
            onCaughtError,
            onRecoverableError,
            formState
          );
          tag = 1;
          true === isStrictMode && (tag |= 24);
          isStrictMode = createFiber(3, null, null, tag);
          containerInfo.current = isStrictMode;
          isStrictMode.stateNode = containerInfo;
          tag = createCache();
          tag.refCount++;
          containerInfo.pooledCache = tag;
          tag.refCount++;
          isStrictMode.memoizedState = {
            element: initialChildren,
            isDehydrated: hydrate,
            cache: tag
          };
          initializeUpdateQueue(isStrictMode);
          return containerInfo;
        }
        function getContextForSubtree(parentComponent) {
          if (!parentComponent) return emptyContextObject;
          parentComponent = emptyContextObject;
          return parentComponent;
        }
        function findHostInstance(component) {
          var fiber = component._reactInternals;
          if (void 0 === fiber) {
            if ("function" === typeof component.render)
              throw Error(formatProdErrorMessage(188));
            component = Object.keys(component).join(",");
            throw Error(formatProdErrorMessage(268, component));
          }
          component = findCurrentFiberUsingSlowPath(fiber);
          component = null !== component ? findCurrentHostFiberImpl(component) : null;
          return null === component ? null : getPublicInstance(component.stateNode);
        }
        function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
          parentComponent = getContextForSubtree(parentComponent);
          null === container.context ? container.context = parentComponent : container.pendingContext = parentComponent;
          container = createUpdate(lane);
          container.payload = { element };
          callback = void 0 === callback ? null : callback;
          null !== callback && (container.callback = callback);
          element = enqueueUpdate(rootFiber, container, lane);
          null !== element && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
        }
        function markRetryLaneImpl(fiber, retryLane) {
          fiber = fiber.memoizedState;
          if (null !== fiber && null !== fiber.dehydrated) {
            var a = fiber.retryLane;
            fiber.retryLane = 0 !== a && a < retryLane ? a : retryLane;
          }
        }
        function markRetryLaneIfNotHydrated(fiber, retryLane) {
          markRetryLaneImpl(fiber, retryLane);
          (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
        }
        var exports = {};
        var React2 = requireReact(), Scheduler = requireScheduler(), assign = Object.assign, REACT_LEGACY_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element"), REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_PROVIDER_TYPE = /* @__PURE__ */ Symbol.for("react.provider"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = /* @__PURE__ */ Symbol.for("react.offscreen");
        var REACT_MEMO_CACHE_SENTINEL = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = React2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, prefix, suffix, reentry = false, isArrayImpl = Array.isArray, rendererVersion = $$$config.rendererVersion, rendererPackageName = $$$config.rendererPackageName, extraDevToolsConfig = $$$config.extraDevToolsConfig, getPublicInstance = $$$config.getPublicInstance, getRootHostContext = $$$config.getRootHostContext, getChildHostContext = $$$config.getChildHostContext, prepareForCommit = $$$config.prepareForCommit, resetAfterCommit = $$$config.resetAfterCommit, createInstance = $$$config.createInstance, appendInitialChild = $$$config.appendInitialChild, finalizeInitialChildren = $$$config.finalizeInitialChildren, shouldSetTextContent = $$$config.shouldSetTextContent, createTextInstance = $$$config.createTextInstance, scheduleTimeout = $$$config.scheduleTimeout, cancelTimeout = $$$config.cancelTimeout, noTimeout = $$$config.noTimeout, isPrimaryRenderer = $$$config.isPrimaryRenderer;
        $$$config.warnsIfNotActing;
        var supportsMutation = $$$config.supportsMutation, supportsPersistence = $$$config.supportsPersistence, supportsHydration = $$$config.supportsHydration, getInstanceFromNode = $$$config.getInstanceFromNode;
        $$$config.beforeActiveInstanceBlur;
        $$$config.afterActiveInstanceBlur;
        var preparePortalMount = $$$config.preparePortalMount;
        $$$config.prepareScopeUpdate;
        $$$config.getInstanceFromScope;
        var setCurrentUpdatePriority = $$$config.setCurrentUpdatePriority, getCurrentUpdatePriority = $$$config.getCurrentUpdatePriority, resolveUpdatePriority = $$$config.resolveUpdatePriority;
        $$$config.resolveEventType;
        $$$config.resolveEventTimeStamp;
        var shouldAttemptEagerTransition = $$$config.shouldAttemptEagerTransition, detachDeletedInstance = $$$config.detachDeletedInstance;
        $$$config.requestPostPaintCallback;
        var maySuspendCommit = $$$config.maySuspendCommit, preloadInstance = $$$config.preloadInstance, startSuspendingCommit = $$$config.startSuspendingCommit, suspendInstance = $$$config.suspendInstance, waitForCommitToBeReady = $$$config.waitForCommitToBeReady, NotPendingTransition = $$$config.NotPendingTransition, HostTransitionContext2 = $$$config.HostTransitionContext, resetFormInstance = $$$config.resetFormInstance;
        $$$config.bindToConsole;
        var supportsMicrotasks = $$$config.supportsMicrotasks, scheduleMicrotask = $$$config.scheduleMicrotask, supportsTestSelectors = $$$config.supportsTestSelectors, findFiberRoot = $$$config.findFiberRoot, getBoundingRect = $$$config.getBoundingRect, getTextContent = $$$config.getTextContent, isHiddenSubtree = $$$config.isHiddenSubtree, matchAccessibilityRole = $$$config.matchAccessibilityRole, setFocusIfFocusable = $$$config.setFocusIfFocusable, setupIntersectionObserver = $$$config.setupIntersectionObserver, appendChild2 = $$$config.appendChild, appendChildToContainer = $$$config.appendChildToContainer, commitTextUpdate = $$$config.commitTextUpdate, commitMount = $$$config.commitMount, commitUpdate = $$$config.commitUpdate, insertBefore2 = $$$config.insertBefore, insertInContainerBefore = $$$config.insertInContainerBefore, removeChild2 = $$$config.removeChild, removeChildFromContainer = $$$config.removeChildFromContainer, resetTextContent = $$$config.resetTextContent, hideInstance = $$$config.hideInstance, hideTextInstance = $$$config.hideTextInstance, unhideInstance = $$$config.unhideInstance, unhideTextInstance = $$$config.unhideTextInstance, clearContainer = $$$config.clearContainer, cloneInstance = $$$config.cloneInstance, createContainerChildSet = $$$config.createContainerChildSet, appendChildToContainerChildSet = $$$config.appendChildToContainerChildSet, finalizeContainerChildren = $$$config.finalizeContainerChildren, replaceContainerChildren = $$$config.replaceContainerChildren, cloneHiddenInstance = $$$config.cloneHiddenInstance, cloneHiddenTextInstance = $$$config.cloneHiddenTextInstance, isSuspenseInstancePending = $$$config.isSuspenseInstancePending, isSuspenseInstanceFallback = $$$config.isSuspenseInstanceFallback, getSuspenseInstanceFallbackErrorDetails = $$$config.getSuspenseInstanceFallbackErrorDetails, registerSuspenseInstanceRetry = $$$config.registerSuspenseInstanceRetry, canHydrateFormStateMarker = $$$config.canHydrateFormStateMarker, isFormStateMarkerMatching = $$$config.isFormStateMarkerMatching, getNextHydratableSibling = $$$config.getNextHydratableSibling, getFirstHydratableChild = $$$config.getFirstHydratableChild, getFirstHydratableChildWithinContainer = $$$config.getFirstHydratableChildWithinContainer, getFirstHydratableChildWithinSuspenseInstance = $$$config.getFirstHydratableChildWithinSuspenseInstance, canHydrateInstance = $$$config.canHydrateInstance, canHydrateTextInstance = $$$config.canHydrateTextInstance, canHydrateSuspenseInstance = $$$config.canHydrateSuspenseInstance, hydrateInstance = $$$config.hydrateInstance, hydrateTextInstance = $$$config.hydrateTextInstance, hydrateSuspenseInstance = $$$config.hydrateSuspenseInstance, getNextHydratableInstanceAfterSuspenseInstance = $$$config.getNextHydratableInstanceAfterSuspenseInstance, commitHydratedContainer = $$$config.commitHydratedContainer, commitHydratedSuspenseInstance = $$$config.commitHydratedSuspenseInstance, clearSuspenseBoundary = $$$config.clearSuspenseBoundary, clearSuspenseBoundaryFromContainer = $$$config.clearSuspenseBoundaryFromContainer, shouldDeleteUnhydratedTailInstances = $$$config.shouldDeleteUnhydratedTailInstances;
        $$$config.diffHydratedPropsForDevWarnings;
        $$$config.diffHydratedTextForDevWarnings;
        $$$config.describeHydratableInstanceForDevWarnings;
        var validateHydratableInstance = $$$config.validateHydratableInstance, validateHydratableTextInstance = $$$config.validateHydratableTextInstance, supportsResources = $$$config.supportsResources, isHostHoistableType = $$$config.isHostHoistableType, getHoistableRoot = $$$config.getHoistableRoot, getResource = $$$config.getResource, acquireResource = $$$config.acquireResource, releaseResource = $$$config.releaseResource, hydrateHoistable = $$$config.hydrateHoistable, mountHoistable = $$$config.mountHoistable, unmountHoistable = $$$config.unmountHoistable, createHoistableInstance = $$$config.createHoistableInstance, prepareToCommitHoistables = $$$config.prepareToCommitHoistables, mayResourceSuspendCommit = $$$config.mayResourceSuspendCommit, preloadResource = $$$config.preloadResource, suspendResource = $$$config.suspendResource, supportsSingletons = $$$config.supportsSingletons, resolveSingletonInstance = $$$config.resolveSingletonInstance, clearSingleton = $$$config.clearSingleton, acquireSingletonInstance = $$$config.acquireSingletonInstance, releaseSingletonInstance = $$$config.releaseSingletonInstance, isHostSingletonType = $$$config.isHostSingletonType, valueStack = [], index$jscomp$0 = -1, emptyContextObject = {}, clz32 = Math.clz32 ? Math.clz32 : clz32Fallback, log$1 = Math.log, LN2 = Math.LN2, nextTransitionLane = 128, nextRetryLane = 4194304, scheduleCallback$3 = Scheduler.unstable_scheduleCallback, cancelCallback$1 = Scheduler.unstable_cancelCallback, shouldYield = Scheduler.unstable_shouldYield, requestPaint = Scheduler.unstable_requestPaint, now = Scheduler.unstable_now, ImmediatePriority = Scheduler.unstable_ImmediatePriority, UserBlockingPriority = Scheduler.unstable_UserBlockingPriority, NormalPriority$1 = Scheduler.unstable_NormalPriority, IdlePriority = Scheduler.unstable_IdlePriority, log = Scheduler.log, unstable_setDisableYieldValue = Scheduler.unstable_setDisableYieldValue, rendererID = null, injectedHook = null, objectIs = "function" === typeof Object.is ? Object.is : is, CapturedStacks = /* @__PURE__ */ new WeakMap(), forkStack = [], forkStackIndex = 0, treeForkProvider = null, treeForkCount = 0, idStack = [], idStackIndex = 0, treeContextProvider = null, treeContextId = 1, treeContextOverflow = "", contextStackCursor = createCursor(null), contextFiberStackCursor = createCursor(null), rootInstanceStackCursor = createCursor(null), hostTransitionProviderCursor = createCursor(null), hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = false, hydrationErrors = null, rootOrSingletonContext = false, HydrationMismatchException = Error(formatProdErrorMessage(519)), concurrentQueues = [], concurrentQueuesIndex = 0, concurrentlyUpdatedLanes = 0, firstScheduledRoot = null, lastScheduledRoot = null, didScheduleMicrotask = false, mightHavePendingSyncWork = false, isFlushingWork = false, currentEventTransitionLane = 0, currentEntangledListeners = null, currentEntangledPendingCount = 0, currentEntangledLane = 0, currentEntangledActionThenable = null, hasForceUpdate = false, didReadFromEntangledAsyncAction = false, hasOwnProperty = Object.prototype.hasOwnProperty, SuspenseException = Error(formatProdErrorMessage(460)), SuspenseyCommitException = Error(formatProdErrorMessage(474)), noopSuspenseyCommitThenable = { then: function() {
        } }, suspendedThenable = null, thenableState$1 = null, thenableIndexCounter$1 = 0, reconcileChildFibers = createChildReconciler(true), mountChildFibers = createChildReconciler(false), currentTreeHiddenStackCursor = createCursor(null), prevEntangledRenderLanesCursor = createCursor(0), suspenseHandlerStackCursor = createCursor(null), shellBoundary = null, suspenseStackCursor = createCursor(0), renderLanes = 0, currentlyRenderingFiber$1 = null, currentHook = null, workInProgressHook = null, didScheduleRenderPhaseUpdate = false, didScheduleRenderPhaseUpdateDuringThisPass = false, shouldDoubleInvokeUserFnsInHooksDEV = false, localIdCounter = 0, thenableIndexCounter = 0, thenableState = null, globalClientIdCounter = 0;
        var createFunctionComponentUpdateQueue = function() {
          return { lastEffect: null, events: null, stores: null, memoCache: null };
        };
        var ContextOnlyDispatcher = {
          readContext,
          use,
          useCallback: throwInvalidHookError,
          useContext: throwInvalidHookError,
          useEffect: throwInvalidHookError,
          useImperativeHandle: throwInvalidHookError,
          useLayoutEffect: throwInvalidHookError,
          useInsertionEffect: throwInvalidHookError,
          useMemo: throwInvalidHookError,
          useReducer: throwInvalidHookError,
          useRef: throwInvalidHookError,
          useState: throwInvalidHookError,
          useDebugValue: throwInvalidHookError,
          useDeferredValue: throwInvalidHookError,
          useTransition: throwInvalidHookError,
          useSyncExternalStore: throwInvalidHookError,
          useId: throwInvalidHookError
        };
        ContextOnlyDispatcher.useCacheRefresh = throwInvalidHookError;
        ContextOnlyDispatcher.useMemoCache = throwInvalidHookError;
        ContextOnlyDispatcher.useHostTransitionStatus = throwInvalidHookError;
        ContextOnlyDispatcher.useFormState = throwInvalidHookError;
        ContextOnlyDispatcher.useActionState = throwInvalidHookError;
        ContextOnlyDispatcher.useOptimistic = throwInvalidHookError;
        var HooksDispatcherOnMount = {
          readContext,
          use,
          useCallback: function(callback, deps) {
            mountWorkInProgressHook().memoizedState = [
              callback,
              void 0 === deps ? null : deps
            ];
            return callback;
          },
          useContext: readContext,
          useEffect: mountEffect,
          useImperativeHandle: function(ref, create, deps) {
            deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
            mountEffectImpl(
              4194308,
              4,
              imperativeHandleEffect.bind(null, create, ref),
              deps
            );
          },
          useLayoutEffect: function(create, deps) {
            return mountEffectImpl(4194308, 4, create, deps);
          },
          useInsertionEffect: function(create, deps) {
            mountEffectImpl(4, 2, create, deps);
          },
          useMemo: function(nextCreate, deps) {
            var hook = mountWorkInProgressHook();
            deps = void 0 === deps ? null : deps;
            var nextValue = nextCreate();
            if (shouldDoubleInvokeUserFnsInHooksDEV) {
              setIsStrictModeForDevtools(true);
              try {
                nextCreate();
              } finally {
                setIsStrictModeForDevtools(false);
              }
            }
            hook.memoizedState = [nextValue, deps];
            return nextValue;
          },
          useReducer: function(reducer, initialArg, init) {
            var hook = mountWorkInProgressHook();
            if (void 0 !== init) {
              var initialState = init(initialArg);
              if (shouldDoubleInvokeUserFnsInHooksDEV) {
                setIsStrictModeForDevtools(true);
                try {
                  init(initialArg);
                } finally {
                  setIsStrictModeForDevtools(false);
                }
              }
            } else initialState = initialArg;
            hook.memoizedState = hook.baseState = initialState;
            reducer = {
              pending: null,
              lanes: 0,
              dispatch: null,
              lastRenderedReducer: reducer,
              lastRenderedState: initialState
            };
            hook.queue = reducer;
            reducer = reducer.dispatch = dispatchReducerAction.bind(
              null,
              currentlyRenderingFiber$1,
              reducer
            );
            return [hook.memoizedState, reducer];
          },
          useRef: function(initialValue) {
            var hook = mountWorkInProgressHook();
            initialValue = { current: initialValue };
            return hook.memoizedState = initialValue;
          },
          useState: function(initialState) {
            initialState = mountStateImpl(initialState);
            var queue = initialState.queue, dispatch = dispatchSetState.bind(
              null,
              currentlyRenderingFiber$1,
              queue
            );
            queue.dispatch = dispatch;
            return [initialState.memoizedState, dispatch];
          },
          useDebugValue: mountDebugValue,
          useDeferredValue: function(value, initialValue) {
            var hook = mountWorkInProgressHook();
            return mountDeferredValueImpl(hook, value, initialValue);
          },
          useTransition: function() {
            var stateHook = mountStateImpl(false);
            stateHook = startTransition.bind(
              null,
              currentlyRenderingFiber$1,
              stateHook.queue,
              true,
              false
            );
            mountWorkInProgressHook().memoizedState = stateHook;
            return [false, stateHook];
          },
          useSyncExternalStore: function(subscribe2, getSnapshot2, getServerSnapshot2) {
            var fiber = currentlyRenderingFiber$1, hook = mountWorkInProgressHook();
            if (isHydrating) {
              if (void 0 === getServerSnapshot2)
                throw Error(formatProdErrorMessage(407));
              getServerSnapshot2 = getServerSnapshot2();
            } else {
              getServerSnapshot2 = getSnapshot2();
              if (null === workInProgressRoot)
                throw Error(formatProdErrorMessage(349));
              0 !== (workInProgressRootRenderLanes & 60) || pushStoreConsistencyCheck(fiber, getSnapshot2, getServerSnapshot2);
            }
            hook.memoizedState = getServerSnapshot2;
            var inst = { value: getServerSnapshot2, getSnapshot: getSnapshot2 };
            hook.queue = inst;
            mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe2), [
              subscribe2
            ]);
            fiber.flags |= 2048;
            pushEffect(
              9,
              updateStoreInstance.bind(
                null,
                fiber,
                inst,
                getServerSnapshot2,
                getSnapshot2
              ),
              { destroy: void 0 },
              null
            );
            return getServerSnapshot2;
          },
          useId: function() {
            var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
            if (isHydrating) {
              var JSCompiler_inline_result = treeContextOverflow;
              var idWithLeadingBit = treeContextId;
              JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
              identifierPrefix = ":" + identifierPrefix + "R" + JSCompiler_inline_result;
              JSCompiler_inline_result = localIdCounter++;
              0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
              identifierPrefix += ":";
            } else
              JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = ":" + identifierPrefix + "r" + JSCompiler_inline_result.toString(32) + ":";
            return hook.memoizedState = identifierPrefix;
          },
          useCacheRefresh: function() {
            return mountWorkInProgressHook().memoizedState = refreshCache.bind(
              null,
              currentlyRenderingFiber$1
            );
          }
        };
        HooksDispatcherOnMount.useMemoCache = useMemoCache;
        HooksDispatcherOnMount.useHostTransitionStatus = useHostTransitionStatus;
        HooksDispatcherOnMount.useFormState = mountActionState;
        HooksDispatcherOnMount.useActionState = mountActionState;
        HooksDispatcherOnMount.useOptimistic = function(passthrough) {
          var hook = mountWorkInProgressHook();
          hook.memoizedState = hook.baseState = passthrough;
          var queue = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: null,
            lastRenderedState: null
          };
          hook.queue = queue;
          hook = dispatchOptimisticSetState.bind(
            null,
            currentlyRenderingFiber$1,
            true,
            queue
          );
          queue.dispatch = hook;
          return [passthrough, hook];
        };
        var HooksDispatcherOnUpdate = {
          readContext,
          use,
          useCallback: updateCallback,
          useContext: readContext,
          useEffect: updateEffect,
          useImperativeHandle: updateImperativeHandle,
          useInsertionEffect: updateInsertionEffect,
          useLayoutEffect: updateLayoutEffect,
          useMemo: updateMemo,
          useReducer: updateReducer,
          useRef: updateRef,
          useState: function() {
            return updateReducer(basicStateReducer);
          },
          useDebugValue: mountDebugValue,
          useDeferredValue: function(value, initialValue) {
            var hook = updateWorkInProgressHook();
            return updateDeferredValueImpl(
              hook,
              currentHook.memoizedState,
              value,
              initialValue
            );
          },
          useTransition: function() {
            var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
            return [
              "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
              start
            ];
          },
          useSyncExternalStore: updateSyncExternalStore,
          useId: updateId
        };
        HooksDispatcherOnUpdate.useCacheRefresh = updateRefresh;
        HooksDispatcherOnUpdate.useMemoCache = useMemoCache;
        HooksDispatcherOnUpdate.useHostTransitionStatus = useHostTransitionStatus;
        HooksDispatcherOnUpdate.useFormState = updateActionState;
        HooksDispatcherOnUpdate.useActionState = updateActionState;
        HooksDispatcherOnUpdate.useOptimistic = function(passthrough, reducer) {
          var hook = updateWorkInProgressHook();
          return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
        };
        var HooksDispatcherOnRerender = {
          readContext,
          use,
          useCallback: updateCallback,
          useContext: readContext,
          useEffect: updateEffect,
          useImperativeHandle: updateImperativeHandle,
          useInsertionEffect: updateInsertionEffect,
          useLayoutEffect: updateLayoutEffect,
          useMemo: updateMemo,
          useReducer: rerenderReducer,
          useRef: updateRef,
          useState: function() {
            return rerenderReducer(basicStateReducer);
          },
          useDebugValue: mountDebugValue,
          useDeferredValue: function(value, initialValue) {
            var hook = updateWorkInProgressHook();
            return null === currentHook ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(
              hook,
              currentHook.memoizedState,
              value,
              initialValue
            );
          },
          useTransition: function() {
            var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
            return [
              "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
              start
            ];
          },
          useSyncExternalStore: updateSyncExternalStore,
          useId: updateId
        };
        HooksDispatcherOnRerender.useCacheRefresh = updateRefresh;
        HooksDispatcherOnRerender.useMemoCache = useMemoCache;
        HooksDispatcherOnRerender.useHostTransitionStatus = useHostTransitionStatus;
        HooksDispatcherOnRerender.useFormState = rerenderActionState;
        HooksDispatcherOnRerender.useActionState = rerenderActionState;
        HooksDispatcherOnRerender.useOptimistic = function(passthrough, reducer) {
          var hook = updateWorkInProgressHook();
          if (null !== currentHook)
            return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
          hook.baseState = passthrough;
          return [passthrough, hook.queue.dispatch];
        };
        var classComponentUpdater = {
          isMounted: function(component) {
            return (component = component._reactInternals) ? getNearestMountedFiber(component) === component : false;
          },
          enqueueSetState: function(inst, payload, callback) {
            inst = inst._reactInternals;
            var lane = requestUpdateLane(), update = createUpdate(lane);
            update.payload = payload;
            void 0 !== callback && null !== callback && (update.callback = callback);
            payload = enqueueUpdate(inst, update, lane);
            null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
          },
          enqueueReplaceState: function(inst, payload, callback) {
            inst = inst._reactInternals;
            var lane = requestUpdateLane(), update = createUpdate(lane);
            update.tag = 1;
            update.payload = payload;
            void 0 !== callback && null !== callback && (update.callback = callback);
            payload = enqueueUpdate(inst, update, lane);
            null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
          },
          enqueueForceUpdate: function(inst, callback) {
            inst = inst._reactInternals;
            var lane = requestUpdateLane(), update = createUpdate(lane);
            update.tag = 2;
            void 0 !== callback && null !== callback && (update.callback = callback);
            callback = enqueueUpdate(inst, update, lane);
            null !== callback && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
          }
        }, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
          if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
            var event = new window.ErrorEvent("error", {
              bubbles: true,
              cancelable: true,
              message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
              error
            });
            if (!window.dispatchEvent(event)) return;
          } else if ("object" === typeof process && "function" === typeof process.emit) {
            process.emit("uncaughtException", error);
            return;
          }
          console.error(error);
        }, SelectiveHydrationException = Error(formatProdErrorMessage(461)), didReceiveUpdate = false, SUSPENDED_MARKER = { dehydrated: null, treeContext: null, retryLane: 0 }, valueCursor = createCursor(null), currentlyRenderingFiber = null, lastContextDependency = null, AbortControllerLocal = "undefined" !== typeof AbortController ? AbortController : function() {
          var listeners2 = [], signal = this.signal = {
            aborted: false,
            addEventListener: function(type, listener) {
              listeners2.push(listener);
            }
          };
          this.abort = function() {
            signal.aborted = true;
            listeners2.forEach(function(listener) {
              return listener();
            });
          };
        }, scheduleCallback$1 = Scheduler.unstable_scheduleCallback, NormalPriority = Scheduler.unstable_NormalPriority, CacheContext = {
          $$typeof: REACT_CONTEXT_TYPE,
          Consumer: null,
          Provider: null,
          _currentValue: null,
          _currentValue2: null,
          _threadCount: 0
        }, prevOnStartTransitionFinish = ReactSharedInternals.S;
        ReactSharedInternals.S = function(transition, returnValue) {
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && entangleAsyncAction(transition, returnValue);
          null !== prevOnStartTransitionFinish && prevOnStartTransitionFinish(transition, returnValue);
        };
        var resumedCache = createCursor(null), offscreenSubtreeIsHidden = false, offscreenSubtreeWasHidden = false, needsFormReset = false, PossiblyWeakSet = "function" === typeof WeakSet ? WeakSet : Set, nextEffect = null, shouldFireAfterActiveInstanceBlur = false, hostParent = null, hostParentIsContainer = false, currentHoistableRoot = null, suspenseyCommitFlag = 8192, DefaultAsyncDispatcher = {
          getCacheForType: function(resourceType) {
            var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
            void 0 === cacheForType && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
            return cacheForType;
          }
        }, COMPONENT_TYPE = 0, HAS_PSEUDO_CLASS_TYPE = 1, ROLE_TYPE = 2, TEST_NAME_TYPE = 3, TEXT_TYPE = 4;
        if ("function" === typeof Symbol && Symbol.for) {
          var symbolFor = Symbol.for;
          COMPONENT_TYPE = symbolFor("selector.component");
          HAS_PSEUDO_CLASS_TYPE = symbolFor("selector.has_pseudo_class");
          ROLE_TYPE = symbolFor("selector.role");
          TEST_NAME_TYPE = symbolFor("selector.test_id");
          TEXT_TYPE = symbolFor("selector.text");
        }
        var PossiblyWeakMap = "function" === typeof WeakMap ? WeakMap : Map, executionContext = 0, workInProgressRoot = null, workInProgress = null, workInProgressRootRenderLanes = 0, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, workInProgressRootDidSkipSuspendedSiblings = false, workInProgressRootIsPrerendering = false, workInProgressRootDidAttachPingListener = false, entangledRenderLanes = 0, workInProgressRootExitStatus = 0, workInProgressRootSkippedLanes = 0, workInProgressRootInterleavedUpdatedLanes = 0, workInProgressRootPingedLanes = 0, workInProgressDeferredLane = 0, workInProgressSuspendedRetryLanes = 0, workInProgressRootConcurrentErrors = null, workInProgressRootRecoverableErrors = null, workInProgressRootDidIncludeRecursiveRenderUpdate = false, globalMostRecentFallbackTime = 0, workInProgressRootRenderTargetTime = Infinity, workInProgressTransitions = null, legacyErrorBoundariesThatAlreadyFailed = null, rootDoesHavePassiveEffects = false, rootWithPendingPassiveEffects = null, pendingPassiveEffectsLanes = 0, pendingPassiveEffectsRemainingLanes = 0, pendingPassiveTransitions = null, nestedUpdateCount = 0, rootWithNestedUpdates = null;
        exports.attemptContinuousHydration = function(fiber) {
          if (13 === fiber.tag) {
            var root = enqueueConcurrentRenderForLane(fiber, 67108864);
            null !== root && scheduleUpdateOnFiber(root, fiber, 67108864);
            markRetryLaneIfNotHydrated(fiber, 67108864);
          }
        };
        exports.attemptHydrationAtCurrentPriority = function(fiber) {
          if (13 === fiber.tag) {
            var lane = requestUpdateLane(), root = enqueueConcurrentRenderForLane(fiber, lane);
            null !== root && scheduleUpdateOnFiber(root, fiber, lane);
            markRetryLaneIfNotHydrated(fiber, lane);
          }
        };
        exports.attemptSynchronousHydration = function(fiber) {
          switch (fiber.tag) {
            case 3:
              fiber = fiber.stateNode;
              if (fiber.current.memoizedState.isDehydrated) {
                var lanes = getHighestPriorityLanes(fiber.pendingLanes);
                if (0 !== lanes) {
                  fiber.pendingLanes |= 2;
                  for (fiber.entangledLanes |= 2; lanes; ) {
                    var lane = 1 << 31 - clz32(lanes);
                    fiber.entanglements[1] |= lane;
                    lanes &= ~lane;
                  }
                  ensureRootIsScheduled(fiber);
                  0 === (executionContext & 6) && (workInProgressRootRenderTargetTime = now() + 500, flushSyncWorkAcrossRoots_impl(0));
                }
              }
              break;
            case 13:
              lanes = enqueueConcurrentRenderForLane(fiber, 2), null !== lanes && scheduleUpdateOnFiber(lanes, fiber, 2), flushSyncWork(), markRetryLaneIfNotHydrated(fiber, 2);
          }
        };
        exports.batchedUpdates = function(fn, a) {
          return fn(a);
        };
        exports.createComponentSelector = function(component) {
          return { $$typeof: COMPONENT_TYPE, value: component };
        };
        exports.createContainer = function(containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, transitionCallbacks) {
          return createFiberRoot2(
            containerInfo,
            tag,
            false,
            null,
            hydrationCallbacks,
            isStrictMode,
            identifierPrefix,
            onUncaughtError,
            onCaughtError,
            onRecoverableError,
            transitionCallbacks,
            null
          );
        };
        exports.createHasPseudoClassSelector = function(selectors) {
          return { $$typeof: HAS_PSEUDO_CLASS_TYPE, value: selectors };
        };
        exports.createHydrationContainer = function(initialChildren, callback, containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, transitionCallbacks, formState) {
          initialChildren = createFiberRoot2(
            containerInfo,
            tag,
            true,
            initialChildren,
            hydrationCallbacks,
            isStrictMode,
            identifierPrefix,
            onUncaughtError,
            onCaughtError,
            onRecoverableError,
            transitionCallbacks,
            formState
          );
          initialChildren.context = getContextForSubtree(null);
          containerInfo = initialChildren.current;
          tag = requestUpdateLane();
          hydrationCallbacks = createUpdate(tag);
          hydrationCallbacks.callback = void 0 !== callback && null !== callback ? callback : null;
          enqueueUpdate(containerInfo, hydrationCallbacks, tag);
          initialChildren.current.lanes = tag;
          markRootUpdated$1(initialChildren, tag);
          ensureRootIsScheduled(initialChildren);
          return initialChildren;
        };
        exports.createPortal = function(children, containerInfo, implementation) {
          var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
          return {
            $$typeof: REACT_PORTAL_TYPE,
            key: null == key ? null : "" + key,
            children,
            containerInfo,
            implementation
          };
        };
        exports.createRoleSelector = function(role) {
          return { $$typeof: ROLE_TYPE, value: role };
        };
        exports.createTestNameSelector = function(id) {
          return { $$typeof: TEST_NAME_TYPE, value: id };
        };
        exports.createTextSelector = function(text) {
          return { $$typeof: TEXT_TYPE, value: text };
        };
        exports.defaultOnCaughtError = function(error) {
          console.error(error);
        };
        exports.defaultOnRecoverableError = function(error) {
          reportGlobalError(error);
        };
        exports.defaultOnUncaughtError = function(error) {
          reportGlobalError(error);
        };
        exports.deferredUpdates = function(fn) {
          var prevTransition = ReactSharedInternals.T, previousPriority = getCurrentUpdatePriority();
          try {
            return setCurrentUpdatePriority(32), ReactSharedInternals.T = null, fn();
          } finally {
            setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = prevTransition;
          }
        };
        exports.discreteUpdates = function(fn, a, b, c, d) {
          var prevTransition = ReactSharedInternals.T, previousPriority = getCurrentUpdatePriority();
          try {
            return setCurrentUpdatePriority(2), ReactSharedInternals.T = null, fn(a, b, c, d);
          } finally {
            setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = prevTransition, 0 === executionContext && (workInProgressRootRenderTargetTime = now() + 500);
          }
        };
        exports.findAllNodes = findAllNodes;
        exports.findBoundingRects = function(hostRoot, selectors) {
          if (!supportsTestSelectors) throw Error(formatProdErrorMessage(363));
          selectors = findAllNodes(hostRoot, selectors);
          hostRoot = [];
          for (var i = 0; i < selectors.length; i++)
            hostRoot.push(getBoundingRect(selectors[i]));
          for (selectors = hostRoot.length - 1; 0 < selectors; selectors--) {
            i = hostRoot[selectors];
            for (var targetLeft = i.x, targetRight = targetLeft + i.width, targetTop = i.y, targetBottom = targetTop + i.height, j = selectors - 1; 0 <= j; j--)
              if (selectors !== j) {
                var otherRect = hostRoot[j], otherLeft = otherRect.x, otherRight = otherLeft + otherRect.width, otherTop = otherRect.y, otherBottom = otherTop + otherRect.height;
                if (targetLeft >= otherLeft && targetTop >= otherTop && targetRight <= otherRight && targetBottom <= otherBottom) {
                  hostRoot.splice(selectors, 1);
                  break;
                } else if (!(targetLeft !== otherLeft || i.width !== otherRect.width || otherBottom < targetTop || otherTop > targetBottom)) {
                  otherTop > targetTop && (otherRect.height += otherTop - targetTop, otherRect.y = targetTop);
                  otherBottom < targetBottom && (otherRect.height = targetBottom - otherTop);
                  hostRoot.splice(selectors, 1);
                  break;
                } else if (!(targetTop !== otherTop || i.height !== otherRect.height || otherRight < targetLeft || otherLeft > targetRight)) {
                  otherLeft > targetLeft && (otherRect.width += otherLeft - targetLeft, otherRect.x = targetLeft);
                  otherRight < targetRight && (otherRect.width = targetRight - otherLeft);
                  hostRoot.splice(selectors, 1);
                  break;
                }
              }
          }
          return hostRoot;
        };
        exports.findHostInstance = findHostInstance;
        exports.findHostInstanceWithNoPortals = function(fiber) {
          fiber = findCurrentFiberUsingSlowPath(fiber);
          fiber = null !== fiber ? findCurrentHostFiberWithNoPortalsImpl(fiber) : null;
          return null === fiber ? null : getPublicInstance(fiber.stateNode);
        };
        exports.findHostInstanceWithWarning = function(component) {
          return findHostInstance(component);
        };
        exports.flushPassiveEffects = flushPassiveEffects;
        exports.flushSyncFromReconciler = function(fn) {
          var prevExecutionContext = executionContext;
          executionContext |= 1;
          var prevTransition = ReactSharedInternals.T, previousPriority = getCurrentUpdatePriority();
          try {
            if (setCurrentUpdatePriority(2), ReactSharedInternals.T = null, fn)
              return fn();
          } finally {
            setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = prevTransition, executionContext = prevExecutionContext, 0 === (executionContext & 6) && flushSyncWorkAcrossRoots_impl(0);
          }
        };
        exports.flushSyncWork = flushSyncWork;
        exports.focusWithin = function(hostRoot, selectors) {
          if (!supportsTestSelectors) throw Error(formatProdErrorMessage(363));
          hostRoot = findFiberRootForHostRoot(hostRoot);
          selectors = findPaths(hostRoot, selectors);
          selectors = Array.from(selectors);
          for (hostRoot = 0; hostRoot < selectors.length; ) {
            var fiber = selectors[hostRoot++], tag = fiber.tag;
            if (!isHiddenSubtree(fiber)) {
              if ((5 === tag || 26 === tag || 27 === tag) && setFocusIfFocusable(fiber.stateNode))
                return true;
              for (fiber = fiber.child; null !== fiber; )
                selectors.push(fiber), fiber = fiber.sibling;
            }
          }
          return false;
        };
        exports.getFindAllNodesFailureDescription = function(hostRoot, selectors) {
          if (!supportsTestSelectors) throw Error(formatProdErrorMessage(363));
          var maxSelectorIndex = 0, matchedNames = [];
          hostRoot = [findFiberRootForHostRoot(hostRoot), 0];
          for (var index = 0; index < hostRoot.length; ) {
            var fiber = hostRoot[index++], tag = fiber.tag, selectorIndex = hostRoot[index++], selector = selectors[selectorIndex];
            if (5 !== tag && 26 !== tag && 27 !== tag || !isHiddenSubtree(fiber)) {
              if (matchSelector(fiber, selector) && (matchedNames.push(selectorToString(selector)), selectorIndex++, selectorIndex > maxSelectorIndex && (maxSelectorIndex = selectorIndex)), selectorIndex < selectors.length)
                for (fiber = fiber.child; null !== fiber; )
                  hostRoot.push(fiber, selectorIndex), fiber = fiber.sibling;
            }
          }
          if (maxSelectorIndex < selectors.length) {
            for (hostRoot = []; maxSelectorIndex < selectors.length; maxSelectorIndex++)
              hostRoot.push(selectorToString(selectors[maxSelectorIndex]));
            return "findAllNodes was able to match part of the selector:\n  " + (matchedNames.join(" > ") + "\n\nNo matching component was found for:\n  ") + hostRoot.join(" > ");
          }
          return null;
        };
        exports.getPublicRootInstance = function(container) {
          container = container.current;
          if (!container.child) return null;
          switch (container.child.tag) {
            case 27:
            case 5:
              return getPublicInstance(container.child.stateNode);
            default:
              return container.child.stateNode;
          }
        };
        exports.injectIntoDevTools = function() {
          var internals = {
            bundleType: 0,
            version: rendererVersion,
            rendererPackageName,
            currentDispatcherRef: ReactSharedInternals,
            findFiberByHostInstance: getInstanceFromNode,
            reconcilerVersion: "19.0.0"
          };
          null !== extraDevToolsConfig && (internals.rendererConfig = extraDevToolsConfig);
          if ("undefined" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) internals = false;
          else {
            var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
            if (hook.isDisabled || !hook.supportsFiber) internals = true;
            else {
              try {
                rendererID = hook.inject(internals), injectedHook = hook;
              } catch (err) {
              }
              internals = hook.checkDCE ? true : false;
            }
          }
          return internals;
        };
        exports.isAlreadyRendering = function() {
          return false;
        };
        exports.observeVisibleRects = function(hostRoot, selectors, callback, options) {
          if (!supportsTestSelectors) throw Error(formatProdErrorMessage(363));
          hostRoot = findAllNodes(hostRoot, selectors);
          var disconnect = setupIntersectionObserver(
            hostRoot,
            callback,
            options
          ).disconnect;
          return {
            disconnect: function() {
              disconnect();
            }
          };
        };
        exports.shouldError = function() {
          return null;
        };
        exports.shouldSuspend = function() {
          return false;
        };
        exports.startHostTransition = function(formFiber, pendingState, action, formData) {
          if (5 !== formFiber.tag) throw Error(formatProdErrorMessage(476));
          var queue = ensureFormComponentIsStateful(formFiber).queue;
          startTransition(
            formFiber,
            queue,
            pendingState,
            NotPendingTransition,
            null === action ? noop : function() {
              var resetStateQueue = ensureFormComponentIsStateful(formFiber).next.queue;
              dispatchSetStateInternal(
                formFiber,
                resetStateQueue,
                {},
                requestUpdateLane()
              );
              return action(formData);
            }
          );
        };
        exports.updateContainer = function(element, container, parentComponent, callback) {
          var current = container.current, lane = requestUpdateLane();
          updateContainerImpl(
            current,
            lane,
            element,
            container,
            parentComponent,
            callback
          );
          return lane;
        };
        exports.updateContainerSync = function(element, container, parentComponent, callback) {
          0 === container.tag && flushPassiveEffects();
          updateContainerImpl(
            container.current,
            2,
            element,
            container,
            parentComponent,
            callback
          );
          return 2;
        };
        return exports;
      };
      module.exports.default = module.exports;
      Object.defineProperty(module.exports, "__esModule", { value: true });
    })(reactReconciler_production);
    return reactReconciler_production.exports;
  }
  var hasRequiredReactReconciler;
  function requireReactReconciler() {
    if (hasRequiredReactReconciler) return reactReconciler.exports;
    hasRequiredReactReconciler = 1;
    {
      reactReconciler.exports = requireReactReconciler_production();
    }
    return reactReconciler.exports;
  }
  var reactReconcilerExports = requireReactReconciler();
  const ReactReconcilerModule = /* @__PURE__ */ getDefaultExportFromCjs(reactReconcilerExports);
  var constants = { exports: {} };
  var reactReconcilerConstants_production = {};
  var hasRequiredReactReconcilerConstants_production;
  function requireReactReconcilerConstants_production() {
    if (hasRequiredReactReconcilerConstants_production) return reactReconcilerConstants_production;
    hasRequiredReactReconcilerConstants_production = 1;
    reactReconcilerConstants_production.ConcurrentRoot = 1;
    reactReconcilerConstants_production.ContinuousEventPriority = 8;
    reactReconcilerConstants_production.DefaultEventPriority = 32;
    reactReconcilerConstants_production.DiscreteEventPriority = 2;
    reactReconcilerConstants_production.IdleEventPriority = 268435456;
    reactReconcilerConstants_production.LegacyRoot = 0;
    reactReconcilerConstants_production.NoEventPriority = 0;
    return reactReconcilerConstants_production;
  }
  var hasRequiredConstants;
  function requireConstants() {
    if (hasRequiredConstants) return constants.exports;
    hasRequiredConstants = 1;
    {
      constants.exports = requireReactReconcilerConstants_production();
    }
    return constants.exports;
  }
  var constantsExports = requireConstants();
  const ReactReconciler = ReactReconcilerModule;
  const eventProps = [
    "onPress",
    "onClick",
    "onChangeText",
    "onValueChange",
    "onScroll",
    "onRequestClose",
    "onFocus",
    "onBlur",
    "onLayout",
    "onDragStart",
    "onDragMove",
    "onDragEnd"
  ];
  const hostNodeTypes = /* @__PURE__ */ new Set([
    "root",
    "view",
    "text",
    "button",
    "image",
    "icon",
    "textInput",
    "scrollView",
    "modal",
    "externalView",
    "safeArea",
    "statusBar",
    "activityIndicator",
    "appBar",
    "badge",
    "banner",
    "bottomAppBar",
    "bottomSheet",
    "dataTable",
    "dockedToolbar",
    "floatingToolbar",
    "buttonGroup",
    "card",
    "carousel",
    "checkbox",
    "chip",
    "datePicker",
    "dialog",
    "divider",
    "extendedFab",
    "fab",
    "fabMenu",
    "iconButton",
    "list",
    "loadingIndicator",
    "menu",
    "menuItem",
    "navigationBar",
    "navigationBarItem",
    "navigationDrawer",
    "navigationRail",
    "progressIndicator",
    "radioButton",
    "rangeSlider",
    "search",
    "searchBar",
    "segmentedButton",
    "sideSheet",
    "slider",
    "snackbar",
    "splitButton",
    "switch",
    "tabs",
    "textField",
    "timePicker",
    "toolbar",
    "tooltip",
    "popover"
  ]);
  function normalizeType(type) {
    const raw = String(type).replace(/^rayact-/, "");
    const normalized = raw.toLowerCase().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (hostNodeTypes.has(normalized)) {
      return normalized;
    }
    throw new Error(`Unknown Rayact element type: ${type}`);
  }
  function isText(instance) {
    return instance.kind === "text";
  }
  function getBridge(parent) {
    return parent.kind === "container" ? parent.bridge : getDefaultRuntime().bridge;
  }
  function textFromChildren(instance) {
    if (instance.type !== "text" && instance.type !== "button") return void 0;
    const text = instance.children.filter(isText).map((child) => child.text).join("");
    return text || void 0;
  }
  function syncTextContent(instance) {
    const text = textFromChildren(instance);
    if (text !== void 0) {
      getDefaultRuntime().bridge.updateNode(instance.node, { children: text });
    }
  }
  function attachEvents(instance, props) {
    const bridge2 = getDefaultRuntime().bridge;
    for (const prop of eventProps) {
      const handler = props[prop];
      if (typeof handler === "function") {
        bridge2.setEventHandler(instance.node, eventNameForProp(prop), handler);
      }
    }
  }
  function updateEvents(instance, oldProps, newProps) {
    const bridge2 = getDefaultRuntime().bridge;
    for (const prop of eventProps) {
      if (oldProps[prop] !== newProps[prop]) {
        const handler = newProps[prop];
        bridge2.setEventHandler(instance.node, eventNameForProp(prop), typeof handler === "function" ? handler : null);
      }
    }
  }
  function eventNameForProp(prop) {
    if (prop === "onClick") return "click";
    if (prop === "onChangeText") return "changeText";
    if (prop === "onValueChange") return "changeValue";
    if (prop === "onScroll") return "scroll";
    if (prop === "onRequestClose") return "requestClose";
    if (prop === "onFocus") return "focus";
    if (prop === "onBlur") return "blur";
    if (prop === "onDragStart") return "dragStart";
    if (prop === "onDragMove") return "dragMove";
    if (prop === "onDragEnd") return "dragEnd";
    if (prop === "onLayout") return "layout";
    return "press";
  }
  function appendChild(parent, child) {
    child.parent = parent;
    parent.children.push(child);
    if (isText(child)) {
      if (parent.kind === "instance") syncTextContent(parent);
      return;
    }
    getBridge(parent).appendChild(parent.kind === "container" ? parent.rootNode : parent.node, child.node);
  }
  function disposeSubtree(instance) {
    const bridge2 = getDefaultRuntime().bridge;
    for (const grandchild of instance.children) {
      if (isText(grandchild)) continue;
      disposeSubtree(grandchild);
    }
    bridge2.disposeNode(instance.node);
  }
  function removeChild(parent, child) {
    const index = parent.children.indexOf(child);
    if (index !== -1) parent.children.splice(index, 1);
    child.parent = void 0;
    if (isText(child)) {
      if (parent.kind === "instance") syncTextContent(parent);
      return;
    }
    getBridge(parent).removeChild(parent.kind === "container" ? parent.rootNode : parent.node, child.node);
    disposeSubtree(child);
  }
  function insertBefore(parent, child, beforeChild) {
    const existingIndex = parent.children.indexOf(child);
    if (existingIndex !== -1) parent.children.splice(existingIndex, 1);
    const beforeIndex = parent.children.indexOf(beforeChild);
    if (beforeIndex === -1) {
      appendChild(parent, child);
      return;
    }
    child.parent = parent;
    parent.children.splice(beforeIndex, 0, child);
    if (isText(child) || isText(beforeChild)) {
      if (parent.kind === "instance") syncTextContent(parent);
      return;
    }
    getBridge(parent).insertBefore(parent.kind === "container" ? parent.rootNode : parent.node, child.node, beforeChild.node);
  }
  function diffProps(oldProps, newProps) {
    const payload = {};
    const keys = /* @__PURE__ */ new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
    for (const key of keys) {
      if (key === "children") continue;
      if (eventProps.includes(key)) continue;
      if (oldProps[key] !== newProps[key]) {
        payload[key] = newProps[key];
      }
    }
    if (oldProps.className !== newProps.className && !Object.prototype.hasOwnProperty.call(payload, "style") && newProps.style !== void 0) {
      payload.style = newProps.style;
    }
    return Object.keys(payload).length > 0 || oldProps.children !== newProps.children ? payload : null;
  }
  function scanAndBindSharedValues(nodeId, style) {
    if (!style) return;
    if (Array.isArray(style)) {
      for (const item of style) {
        scanAndBindSharedValues(nodeId, item);
      }
      return;
    }
    if (typeof style === "object") {
      for (const [key, value] of Object.entries(style)) {
        if (key === "transform" && Array.isArray(value)) {
          for (const transformEntry of value) {
            if (transformEntry && typeof transformEntry === "object") {
              for (const [tKey, tValue] of Object.entries(transformEntry)) {
                if (tValue && typeof tValue.bindToNode === "function") {
                  tValue.bindToNode(nodeId, tKey);
                }
              }
            }
          }
        } else if (value && typeof value.bindToNode === "function") {
          value.bindToNode(nodeId, key);
        }
      }
    }
  }
  function createHostContainer() {
    const runtime = getDefaultRuntime();
    const rootNode = runtime.bridge.createNode("root", { style: { flexGrow: 1 } });
    runtime.bridge.setRoot(rootNode);
    return {
      kind: "container",
      rootNode,
      bridge: runtime.bridge,
      runtime,
      children: []
    };
  }
  const __reconcilerGlobal = globalThis;
  const NoEventPriority = constantsExports.NoEventPriority ?? 0;
  let currentUpdatePriority = NoEventPriority;
  const HostTransitionContext = reactExports.createContext(null);
  const RayactReconciler = __reconcilerGlobal.__RAYACT_RECONCILER__ ?? (__reconcilerGlobal.__RAYACT_RECONCILER__ = ReactReconciler({
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: false,
    supportsMicrotasks: true,
    scheduleMicrotask: typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn),
    setCurrentUpdatePriority: (newPriority) => {
      currentUpdatePriority = newPriority;
    },
    getCurrentUpdatePriority: () => currentUpdatePriority,
    resolveUpdatePriority: () => currentUpdatePriority || constantsExports.DefaultEventPriority,
    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur: () => {
    },
    afterActiveInstanceBlur: () => {
    },
    preparePortalMount: () => {
    },
    prepareScopeUpdate: () => {
    },
    getInstanceFromScope: () => null,
    detachDeletedInstance: () => {
    },
    getRootHostContext: () => ({}),
    getChildHostContext: () => ({}),
    getPublicInstance: (instance) => instance,
    prepareForCommit: () => null,
    resetAfterCommit: () => {
    },
    shouldSetTextContent: () => false,
    clearContainer: (container) => {
      for (const child of [...container.children]) {
        removeChild(container, child);
      }
      return false;
    },
    createInstance(type, props) {
      const normalizedType = normalizeType(type);
      const node = getDefaultRuntime().bridge.createNode(normalizedType, props);
      const instance = {
        kind: "instance",
        type: normalizedType,
        node,
        props,
        children: []
      };
      attachEvents(instance, props);
      scanAndBindSharedValues(node.id, props.style);
      return instance;
    },
    createTextInstance(text) {
      return { kind: "text", text };
    },
    appendInitialChild(parent, child) {
      appendChild(parent, child);
    },
    finalizeInitialChildren: () => false,
    resetTextContent: (instance) => {
      if (instance.type === "text" || instance.type === "button") {
        getDefaultRuntime().bridge.updateNode(instance.node, { children: "" });
      }
    },
    appendChild,
    appendChildToContainer: appendChild,
    removeChild,
    removeChildFromContainer: removeChild,
    insertBefore,
    insertInContainerBefore: insertBefore,
    // 0.31: prepareUpdate is gone — commitUpdate receives (instance, type,
    // prevProps, nextProps, handle) and computes the diff itself.
    commitUpdate(instance, _type, oldProps, newProps) {
      instance.props = newProps;
      const payload = diffProps(oldProps, newProps);
      if (payload) getDefaultRuntime().bridge.updateNode(instance.node, payload);
      updateEvents(instance, oldProps, newProps);
      syncTextContent(instance);
      scanAndBindSharedValues(instance.node.id, newProps.style);
    },
    commitTextUpdate(textInstance, _oldText, newText) {
      textInstance.text = newText;
      if (textInstance.parent?.kind === "instance") {
        syncTextContent(textInstance.parent);
      }
    },
    commitMount: () => {
    },
    hideInstance: (instance) => getDefaultRuntime().bridge.updateNode(instance.node, { display: "none" }),
    hideTextInstance: () => {
    },
    unhideInstance: (instance, props) => getDefaultRuntime().bridge.updateNode(instance.node, props),
    unhideTextInstance: () => {
    },
    // --- react-reconciler 0.31 required additions ---
    // Timeouts (used by Suspense retry scheduling).
    scheduleTimeout: (fn, delay) => setTimeout(fn, delay),
    cancelTimeout: (id) => clearTimeout(id),
    noTimeout: -1,
    // Suspense commit gating — we never suspend the host on commit.
    maySuspendCommit: () => false,
    startSuspendingCommit: () => {
    },
    suspendInstance: () => {
    },
    waitForCommitToBeReady: () => null,
    // Transitions / forms (no host-level transition or <form> action support).
    shouldAttemptEagerTransition: () => false,
    requestPostPaintCallback: () => {
    },
    resetFormInstance: () => {
    },
    NotPendingTransition: null,
    HostTransitionContext,
    // Event timing (devtools/profiler hints).
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1
  }));
  if (!__reconcilerGlobal.__RAYACT_DEVTOOLS_INJECTED__) {
    __reconcilerGlobal.__RAYACT_DEVTOOLS_INJECTED__ = true;
    RayactReconciler.injectIntoDevTools?.({
      bundleType: 1,
      version: "0.1.0",
      rendererPackageName: "@rayact/react",
      findHostInstanceByFiber: RayactReconciler.findHostInstance
    });
  }
  var jsxRuntime = { exports: {} };
  var reactJsxRuntime_production = {};
  var hasRequiredReactJsxRuntime_production;
  function requireReactJsxRuntime_production() {
    if (hasRequiredReactJsxRuntime_production) return reactJsxRuntime_production;
    hasRequiredReactJsxRuntime_production = 1;
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    function jsxProd(type, config, maybeKey) {
      var key = null;
      void 0 !== maybeKey && (key = "" + maybeKey);
      void 0 !== config.key && (key = "" + config.key);
      if ("key" in config) {
        maybeKey = {};
        for (var propName in config)
          "key" !== propName && (maybeKey[propName] = config[propName]);
      } else maybeKey = config;
      config = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== config ? config : null,
        props: maybeKey
      };
    }
    reactJsxRuntime_production.Fragment = REACT_FRAGMENT_TYPE;
    reactJsxRuntime_production.jsx = jsxProd;
    reactJsxRuntime_production.jsxs = jsxProd;
    return reactJsxRuntime_production;
  }
  var hasRequiredJsxRuntime;
  function requireJsxRuntime() {
    if (hasRequiredJsxRuntime) return jsxRuntime.exports;
    hasRequiredJsxRuntime = 1;
    {
      jsxRuntime.exports = requireReactJsxRuntime_production();
    }
    return jsxRuntime.exports;
  }
  var jsxRuntimeExports = requireJsxRuntime();
  const COLOR_ROLES = [
    "primary",
    "onPrimary",
    "primaryContainer",
    "onPrimaryContainer",
    "secondary",
    "onSecondary",
    "secondaryContainer",
    "onSecondaryContainer",
    "tertiary",
    "onTertiary",
    "tertiaryContainer",
    "onTertiaryContainer",
    "error",
    "onError",
    "errorContainer",
    "onErrorContainer",
    "surface",
    "onSurface",
    "surfaceVariant",
    "onSurfaceVariant",
    "surfaceContainerLowest",
    "surfaceContainerLow",
    "surfaceContainer",
    "surfaceContainerHigh",
    "surfaceContainerHighest",
    "outline",
    "outlineVariant",
    "shadow",
    "scrim",
    "inverseSurface",
    "inverseOnSurface",
    "inversePrimary"
  ];
  function pack(r, g, b, a = 255) {
    return (r << 24 | g << 16 | b << 8 | a) >>> 0;
  }
  function buildTheme(dark, colors) {
    const theme = { dark };
    for (const role of COLOR_ROLES) {
      const c = colors[role];
      theme[role] = c ? pack(c[0], c[1], c[2], c[3] ?? 255) : 4278190335;
    }
    return theme;
  }
  const lightTheme = buildTheme(false, {
    primary: [103, 80, 164],
    onPrimary: [255, 255, 255],
    primaryContainer: [234, 221, 255],
    onPrimaryContainer: [33, 0, 93],
    secondary: [98, 91, 113],
    onSecondary: [255, 255, 255],
    secondaryContainer: [232, 222, 248],
    onSecondaryContainer: [30, 25, 43],
    tertiary: [125, 82, 96],
    onTertiary: [255, 255, 255],
    tertiaryContainer: [255, 216, 228],
    onTertiaryContainer: [55, 11, 30],
    error: [186, 26, 26],
    onError: [255, 255, 255],
    errorContainer: [255, 218, 214],
    onErrorContainer: [65, 0, 2],
    surface: [255, 251, 254],
    onSurface: [28, 27, 31],
    surfaceVariant: [231, 224, 236],
    onSurfaceVariant: [73, 69, 79],
    surfaceContainerLowest: [255, 255, 255],
    surfaceContainerLow: [247, 242, 250],
    surfaceContainer: [243, 237, 247],
    surfaceContainerHigh: [236, 230, 240],
    surfaceContainerHighest: [230, 224, 233],
    outline: [121, 116, 126],
    outlineVariant: [196, 199, 197],
    shadow: [0, 0, 0],
    scrim: [0, 0, 0],
    inverseSurface: [49, 48, 51],
    inverseOnSurface: [244, 239, 244],
    inversePrimary: [208, 188, 255]
  });
  const darkTheme = buildTheme(true, {
    primary: [208, 188, 255],
    onPrimary: [56, 30, 114],
    primaryContainer: [79, 55, 139],
    onPrimaryContainer: [234, 221, 255],
    secondary: [204, 194, 220],
    onSecondary: [51, 45, 65],
    secondaryContainer: [74, 68, 88],
    onSecondaryContainer: [232, 222, 248],
    tertiary: [239, 184, 200],
    onTertiary: [73, 37, 50],
    tertiaryContainer: [99, 59, 72],
    onTertiaryContainer: [255, 216, 228],
    error: [255, 180, 171],
    onError: [105, 0, 5],
    errorContainer: [147, 0, 10],
    onErrorContainer: [255, 218, 214],
    surface: [28, 27, 31],
    onSurface: [230, 225, 229],
    surfaceVariant: [73, 69, 79],
    onSurfaceVariant: [202, 196, 208],
    surfaceContainerLowest: [15, 13, 19],
    surfaceContainerLow: [29, 27, 32],
    surfaceContainer: [33, 31, 38],
    surfaceContainerHigh: [43, 41, 48],
    surfaceContainerHighest: [54, 52, 59],
    outline: [147, 143, 153],
    outlineVariant: [73, 69, 79],
    shadow: [0, 0, 0],
    scrim: [0, 0, 0],
    inverseSurface: [230, 225, 229],
    inverseOnSurface: [49, 48, 51],
    inversePrimary: [103, 80, 164]
  });
  function themeFromNativeScheme(scheme) {
    const theme = { dark: scheme.isDark };
    for (const role of COLOR_ROLES) {
      const value = scheme[role];
      theme[role] = typeof value === "number" ? value : darkTheme[role];
    }
    return theme;
  }
  function getNativeTheme(fallbackDark) {
    const g = globalThis;
    if (typeof g.__rayactGetColorScheme === "function") {
      try {
        const scheme = g.__rayactGetColorScheme();
        if (scheme && typeof scheme.isDark === "boolean") {
          return themeFromNativeScheme(scheme);
        }
      } catch {
      }
    }
    const dark = fallbackDark ?? true;
    return dark ? darkTheme : lightTheme;
  }
  function lerpPackedColor(from, to, t) {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const fr = from >>> 24 & 255;
    const fg = from >>> 16 & 255;
    const fb = from >>> 8 & 255;
    const fa = from & 255;
    const tr = to >>> 24 & 255;
    const tg = to >>> 16 & 255;
    const tb = to >>> 8 & 255;
    const ta = to & 255;
    return (clamp(fr + (tr - fr) * t) << 24 | clamp(fg + (tg - fg) * t) << 16 | clamp(fb + (tb - fb) * t) << 8 | clamp(fa + (ta - fa) * t)) >>> 0;
  }
  function lerpTheme(from, to, t) {
    const result = { ...to, dark: t >= 0.5 ? to.dark : from.dark };
    for (const role of COLOR_ROLES) {
      const a = from[role];
      const b = to[role];
      if (typeof a === "number" && typeof b === "number") {
        result[role] = lerpPackedColor(a, b, t);
      } else {
        result[role] = t >= 0.5 ? b : a;
      }
    }
    return result;
  }
  const ThemeContext = React.createContext(darkTheme);
  function ThemeProvider({
    theme,
    children
  }) {
    return React.createElement(ThemeContext.Provider, { value: theme }, children);
  }
  let isDark = true;
  const listeners$1 = /* @__PURE__ */ new Set();
  function readInitialIsDark() {
    const g = globalThis;
    if (typeof g.__rayactGetColorScheme === "function") {
      try {
        const scheme = g.__rayactGetColorScheme();
        if (typeof scheme?.isDark === "boolean") return scheme.isDark;
      } catch {
      }
    }
    return true;
  }
  function emit() {
    for (const listener of listeners$1) listener();
  }
  function subscribe(listener) {
    listeners$1.add(listener);
    return () => listeners$1.delete(listener);
  }
  function getSnapshot() {
    return isDark;
  }
  function getServerSnapshot() {
    return true;
  }
  let storeInitialized = false;
  function initColorSchemeStore() {
    if (storeInitialized) return;
    storeInitialized = true;
    isDark = readInitialIsDark();
    const g = globalThis;
    g.onColorSchemeChange = (dark) => {
      if (isDark !== dark) {
        isDark = dark;
        emit();
      }
    };
  }
  function useColorScheme() {
    initColorSchemeStore();
    return reactExports.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  }
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function useAnimatedValue(target, options = {}) {
    const { duration = 300, easing = easeInOutCubic, onSettled, from } = options;
    const initial = from ?? target;
    const [value, setValue] = React.useState(initial);
    const valueRef = React.useRef(initial);
    const frameRef = React.useRef(null);
    const startRef = React.useRef(null);
    const fromRef = React.useRef(initial);
    const onSettledRef = React.useRef(onSettled);
    onSettledRef.current = onSettled;
    const settledRef = React.useRef(true);
    React.useEffect(() => {
      if (target === valueRef.current) {
        return;
      }
      fromRef.current = valueRef.current;
      startRef.current = null;
      settledRef.current = false;
      const step = (timestamp) => {
        if (startRef.current === null) startRef.current = timestamp;
        const elapsed = timestamp - startRef.current;
        const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
        const next = fromRef.current + (target - fromRef.current) * easing(t);
        valueRef.current = next;
        setValue(next);
        if (t < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else if (!settledRef.current) {
          settledRef.current = true;
          const cb = onSettledRef.current;
          if (cb) queueMicrotask(() => cb(next));
        }
      };
      frameRef.current = requestAnimationFrame(step);
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }, [target, duration, easing]);
    return value;
  }
  function RayactThemeProvider({ children }) {
    const isDark2 = useColorScheme();
    const targetTheme = reactExports.useMemo(() => getNativeTheme(isDark2), [isDark2]);
    const stableThemeRef = reactExports.useRef(targetTheme);
    const [blend, setBlend] = reactExports.useState(null);
    const progress = useAnimatedValue(blend ? 1 : 0, { duration: blend ? 350 : 0 });
    reactExports.useEffect(() => {
      if (stableThemeRef.current.dark === targetTheme.dark) {
        stableThemeRef.current = targetTheme;
        return;
      }
      setBlend({ from: stableThemeRef.current, to: targetTheme });
    }, [targetTheme]);
    reactExports.useEffect(() => {
      if (!blend || progress < 1) return;
      stableThemeRef.current = blend.to;
      setBlend(null);
    }, [blend, progress]);
    const displayTheme = reactExports.useMemo(() => {
      if (!blend) return targetTheme;
      return lerpTheme(blend.from, blend.to, progress);
    }, [blend, targetTheme, progress]);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ThemeProvider, { theme: displayTheme, children });
  }
  const View = React.forwardRef((props, ref) => {
    return React.createElement("rayact-view", { ...props, ref });
  });
  function Text(props) {
    return React.createElement("rayact-text", props);
  }
  function Button(props) {
    return React.createElement("rayact-button", props);
  }
  function TextInput(props) {
    return React.createElement("rayact-text-input", props);
  }
  function ScrollView(props) {
    return React.createElement("rayact-scroll-view", props);
  }
  const listeners = [];
  function drainBackPresses() {
    const navigationBack = globalThis.__rayactHandleNavigationBackPress;
    if (typeof navigationBack === "function") {
      try {
        if (navigationBack()) return true;
      } catch (err) {
        const msg = err && err.message;
        console.warn("[BackHandler] navigation listener threw:", msg ?? err);
      }
    }
    for (const l of listeners) {
      try {
        if (l()) return true;
      } catch (err) {
        const msg = err && err.message;
        console.warn("[BackHandler] listener threw:", msg ?? err);
      }
    }
    return false;
  }
  globalThis.__rayactDrainBackPress = drainBackPresses;
  function disposeExistingDevRoot() {
    const globalObject = globalThis;
    if (!globalObject.__rayactReactRoot) return;
    if (globalThis.__RAYACT_HMR_ACTIVE__) return;
    try {
      globalObject.__rayactReactRoot.publicRoot.unmount();
    } catch (error) {
      getDefaultRuntime().reportError(error);
    } finally {
      delete globalObject.__rayactReactRoot;
    }
  }
  disposeExistingDevRoot();
  function createFiberRoot(container) {
    return RayactReconciler.createContainer(
      container,
      ReconcilerRootTag.LegacyRoot,
      null,
      false,
      null,
      "",
      getDefaultRuntime().reportError,
      getDefaultRuntime().reportError,
      getDefaultRuntime().reportError,
      null
    );
  }
  const ReconcilerRootTag = {
    LegacyRoot: 0
  };
  function createRoot(container = createHostContainer()) {
    const fiberRoot = createFiberRoot(container);
    const publicRoot = {
      container,
      render(element) {
        RayactReconciler.updateContainer(element, fiberRoot, null, void 0);
      },
      unmount() {
        const flush = RayactReconciler.flushSync;
        const doUnmount = () => {
          RayactReconciler.updateContainer(null, fiberRoot, null, () => {
            container.bridge.setRoot(null);
            container.bridge.disposeNode(container.rootNode);
          });
        };
        if (flush) flush(doUnmount);
        else doUnmount();
      }
    };
    return publicRoot;
  }
  function getOrCreateRoot() {
    const globalObject = globalThis;
    if (!globalObject.__rayactReactRoot) {
      const container = createHostContainer();
      const publicRoot = createRoot(container);
      globalObject.__rayactReactRoot = {
        container,
        publicRoot
      };
    }
    return globalObject.__rayactReactRoot.publicRoot;
  }
  function render(element) {
    if (globalThis.__RAYACT_HMR_ACTIVE__) {
      return getOrCreateRoot();
    }
    const root = getOrCreateRoot();
    root.render(
      React.createElement(RayactThemeProvider, null, element)
    );
    return root;
  }
  const scriptRel = "modulepreload";
  const assetsURL = function(dep) {
    return "/" + dep;
  };
  const seen = {};
  const __vitePreload = function preload(baseModule, deps, importerUrl) {
    let promise = Promise.resolve();
    if (false) {
      let allSettled = function(promises$2) {
        return Promise.all(promises$2.map((p) => Promise.resolve(p).then((value$1) => ({
          status: "fulfilled",
          value: value$1
        }), (reason) => ({
          status: "rejected",
          reason
        }))));
      };
      document.getElementsByTagName("link");
      const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
      const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
      promise = allSettled(deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) return;
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) link.as = "script";
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) link.setAttribute("nonce", cspNonce);
        document.head.appendChild(link);
        if (isCss) return new Promise((res, rej) => {
          link.addEventListener("load", res);
          link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
        });
      }));
    }
    function handlePreloadError(err$2) {
      const e$1 = new Event("vite:preloadError", { cancelable: true });
      e$1.payload = err$2;
      window.dispatchEvent(e$1);
      if (!e$1.defaultPrevented) throw err$2;
    }
    return promise.then((res) => {
      for (const item of res || []) {
        if (item.status !== "rejected") continue;
        handlePreloadError(item.reason);
      }
      return baseModule().catch(handlePreloadError);
    });
  };
  function call(method, data) {
    return new Promise((resolve, reject) => {
      if (typeof devCall !== "function") {
        reject(new Error(`Rayact devCall unavailable: ${method}`));
        return;
      }
      devCall(method, data, (result) => resolve(result));
    });
  }
  function setDevServerUrl(url) {
    return call("setDevServerUrl", { url });
  }
  function getDevServerUrl() {
    return call("getDevServerUrl");
  }
  function getRecentEntries() {
    return call("getRecentEntries");
  }
  function removeRecentUrl(url) {
    return call("removeRecentUrl", { url });
  }
  function getDiscoveredServers() {
    return call("getDiscoveredServers");
  }
  function startDiscovery() {
    return call("startDiscovery");
  }
  function stopDiscovery() {
    return call("stopDiscovery");
  }
  function reloadWithProjectBundle() {
    return call("reloadWithProjectBundle");
  }
  function getConnectError() {
    return call("getConnectError");
  }
  function isConnectLoading() {
    return call("isConnectLoading").then((v) => v === true || v === "true");
  }
  function scanQR() {
    return call("scanQR");
  }
  function parseUrl(input) {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        const payload = JSON.parse(trimmed);
        if (payload.url) return payload.url.replace(/\/+$/, "");
        const ws = payload.transports?.find((t) => t.type === "websocket");
        if (ws?.ips?.[0]) return `http://${ws.ips[0]}:${ws.port}`;
      } catch {
      }
    }
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    return url.replace(/\/+$/, "");
  }
  const native = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    getConnectError,
    getDevServerUrl,
    getDiscoveredServers,
    getRecentEntries,
    isConnectLoading,
    parseUrl,
    reloadWithProjectBundle,
    removeRecentUrl,
    scanQR,
    setDevServerUrl,
    startDiscovery,
    stopDiscovery
  }, Symbol.toStringTag, { value: "Module" }));
  const DevLauncherContext = reactExports.createContext(null);
  async function checkReachability(url, appKey) {
    try {
      const response = await fetch(`${url}/rayact/manifest.json`);
      if (!response.ok) return "offline";
      const manifest = await response.json();
      if (appKey && manifest.rayactAppKey && manifest.rayactAppKey !== appKey) return "stale";
      return "matched";
    } catch {
      return "offline";
    }
  }
  function DevLauncherProvider({ children }) {
    const [url, setUrlState] = reactExports.useState("");
    const [recentEntries, setRecentEntries] = reactExports.useState([]);
    const [discoveredServers, setDiscoveredServers] = reactExports.useState([]);
    const [recentReachability, setRecentReachability] = reactExports.useState({});
    const [connectError, setConnectError] = reactExports.useState("");
    const [connecting, setConnecting] = reactExports.useState(false);
    const [projectLoaded, setProjectLoaded] = reactExports.useState(false);
    const [devMenuOpen, setDevMenuOpen] = reactExports.useState(false);
    const [inspectorOpen, setInspectorOpen] = reactExports.useState(false);
    const refreshRecent = reactExports.useCallback(() => {
      void getRecentEntries().then(setRecentEntries).catch(() => {
      });
      void getDevServerUrl().then((saved) => {
        if (saved) setUrlState(saved);
      }).catch(() => {
      });
    }, []);
    reactExports.useEffect(() => {
      const g = globalThis;
      g.__rayactToggleDevMenu = () => setDevMenuOpen((open) => !open);
      return () => {
        delete g.__rayactToggleDevMenu;
      };
    }, []);
    reactExports.useEffect(() => {
      refreshRecent();
      void startDiscovery().catch(() => {
      });
      const timer = setInterval(() => {
        void getDiscoveredServers().then(setDiscoveredServers).catch(() => {
        });
      }, 3e3);
      return () => {
        clearInterval(timer);
        void stopDiscovery().catch(() => {
        });
      };
    }, [refreshRecent]);
    reactExports.useEffect(() => {
      for (const entry of recentEntries) {
        setRecentReachability((prev) => ({ ...prev, [entry.url]: "checking" }));
        void checkReachability(entry.url, entry.label).then((status) => {
          setRecentReachability((prev) => ({ ...prev, [entry.url]: status }));
        });
      }
    }, [recentEntries]);
    const ensureDevClient = reactExports.useCallback((serverUrl2) => {
      const g = globalThis;
      g.__RAYACT_DEV_SERVER__ = serverUrl2;
      if (g.__rayactDevClient) return;
      const bridge2 = createBridge(g);
      const client = createDevClient({ serverUrl: serverUrl2, bridge: bridge2, global: g });
      installConsoleForwarding(client, g);
      client.connect();
      g.__rayactDevClient = client;
    }, []);
    const waitForConnect = reactExports.useCallback(async () => {
      await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < 120; i++) {
        const err = await getConnectError();
        if (err) throw new Error(err);
        if (!await isConnectLoading()) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("Timed out waiting for dev server bundle");
    }, []);
    const connectToUrl = reactExports.useCallback((raw) => {
      const parsed = parseUrl(raw);
      setConnectError("");
      setConnecting(true);
      void setDevServerUrl(parsed).then(() => {
        setUrlState(parsed);
        return reloadWithProjectBundle();
      }).then(() => waitForConnect()).then(() => {
        ensureDevClient(parsed);
        setProjectLoaded(true);
      }).catch((err) => setConnectError(err instanceof Error ? err.message : String(err))).finally(() => setConnecting(false));
    }, [ensureDevClient, waitForConnect]);
    const value = reactExports.useMemo(() => ({
      url,
      setUrl: setUrlState,
      recentEntries,
      discoveredServers,
      recentReachability,
      connectError,
      connecting,
      clearConnectError: () => setConnectError(""),
      connectToUrl,
      onSelectRecent: connectToUrl,
      onScanQR: () => {
        void __vitePreload(() => Promise.resolve().then(() => native), false ? __VITE_PRELOAD__ : void 0).then((m) => m.scanQR());
      },
      refreshRecent,
      removeRecentItem: (u) => {
        void removeRecentUrl(u).then(refreshRecent);
      },
      reload: () => {
        void reloadWithProjectBundle();
      },
      projectLoaded,
      devMenuOpen,
      setDevMenuOpen,
      inspectorOpen,
      setInspectorOpen
    }), [url, recentEntries, discoveredServers, recentReachability, connectError, connecting, connectToUrl, refreshRecent, projectLoaded, devMenuOpen, inspectorOpen]);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(DevLauncherContext.Provider, { value, children });
  }
  function useDevLauncher() {
    const ctx = reactExports.useContext(DevLauncherContext);
    if (!ctx) throw new Error("useDevLauncher must be used within DevLauncherProvider");
    return ctx;
  }
  function StatusBanner() {
    const launcher = useDevLauncher();
    if (launcher.connecting) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1097377498367, fontSize: 12 } }, children: "Connecting…" });
    }
    if (launcher.connectError) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1099501890559, fontSize: 12 } }, children: launcher.connectError });
    }
    return null;
  }
  function DevLauncherUI() {
    const launcher = useDevLauncher();
    const [tab, setTab] = reactExports.useState("connect");
    const [input, setInput] = reactExports.useState(launcher.url);
    reactExports.useEffect(() => {
      if (launcher.url) setInput(launcher.url);
    }, [launcher.url]);
    const connect = (url) => {
      launcher.clearConnectError();
      launcher.connectToUrl(url);
    };
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: { flexGrow: 1, backgroundColor: 303174399, padding: 16, gap: 12 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 4294967295, fontSize: 24 } }, children: "Rayact Dev Client" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBanner, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: { flexDirection: "row", gap: 8 }, children: ["connect", "recent", "discover"].map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        Text,
        {
          style: { text: { color: tab === t ? 1097377498367 : 1098181030143, fontSize: 14 } },
          onPress: () => setTab(t),
          onClick: () => setTab(t),
          children: t
        },
        t
      )) }),
      tab === "connect" && /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: { gap: 8 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1098181030143, fontSize: 12 } }, children: "Dev server URL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextInput,
          {
            value: input,
            onChangeText: setInput,
            placeholder: "http://192.168.1.5:8081",
            style: { backgroundColor: 1095924067071, padding: 12 }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: { flexDirection: "row", gap: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Connect", onPress: () => connect(input), onClick: () => connect(input) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Scan QR", onPress: launcher.onScanQR, onClick: launcher.onScanQR })
        ] })
      ] }),
      tab === "recent" && /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: { flexGrow: 1 }, children: launcher.recentEntries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1097507309823, fontSize: 14 } }, children: "No recent servers" }) : launcher.recentEntries.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          label: `${entry.url} (${launcher.recentReachability[entry.url] ?? "checking"})`,
          onPress: () => connect(entry.url),
          onClick: () => connect(entry.url)
        },
        entry.url
      )) }),
      tab === "discover" && /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: { flexGrow: 1 }, children: launcher.discoveredServers.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1097507309823, fontSize: 14 } }, children: "Searching LAN for _rayact._tcp..." }) : launcher.discoveredServers.map((server) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          label: `${server.name} — ${server.url}`,
          onPress: () => connect(server.url),
          onClick: () => connect(server.url)
        },
        server.url
      )) })
    ] });
  }
  function DevMenu() {
    const launcher = useDevLauncher();
    if (!launcher.devMenuOpen) return null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
      position: "absolute",
      bottom: 24,
      right: 24,
      backgroundColor: 1022707506943,
      padding: 16,
      gap: 8,
      minWidth: 200
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 4294967295, fontSize: 16 } }, children: "Dev Menu" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1098181030143, fontSize: 11 } }, children: `Server: ${launcher.url}` }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Reload", onPress: launcher.reload }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Inspector", onPress: () => launcher.setInspectorOpen(!launcher.inspectorOpen) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Close", onPress: () => launcher.setDevMenuOpen(false) })
    ] });
  }
  function parseTree(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  function TreeRow({ node, depth }) {
    const [open, setOpen] = reactExports.useState(depth < 2);
    const label = node.name || node.text || node.type;
    const hasChildren = (node.children?.length ?? 0) > 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: { gap: 2 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        View,
        {
          style: { paddingLeft: depth * 12, paddingVertical: 4 },
          onPress: () => {
            if (hasChildren) setOpen((v) => !v);
            if (typeof setInspectorHighlight === "function") setInspectorHighlight(node.id);
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1098989494527, fontSize: 12 } }, children: `${hasChildren ? open ? "▼ " : "▶ " : "  "}${node.type} #${node.id} ${label}` })
        }
      ),
      open && node.children?.map((child) => /* @__PURE__ */ jsxRuntimeExports.jsx(TreeRow, { node: child, depth: depth + 1 }, child.id))
    ] });
  }
  function InspectorPanel() {
    const launcher = useDevLauncher();
    const [tree, setTree] = reactExports.useState([]);
    reactExports.useEffect(() => {
      if (!launcher.inspectorOpen) return;
      const tick = () => {
        if (typeof getNodeTree === "function") {
          setTree(parseTree(getNodeTree()));
        }
      };
      tick();
      const timer = setInterval(tick, 500);
      return () => clearInterval(timer);
    }, [launcher.inspectorOpen]);
    if (!launcher.inspectorOpen) return null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
      position: "absolute",
      top: 24,
      left: 24,
      bottom: 120,
      width: 280,
      backgroundColor: 1022640134911,
      padding: 12,
      gap: 8
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 4294967295, fontSize: 14 } }, children: "Element Inspector" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: { flexGrow: 1 }, children: tree.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 1097507309823, fontSize: 12 } }, children: "No nodes" }) : tree.map((node) => /* @__PURE__ */ jsxRuntimeExports.jsx(TreeRow, { node, depth: 0 }, node.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Text,
        {
          style: { text: { color: 1097377498367, fontSize: 12 } },
          onPress: () => launcher.setInspectorOpen(false),
          children: "Close"
        }
      )
    ] });
  }
  let logId = 0;
  const logBuffer = [];
  function installDevConsoleCapture() {
    const g = globalThis;
    if (g.__rayactDevConsoleInstalled) return;
    g.__rayactDevConsoleInstalled = true;
    const levels = ["log", "info", "warn", "error", "debug"];
    for (const level of levels) {
      const original = console[level]?.bind(console);
      if (!original) continue;
      console[level] = (...args) => {
        original(...args);
        logBuffer.push({
          id: ++logId,
          level,
          text: args.map((a) => {
            try {
              return typeof a === "string" ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          }).join(" ")
        });
        while (logBuffer.length > 200) logBuffer.shift();
      };
    }
  }
  function DevConsole() {
    const launcher = useDevLauncher();
    const [lines, setLines] = reactExports.useState([]);
    reactExports.useEffect(() => {
      if (!launcher.devMenuOpen) return;
      const timer = setInterval(() => setLines([...logBuffer]), 300);
      return () => clearInterval(timer);
    }, [launcher.devMenuOpen]);
    if (!launcher.devMenuOpen) return null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
      position: "absolute",
      left: 24,
      right: 24,
      bottom: 100,
      maxHeight: 160,
      backgroundColor: 3422552064,
      padding: 8,
      gap: 4
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { text: { color: 4294967295, fontSize: 12 } }, children: "Console" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: { flexGrow: 1 }, children: lines.slice(-40).map((line) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        Text,
        {
          style: { text: { color: line.level === "error" ? 1099501890559 : 1098989494527, fontSize: 10 } },
          children: `[${line.level}] ${line.text}`
        },
        line.id
      )) })
    ] });
  }
  installDevConsoleCapture();
  const serverUrl = globalThis.__RAYACT_DEV_SERVER__;
  const bridge = createBridge(globalThis);
  if (serverUrl) {
    const client = createDevClient({ serverUrl, bridge, global: globalThis });
    installConsoleForwarding(client, globalThis);
    client.connect();
  }
  render(
    React.createElement(
      DevLauncherProvider,
      null,
      React.createElement(DevLauncherUI),
      React.createElement(DevMenu),
      React.createElement(InspectorPanel),
      React.createElement(DevConsole)
    )
  );
})();
//# sourceMappingURL=dev-client.js.map
