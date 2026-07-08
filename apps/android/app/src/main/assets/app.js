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
    react_production.useReducer = function(reducer, initialArg, init2) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init2);
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
  globalThis.importCSS("./css/53ee219a-avoid-keyboard.css");
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
    return Boolean(value && typeof value === "object" && typeof value.id === "string" && typeof value.url === "function" && typeof value.bytes === "function");
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
  const SLAB_SIZE$1 = 8;
  const OFFSETS$2 = {
    translateX: 0,
    translateY: 1,
    scale: 2,
    opacity: 3,
    rotation: 4,
    dirty: 5
  };
  let sharedFloatArray$1 = null;
  function writeSharedStyle(nodeId, property, value) {
    const propOffset = OFFSETS$2[property];
    if (propOffset !== void 0) {
      const globalObj2 = globalThis;
      const buffer = globalObj2.__rayactAnimatedStyleBuffer ?? globalObj2.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray$1) {
        sharedFloatArray$1 = new Float32Array(buffer);
      }
      if (sharedFloatArray$1) {
        const index = nodeId * SLAB_SIZE$1 + propOffset;
        const dirtyIndex = nodeId * SLAB_SIZE$1 + OFFSETS$2.dirty;
        sharedFloatArray$1[index] = value;
        sharedFloatArray$1[dirtyIndex] = 1;
      }
      if (typeof globalObj2.__rayactSetAnimatedStyle === "function") {
        globalObj2.__rayactSetAnimatedStyle(nodeId, {
          [property]: value
        });
      }
    }
  }
  function animatedStyleSnapshot$1(style) {
    const animated = {};
    for (const key of Object.keys(OFFSETS$2)) {
      if (key === "dirty") continue;
      const value = style[key];
      if (typeof value === "number") animated[key] = value;
    }
    return animated;
  }
  function registerAnimatedHostNode(node, style) {
    const globalObj2 = globalThis;
    const animated = animatedStyleSnapshot$1(style);
    if (Object.keys(animated).length > 0 && typeof globalObj2.__rayactRegisterAnimatedNode === "function") {
      globalObj2.__rayactRegisterAnimatedNode(node.id, animated);
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
      } else if (OFFSETS$2[key] !== void 0) {
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
    return {
      id,
      type
    };
  }
  function resolveImageSource(value, native) {
    if (isRayactAsset(value)) {
      return typeof native.resolveAssetPath === "function" ? native.resolveAssetPath(value) : resolveAssetUrl(value, native);
    }
    return String(value ?? "");
  }
  const materialHostTypes = /* @__PURE__ */ new Set(["appBar", "badge", "banner", "bottomAppBar", "bottomSheet", "dataTable", "dockedToolbar", "floatingToolbar", "buttonGroup", "card", "carousel", "checkbox", "chip", "datePicker", "dialog", "divider", "extendedFab", "fab", "fabMenu", "iconButton", "list", "loadingIndicator", "menu", "menuItem", "navigationBar", "navigationBarItem", "navigationDrawer", "navigationRail", "progressIndicator", "radioButton", "rangeSlider", "search", "searchBar", "segmentedButton", "sideSheet", "slider", "snackbar", "splitButton", "switch", "tabs", "textField", "timePicker", "toolbar", "tooltip", "popover"]);
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
    const native = globalObject;
    const bridge2 = {
      createNode(type, props = {}) {
        const style = toStyleProps(props, true);
        switch (type) {
          case "root":
          case "view": {
            const viewArg = props.appBarTitle ? {
              ...style,
              appBarTitle: true
            } : style;
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createView, "createView")(viewArg), type), style);
          }
          case "text": {
            const text = String(props.text ?? props.children ?? "");
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createText, "createText")(text, style), type), style);
          }
          case "button": {
            const label = String(props.label ?? props.text ?? props.children ?? "");
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createButton, "createButton")(label, style), type), style);
          }
          case "image":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createImage, "createImage")(resolveImageSource(props.source ?? props.src, native), style), type), style);
          case "icon":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createIcon, "createIcon")(String(props.name ?? props.icon ?? ""), typeof props.size === "number" ? props.size : void 0, typeof props.color === "number" || typeof props.color === "string" ? props.color : void 0, style, typeof props.variant === "string" ? props.variant : void 0, typeof props.filled === "boolean" ? props.filled : void 0, typeof props.set === "string" ? props.set : void 0), type), style);
          case "textInput":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createTextInput, "createTextInput")(String(props.value ?? props.defaultValue ?? ""), {
              ...style,
              ...props
            }), type), style);
          case "scrollView":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createScrollView, "createScrollView")({
              ...style,
              ...props
            }), type), style);
          case "externalView":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createExternalView, "createExternalView")(String(props.kind ?? "stub"), {
              ...style,
              ...props
            }), type), style);
          case "modal":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createModal, "createModal")({
              ...style,
              ...props
            }), type), style);
          case "safeArea":
            return registerAnimatedHostNode(asHostNode((native.createSafeArea ?? native.createView ?? requireFunction(native.createView, "createView"))({
              ...style,
              ...props
            }), type), style);
          case "statusBar":
            return registerAnimatedHostNode(asHostNode((native.createStatusBar ?? native.createView ?? requireFunction(native.createView, "createView"))({
              ...style,
              ...props
            }), type), style);
          case "activityIndicator":
            return registerAnimatedHostNode(asHostNode(requireFunction(native.createActivityIndicator, "createActivityIndicator")({
              ...style,
              ...props
            }), type), style);
          default:
            if (materialHostTypes.has(type)) {
              return registerAnimatedHostNode(asHostNode(requireFunction(native.createMaterialComponent, "createMaterialComponent")(type, materialProps(type, props, style)), type), style);
            }
            throw new Error(`Unsupported Rayact host node type: ${type}`);
        }
      },
      updateNode(node, props) {
        const style = toStyleProps(props, false, node.id);
        if (materialHostTypes.has(node.type) && typeof native.setMaterialComponentProps === "function") {
          native.setMaterialComponentProps(node.id, materialProps(node.type, props, style));
        }
        if (Object.keys(style).length > 0) {
          requireFunction(native.setStyle, "setStyle")(node.id, style);
        }
        if (node.type === "externalView" && typeof native.setExternalViewProps === "function") {
          native.setExternalViewProps(node.id, {
            ...props
          });
        }
        if (node.type === "icon" && typeof native.setIconProps === "function") {
          native.setIconProps(node.id, typeof props.size === "number" ? props.size : void 0, typeof props.color === "number" || typeof props.color === "string" ? props.color : void 0, typeof props.variant === "string" ? props.variant : void 0, typeof props.name === "string" ? props.name : typeof props.icon === "string" ? props.icon : void 0, typeof props.filled === "boolean" ? props.filled : void 0, typeof props.set === "string" ? props.set : void 0);
        }
        if (node.type === "text" && ("text" in props || "children" in props)) {
          requireFunction(native.setText, "setText")(node.id, String(props.text ?? props.children ?? ""));
        }
        if (node.type === "button" && ("label" in props || "text" in props || "title" in props || typeof props.children === "string" || typeof props.children === "number")) {
          requireFunction(native.setText, "setText")(node.id, String(props.label ?? props.text ?? props.title ?? props.children ?? ""));
        }
        if (node.type === "textInput" && "value" in props && typeof native.setValue === "function") {
          native.setValue(node.id, String(props.value ?? ""));
        }
      },
      appendChild(parent, child) {
        requireFunction(native.appendChild, "appendChild")(parent.id, child.id);
      },
      removeChild(parent, child) {
        requireFunction(native.removeChild, "removeChild")(parent.id, child.id);
      },
      insertBefore(parent, child, beforeChild) {
        requireFunction(native.insertBefore, "insertBefore")(parent.id, child.id, beforeChild.id);
      },
      setRoot(node) {
        if (node) {
          requireFunction(native.setRootNode, "setRootNode")(node.id);
        } else if (typeof native.clearRootNode === "function") {
          native.clearRootNode();
        } else {
          requireFunction(native.setRootNode, "setRootNode")(null);
        }
      },
      setEventHandler(node, eventName, handler) {
        if (eventName === "press" || eventName === "click") {
          requireFunction(native.setOnPress, "setOnPress")(node.id, handler ?? null);
        } else if (eventName === "changeText" && typeof native.setOnChangeText === "function") {
          native.setOnChangeText(node.id, handler);
        } else if (eventName === "changeValue" && typeof native.setOnChangeValue === "function") {
          native.setOnChangeValue(node.id, handler);
        } else if (eventName === "scroll" && typeof native.setOnScroll === "function") {
          native.setOnScroll(node.id, handler);
        } else if (eventName === "requestClose" && typeof native.setOnRequestClose === "function") {
          native.setOnRequestClose(node.id, handler ?? null);
        } else if (eventName === "focus" && typeof native.setOnFocus === "function") {
          native.setOnFocus(node.id, handler ?? null);
        } else if (eventName === "blur" && typeof native.setOnBlur === "function") {
          native.setOnBlur(node.id, handler ?? null);
        } else if (eventName === "submitEditing" && typeof native.setOnSubmitEditing === "function") {
          native.setOnSubmitEditing(node.id, handler);
        } else if (eventName === "endEditing" && typeof native.setOnEndEditing === "function") {
          native.setOnEndEditing(node.id, handler);
        } else if (eventName === "selectionChange" && typeof native.setOnSelectionChange === "function") {
          native.setOnSelectionChange(node.id, handler);
        } else if (eventName === "keyPress" || eventName === "contentSizeChange") ;
        else if (eventName === "dragStart" && typeof native.setOnDragStart === "function") {
          native.setOnDragStart(node.id, handler);
        } else if (eventName === "dragMove" && typeof native.setOnDragMove === "function") {
          native.setOnDragMove(node.id, handler);
        } else if (eventName === "dragEnd" && typeof native.setOnDragEnd === "function") {
          native.setOnDragEnd(node.id, handler);
        } else if (eventName === "layout" && typeof native.setOnLayout === "function") {
          native.setOnLayout(node.id, handler);
        }
      },
      disposeNode(node) {
        if (typeof native.disposeNode === "function") {
          native.disposeNode(node.id);
        }
      },
      async reload(source) {
        if (!source) return;
        if (typeof native.eval !== "function") {
          throw new Error("Rayact reload requires global eval()");
        }
        native.eval(source);
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
            style: {
              text: {
                color: 4294967295,
                fontSize: 24
              }
            }
          });
          const body = bridge2.createNode("text", {
            text: detail,
            style: {
              text: {
                color: 4290032895,
                fontSize: 14
              }
            }
          });
          bridge2.appendChild(root, title);
          bridge2.appendChild(root, body);
          bridge2.setRoot(root);
        } catch (overlayError) {
          native.console?.error?.("Failed to show Rayact error overlay", overlayError);
        }
      }
    };
    return bridge2;
  }
  function joinUrl(serverUrl2, path) {
    return `${serverUrl2.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
  function currentPlatform(globalObject) {
    const injected = globalObject.__rayactPlatform;
    if (injected && typeof injected.target === "string" && injected.target) return injected.target;
    if (injected && typeof injected.os === "string" && injected.os) return injected.os;
    const nav = globalObject.navigator;
    if (typeof nav?.userAgent === "string") {
      if (/Android/i.test(nav.userAgent)) return "android";
      if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return "ios";
      return "web";
    }
    return null;
  }
  function withPlatformParam(url, platform) {
    if (!platform || /[?&]platform=/.test(url)) return url;
    return `${url}${url.includes("?") ? "&" : "?"}platform=${encodeURIComponent(platform)}`;
  }
  function toWsUrl(serverUrl2, channel) {
    return joinUrl(serverUrl2, channel).replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  }
  function serializeError(error) {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack
      };
    }
    return {
      message: String(error)
    };
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
      debuggerSocket.send(JSON.stringify({
        type,
        payload
      }));
    };
    const fetchManifest = async () => {
      const fetchFn = globalObject.fetch;
      if (typeof fetchFn !== "function") return {};
      const response = await fetchFn(withPlatformParam(joinUrl(options.serverUrl, "/rayact/manifest.json"), currentPlatform(globalObject)));
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
        const response = await fetchFn(withPlatformParam(joinUrl(options.serverUrl, "/rayact/status"), currentPlatform(globalObject)));
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
        send("client:ready", {
          serverUrl: options.serverUrl
        });
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
    return {
      connect,
      disconnect,
      send
    };
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
  var Platform = /* @__PURE__ */ ((Platform2) => {
    Platform2["WINDOWS"] = "windows";
    Platform2["LINUX"] = "linux";
    Platform2["MACOS"] = "macos";
    Platform2["IOS"] = "ios";
    Platform2["ANDROID"] = "android";
    Platform2["WEB"] = "web";
    return Platform2;
  })(Platform || {});
  function detectPlatform() {
    const injected = globalThis.__rayactPlatform;
    if (injected && typeof injected.os === "string") {
      switch (injected.os.toLowerCase()) {
        case "android":
          return "android";
        case "ios":
          return "ios";
        case "macos":
          return "macos";
        case "windows":
          return "windows";
        case "linux":
          return "linux";
        case "web":
          return "web";
      }
    }
    if (typeof window !== "undefined") {
      if (/Android/i.test(navigator.userAgent)) return "android";
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
      if (/iPad/i.test(navigator.userAgent)) return "ios";
      if (/Windows/i.test(navigator.userAgent)) return "windows";
      if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) return "macos";
      if (/Linux/i.test(navigator.userAgent)) return "linux";
      if (typeof navigator !== "undefined" && navigator.vendor === "Google Inc." && navigator.platform === "Win32") {
        return "windows";
      }
    }
    return "web";
  }
  ((Platform2) => {
    Platform2.OS = detectPlatform();
    Platform2.Version = globalThis.__rayactPlatform?.version ?? "";
    function select(specifics) {
      if (Platform2.OS in specifics) return specifics[Platform2.OS];
      if (Platform2.OS !== "web" && "native" in specifics) return specifics.native;
      return specifics.default;
    }
    Platform2.select = select;
  })(Platform || (Platform = {}));
  function getGlobal(options) {
    return options?.global ?? globalThis;
  }
  function createRuntime(options = {}) {
    const globalObject = getGlobal(options);
    const bridge2 = options.bridge ?? createBridge(globalObject);
    const serverUrl2 = typeof globalObject.__RAYACT_DEV_SERVER__ === "string" ? globalObject.__RAYACT_DEV_SERVER__ : void 0;
    const isNativeHost = typeof globalObject.createView === "function";
    const shouldCreateDevClient = typeof serverUrl2 === "string" && (options.devClient === true || options.devClient !== false && !isNativeHost);
    const devClient = typeof options.devClient === "object" ? options.devClient : shouldCreateDevClient ? createDevClient({
      serverUrl: serverUrl2,
      bridge: bridge2,
      global: globalObject
    }) : void 0;
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
        devClient?.send("client:error", {
          message,
          stack
        });
      }
    };
  }
  function getDefaultRuntime() {
    const globalObject = globalThis;
    if (!globalObject.__rayactRuntime) {
      globalObject.__rayactRuntime = createRuntime({
        global: globalObject
      });
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
        function pop(cursor2) {
          0 > index$jscomp$0 || (cursor2.current = valueStack[index$jscomp$0], valueStack[index$jscomp$0] = null, index$jscomp$0--);
        }
        function push(cursor2, value) {
          index$jscomp$0++;
          valueStack[index$jscomp$0] = cursor2.current;
          cursor2.current = value;
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
          for (var currentTime = now2(), prev = null, root = firstScheduledRoot; null !== root; ) {
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
          scheduleTaskForRootDuringMicrotask(root, now2());
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
          var init2 = lazyType._init;
          return init2(lazyType._payload);
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
                  var init2 = newChild._init;
                  newChild = init2(newChild._payload);
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
                  var init2 = newChild._init;
                  newChild = init2(newChild._payload);
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
                var lazyComponent = workInProgress2.elementType, init2 = lazyComponent._init;
                lazyComponent = init2(lazyComponent._payload);
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
                    if (init2 = lazyComponent.$$typeof, init2 === REACT_FORWARD_REF_TYPE) {
                      workInProgress2.tag = 11;
                      workInProgress2 = updateForwardRef(
                        null,
                        workInProgress2,
                        lazyComponent,
                        current,
                        renderLanes2
                      );
                      break a;
                    } else if (init2 === REACT_MEMO_TYPE) {
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
              return lazyComponent = workInProgress2.type, init2 = resolveClassComponentProps(
                lazyComponent,
                workInProgress2.pendingProps
              ), updateClassComponent(
                current,
                workInProgress2,
                lazyComponent,
                init2,
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
                init2 = workInProgress2.memoizedState;
                lazyComponent = init2.element;
                cloneUpdateQueue(current, workInProgress2);
                processUpdateQueue(workInProgress2, nextProps, null, renderLanes2);
                var nextState = workInProgress2.memoizedState;
                nextProps = nextState.cache;
                pushProvider(workInProgress2, CacheContext, nextProps);
                nextProps !== init2.cache && propagateContextChanges(
                  workInProgress2,
                  [CacheContext],
                  renderLanes2,
                  true
                );
                suspendIfUpdateReadFromEntangledAsyncAction();
                nextProps = nextState.element;
                if (supportsHydration && init2.isDehydrated)
                  if (init2 = {
                    element: nextProps,
                    isDehydrated: false,
                    cache: nextState.cache
                  }, workInProgress2.updateQueue.baseState = init2, workInProgress2.memoizedState = init2, workInProgress2.flags & 256) {
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
                if (init2 = lazyComponent = nextHydratableInstance)
                  lazyComponent = canHydrateInstance(
                    lazyComponent,
                    workInProgress2.type,
                    workInProgress2.pendingProps,
                    rootOrSingletonContext
                  ), null !== lazyComponent ? (workInProgress2.stateNode = lazyComponent, hydrationParentFiber = workInProgress2, nextHydratableInstance = getFirstHydratableChild(lazyComponent), rootOrSingletonContext = false, init2 = true) : init2 = false;
                init2 || throwOnHydrationMismatch(workInProgress2);
              }
              pushHostContext(workInProgress2);
              init2 = workInProgress2.type;
              nextProps = workInProgress2.pendingProps;
              nextState = null !== current ? current.memoizedProps : null;
              lazyComponent = nextProps.children;
              shouldSetTextContent(init2, nextProps) ? lazyComponent = null : null !== nextState && shouldSetTextContent(init2, nextState) && (workInProgress2.flags |= 32);
              null !== workInProgress2.memoizedState && (init2 = renderWithHooks(
                current,
                workInProgress2,
                TransitionAwareHostComponent,
                null,
                null,
                renderLanes2
              ), isPrimaryRenderer ? HostTransitionContext2._currentValue = init2 : HostTransitionContext2._currentValue2 = init2);
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
              return init2 = workInProgress2.type._context, lazyComponent = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), init2 = readContext(init2), lazyComponent = lazyComponent(init2), workInProgress2.flags |= 1, reconcileChildren(
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
              return prepareToReadContext(workInProgress2), lazyComponent = readContext(CacheContext), null === current ? (init2 = peekCacheFromPool(), null === init2 && (init2 = workInProgressRoot, nextProps = createCache(), init2.pooledCache = nextProps, nextProps.refCount++, null !== nextProps && (init2.pooledCacheLanes |= renderLanes2), init2 = nextProps), workInProgress2.memoizedState = {
                parent: lazyComponent,
                cache: init2
              }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, init2)) : (0 !== (current.lanes & renderLanes2) && (cloneUpdateQueue(current, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), init2 = current.memoizedState, nextProps = workInProgress2.memoizedState, init2.parent !== lazyComponent ? (init2 = { parent: lazyComponent, cache: lazyComponent }, workInProgress2.memoizedState = init2, 0 === workInProgress2.lanes && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = init2), pushProvider(workInProgress2, CacheContext, lazyComponent)) : (lazyComponent = nextProps.cache, pushProvider(workInProgress2, CacheContext, lazyComponent), lazyComponent !== init2.cache && propagateContextChanges(
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
                  null !== nextResource.tail && now2() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, newProps = true, cutOffTailIfNeeded(nextResource, false), workInProgress2.lanes = 4194304);
                }
              else {
                if (!newProps)
                  if (current = findFirstSuspended(cache$110), null !== current) {
                    if (workInProgress2.flags |= 128, newProps = true, current = current.updateQueue, workInProgress2.updateQueue = current, scheduleRetryEffect(workInProgress2, current), cutOffTailIfNeeded(nextResource, true), null === nextResource.tail && "hidden" === nextResource.tailMode && !cache$110.alternate && !isHydrating)
                      return bubbleProperties(workInProgress2), null;
                  } else
                    2 * now2() - nextResource.renderingStartTime > workInProgressRootRenderTargetTime && 536870912 !== renderLanes2 && (workInProgress2.flags |= 128, newProps = true, cutOffTailIfNeeded(nextResource, false), workInProgress2.lanes = 4194304);
                nextResource.isBackwards ? (cache$110.sibling = workInProgress2.child, workInProgress2.child = cache$110) : (current = nextResource.last, null !== current ? current.sibling = cache$110 : workInProgress2.child = cache$110, nextResource.last = cache$110);
              }
              if (null !== nextResource.tail)
                return workInProgress2 = nextResource.tail, nextResource.rendering = workInProgress2, nextResource.tail = workInProgress2.sibling, nextResource.renderingStartTime = now2(), workInProgress2.sibling = null, current = suspenseStackCursor.current, push(
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
              finishedWork.child.flags & 8192 && null !== finishedWork.memoizedState !== (null !== current && null !== current.memoizedState) && (globalMostRecentFallbackTime = now2());
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
                if ((lanes & 62914560) === lanes && (renderWasConcurrent = globalMostRecentFallbackTime + 300 - now2(), 10 < renderWasConcurrent)) {
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
          workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now2() + 500, prepareFreshStack(root, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(
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
          workInProgressRoot === root && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (4 === workInProgressRootExitStatus || 3 === workInProgressRootExitStatus && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now2() - globalMostRecentFallbackTime ? 0 === (executionContext & 2) && prepareFreshStack(root, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
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
        var validateHydratableInstance = $$$config.validateHydratableInstance, validateHydratableTextInstance = $$$config.validateHydratableTextInstance, supportsResources = $$$config.supportsResources, isHostHoistableType = $$$config.isHostHoistableType, getHoistableRoot = $$$config.getHoistableRoot, getResource = $$$config.getResource, acquireResource = $$$config.acquireResource, releaseResource = $$$config.releaseResource, hydrateHoistable = $$$config.hydrateHoistable, mountHoistable = $$$config.mountHoistable, unmountHoistable = $$$config.unmountHoistable, createHoistableInstance = $$$config.createHoistableInstance, prepareToCommitHoistables = $$$config.prepareToCommitHoistables, mayResourceSuspendCommit = $$$config.mayResourceSuspendCommit, preloadResource = $$$config.preloadResource, suspendResource = $$$config.suspendResource, supportsSingletons = $$$config.supportsSingletons, resolveSingletonInstance = $$$config.resolveSingletonInstance, clearSingleton = $$$config.clearSingleton, acquireSingletonInstance = $$$config.acquireSingletonInstance, releaseSingletonInstance = $$$config.releaseSingletonInstance, isHostSingletonType = $$$config.isHostSingletonType, valueStack = [], index$jscomp$0 = -1, emptyContextObject = {}, clz32 = Math.clz32 ? Math.clz32 : clz32Fallback, log$1 = Math.log, LN2 = Math.LN2, nextTransitionLane = 128, nextRetryLane = 4194304, scheduleCallback$3 = Scheduler.unstable_scheduleCallback, cancelCallback$1 = Scheduler.unstable_cancelCallback, shouldYield = Scheduler.unstable_shouldYield, requestPaint = Scheduler.unstable_requestPaint, now2 = Scheduler.unstable_now, ImmediatePriority = Scheduler.unstable_ImmediatePriority, UserBlockingPriority = Scheduler.unstable_UserBlockingPriority, NormalPriority$1 = Scheduler.unstable_NormalPriority, IdlePriority = Scheduler.unstable_IdlePriority, log = Scheduler.log, unstable_setDisableYieldValue = Scheduler.unstable_setDisableYieldValue, rendererID = null, injectedHook = null, objectIs = "function" === typeof Object.is ? Object.is : is, CapturedStacks = /* @__PURE__ */ new WeakMap(), forkStack = [], forkStackIndex = 0, treeForkProvider = null, treeForkCount = 0, idStack = [], idStackIndex = 0, treeContextProvider = null, treeContextId = 1, treeContextOverflow = "", contextStackCursor = createCursor(null), contextFiberStackCursor = createCursor(null), rootInstanceStackCursor = createCursor(null), hostTransitionProviderCursor = createCursor(null), hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = false, hydrationErrors = null, rootOrSingletonContext = false, HydrationMismatchException = Error(formatProdErrorMessage(519)), concurrentQueues = [], concurrentQueuesIndex = 0, concurrentlyUpdatedLanes = 0, firstScheduledRoot = null, lastScheduledRoot = null, didScheduleMicrotask = false, mightHavePendingSyncWork = false, isFlushingWork = false, currentEventTransitionLane = 0, currentEntangledListeners = null, currentEntangledPendingCount = 0, currentEntangledLane = 0, currentEntangledActionThenable = null, hasForceUpdate = false, didReadFromEntangledAsyncAction = false, hasOwnProperty = Object.prototype.hasOwnProperty, SuspenseException = Error(formatProdErrorMessage(460)), SuspenseyCommitException = Error(formatProdErrorMessage(474)), noopSuspenseyCommitThenable = { then: function() {
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
          useReducer: function(reducer, initialArg, init2) {
            var hook = mountWorkInProgressHook();
            if (void 0 !== init2) {
              var initialState = init2(initialArg);
              if (shouldDoubleInvokeUserFnsInHooksDEV) {
                setIsStrictModeForDevtools(true);
                try {
                  init2(initialArg);
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
                  0 === (executionContext & 6) && (workInProgressRootRenderTargetTime = now2() + 500, flushSyncWorkAcrossRoots_impl(0));
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
            setCurrentUpdatePriority(previousPriority), ReactSharedInternals.T = prevTransition, 0 === executionContext && (workInProgressRootRenderTargetTime = now2() + 500);
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
  const counters = {
    created: 0,
    updated: 0,
    disposed: 0,
    mutationCount: 0,
    binaryCreateFallbacks: 0
  };
  let commitStart = 0;
  function enabled() {
    return globalThis.__RAYACT_PERF_LOG === true;
  }
  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  function perfLog(event, data) {
    if (!enabled()) return;
    const payload = data ? {
      ...data,
      ts: now()
    } : {
      ts: now()
    };
    console.log(`[rayact:perf] ${event}`, payload);
  }
  function perfMarkCommitStart() {
    if (!enabled()) return;
    commitStart = now();
    perfLog("commit.start");
  }
  function perfMarkCommitEnd() {
    if (!enabled()) return;
    perfLog("commit.end", {
      durationMs: commitStart > 0 ? now() - commitStart : 0,
      "created.nodes": counters.created,
      "updated.nodes": counters.updated,
      "disposed.nodes": counters.disposed,
      "mutation.count": counters.mutationCount,
      "binary.create.fallbacks": counters.binaryCreateFallbacks
    });
    counters.created = 0;
    counters.updated = 0;
    counters.disposed = 0;
    counters.mutationCount = 0;
    counters.binaryCreateFallbacks = 0;
  }
  function perfIncCreated() {
    counters.created++;
  }
  function perfIncUpdated() {
    counters.updated++;
  }
  function perfIncDisposed() {
    counters.disposed++;
  }
  function perfLogBatch(durationMs, count) {
    if (!enabled()) return;
    counters.mutationCount += count;
    perfLog("native.batch.durationMs", {
      durationMs,
      count
    });
  }
  function perfIncBinaryCreateFallback(type, reason) {
    if (!enabled()) return;
    counters.binaryCreateFallbacks++;
    perfLog("binary.create.fallback", {
      type,
      reason
    });
  }
  function fastPathEnabled() {
    return globalThis.__RAYACT_USE_FAST_PATH === true;
  }
  const OFFSETS$1 = {
    translateX: 0,
    translateY: 1,
    scale: 2,
    opacity: 3,
    rotation: 4
  };
  function animatedStyleSnapshot(style) {
    const animated = {};
    for (const key of Object.keys(OFFSETS$1)) {
      const value = style[key];
      if (typeof value === "number") animated[key] = value;
    }
    return animated;
  }
  const nativeFastPath = {
    get enabled() {
      return fastPathEnabled();
    },
    get createNode() {
      return fastPathEnabled() && typeof globalThis.__rayactCreateNodeFast === "function";
    },
    get updateNode() {
      return fastPathEnabled() && typeof globalThis.__rayactUpdateNodeFast === "function";
    },
    get batch() {
      return fastPathEnabled() && typeof globalThis.__rayactBatchMutations === "function";
    }
  };
  const mutationQueue = [];
  function enqueueMutation(op) {
    if (nativeFastPath.batch) {
      mutationQueue.push(op);
    }
  }
  function flushMutations() {
    if (!nativeFastPath.batch || mutationQueue.length === 0) return;
    const host = globalThis;
    const ops = mutationQueue.splice(0, mutationQueue.length);
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    host.__rayactBatchMutations(ops);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    perfLogBatch(end - start, ops.length);
  }
  function createNodeFast(type, props) {
    const host = globalThis;
    if (!nativeFastPath.createNode) return null;
    const id = host.__rayactCreateNodeFast(type, props);
    if (typeof id !== "number") return null;
    const animated = animatedStyleSnapshot(flattenStyleForAnimated(props.style, true));
    if (Object.keys(animated).length > 0 && typeof host.__rayactRegisterAnimatedNode === "function") {
      host.__rayactRegisterAnimatedNode(id, animated);
    }
    return {
      id,
      type
    };
  }
  function updateNodeFast(nodeId, type, oldProps, newProps) {
    const host = globalThis;
    if (!nativeFastPath.updateNode) return false;
    try {
      return host.__rayactUpdateNodeFast(nodeId, type, oldProps, newProps) === true;
    } catch {
      return false;
    }
  }
  function flattenStyleForAnimated(style, isCreate) {
    if (!style) return {};
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map((s) => flattenStyleForAnimated(s, isCreate)));
    }
    if (typeof style !== "object") return {};
    const result = {};
    for (const [key, value] of Object.entries(style)) {
      if (value == null) continue;
      if (typeof value === "object" && value !== null && "value" in value && isCreate) {
        result[key] = value.value;
      } else if (OFFSETS$1[key] !== void 0 && typeof value === "number") {
        result[key] = value;
      } else if (key !== "transform") {
        result[key] = value;
      }
    }
    return result;
  }
  const CMD = {
    // --- structural (slice 1) ---
    APPEND: 1,
    //  parentId, childId
    INSERT: 2,
    //  parentId, childId, beforeChildId
    REMOVE: 3,
    //  parentId, childId
    DISPOSE: 4,
    // nodeId
    SET_ROOT: 5,
    // nodeId
    // --- create + style (slice 3) ---
    CREATE: 10,
    //      nodeId, typeId, styleN, [styleEntry...]
    CREATE_PARAM: 11,
    //   nodeId, styleN, [styleEntry...]
    NEW_STRING: 13,
    //  stringId, byteLen, <utf8, padded to 4>
    SET_TEXT: 14
  };
  const TYPE = {
    VIEW: 1,
    TEXT: 2,
    BUTTON: 3,
    IMAGE: 4,
    ICON: 5,
    SCROLL_VIEW: 6,
    TEXT_INPUT: 7,
    SAFE_AREA: 8,
    STATUS_BAR: 9
  };
  const SK = {
    // floats
    width: 1,
    height: 2,
    minWidth: 3,
    minHeight: 4,
    maxWidth: 5,
    maxHeight: 6,
    flexGrow: 7,
    flexShrink: 8,
    flexBasis: 9,
    flex: 10,
    gap: 11,
    rowGap: 12,
    columnGap: 13,
    padding: 14,
    paddingTop: 15,
    paddingRight: 16,
    paddingBottom: 17,
    paddingLeft: 18,
    paddingHorizontal: 19,
    paddingVertical: 20,
    margin: 21,
    marginTop: 22,
    marginRight: 23,
    marginBottom: 24,
    marginLeft: 25,
    marginHorizontal: 26,
    marginVertical: 27,
    opacity: 28,
    borderRadius: 29,
    borderWidth: 30,
    elevation: 31,
    translateX: 36,
    translateY: 37,
    scale: 38,
    rotation: 39,
    fontSize: 40,
    lineHeight: 41,
    letterSpacing: 42,
    // colors (uint32)
    backgroundColor: 50,
    borderColor: 51,
    color: 52,
    // enums (int)
    flexDirection: 60,
    justifyContent: 61,
    alignItems: 62,
    alignSelf: 63,
    display: 64,
    position: 65,
    overflow: 66,
    pointerEvents: 67
  };
  const ENUM_VALUES = {
    flexDirection: {
      row: 0,
      column: 1,
      "row-reverse": 2,
      "column-reverse": 3
    },
    justifyContent: {
      "flex-start": 0,
      "flex-end": 1,
      center: 2,
      "space-between": 3,
      "space-around": 4,
      "space-evenly": 5
    },
    alignItems: {
      "flex-start": 0,
      "flex-end": 1,
      center: 2,
      stretch: 3,
      baseline: 4
    },
    alignSelf: {
      "flex-start": 0,
      "flex-end": 1,
      center: 2,
      stretch: 3
    },
    display: {
      flex: 0,
      none: 1,
      contents: 2
    },
    position: {
      absolute: 0,
      relative: 1,
      fixed: 2
    },
    overflow: {
      hidden: 0,
      scroll: 1,
      visible: 2
    },
    pointerEvents: {
      none: 0,
      auto: 1
    }
  };
  let view = null;
  let capacity = 0;
  let cursor = 0;
  function init() {
    if (view) return true;
    const g = globalThis;
    const buf = g.__rayactCommandBuffer;
    if (!buf || typeof g.__rayactFlushCommands !== "function") return false;
    view = new DataView(buf);
    capacity = buf.byteLength;
    return true;
  }
  function binaryEnabled() {
    return globalThis.__RAYACT_USE_BINARY === true && init();
  }
  let nextNodeId = 0;
  function allocNodeId() {
    nextNodeId += 2;
    return nextNodeId;
  }
  const stringIds = /* @__PURE__ */ new Map();
  let nextStringId = 1;
  function ensureSpace(bytes) {
    if (cursor + bytes > capacity) flushCommands();
  }
  function w32(v) {
    view.setInt32(cursor, v | 0, true);
    cursor += 4;
  }
  function wU32(v) {
    view.setUint32(cursor, v >>> 0, true);
    cursor += 4;
  }
  function wF64(v) {
    view.setFloat64(cursor, v, true);
    cursor += 8;
  }
  function emitAppend(parentId, childId) {
    ensureSpace(12);
    w32(CMD.APPEND);
    w32(parentId);
    w32(childId);
  }
  function emitInsert(parentId, childId, beforeChildId) {
    ensureSpace(16);
    w32(CMD.INSERT);
    w32(parentId);
    w32(childId);
    w32(beforeChildId);
  }
  function emitRemove(parentId, childId) {
    ensureSpace(12);
    w32(CMD.REMOVE);
    w32(parentId);
    w32(childId);
  }
  function emitDispose(nodeId) {
    ensureSpace(8);
    w32(CMD.DISPOSE);
    w32(nodeId);
  }
  function emitSetRoot(nodeId) {
    ensureSpace(8);
    w32(CMD.SET_ROOT);
    w32(nodeId);
  }
  const SK_MAP = SK;
  function styleEntrySize(key, value) {
    if (value == null) return 0;
    const id = SK_MAP[key];
    if (id === void 0) return -1;
    if (id < 60) {
      if (typeof value !== "number") return -1;
      return id < 50 ? 12 : 8;
    }
    const m = ENUM_VALUES[key];
    if (!m || typeof value !== "string" || m[value] === void 0) return -1;
    return 8;
  }
  function styleEncSize(style) {
    if (style == null) return 4;
    if (typeof style !== "object" || Array.isArray(style)) return -1;
    let bytes = 4;
    for (const k in style) {
      const v = style[k];
      if (v == null) continue;
      if (k === "text") {
        if (typeof v !== "object" || Array.isArray(v)) return -1;
        for (const textKey in v) {
          const nestedSize = styleEntrySize(textKey, v[textKey]);
          if (nestedSize < 0) return -1;
          bytes += nestedSize;
        }
        continue;
      }
      const entrySize = styleEntrySize(k, v);
      if (entrySize < 0) return -1;
      bytes += entrySize;
    }
    return bytes;
  }
  function writeStyleRun(style) {
    if (!style) {
      w32(0);
      return;
    }
    const countPos = cursor;
    cursor += 4;
    let n = 0;
    const writeEntry = (k, v) => {
      if (v == null) return;
      const id = SK_MAP[k];
      if (id === void 0) return;
      w32(id);
      if (id < 50) wF64(v);
      else if (id < 60) wU32(v);
      else w32(ENUM_VALUES[k][v]);
      n++;
    };
    for (const k in style) {
      const v = style[k];
      if (k === "text" && v && typeof v === "object" && !Array.isArray(v)) {
        for (const textKey in v) {
          writeEntry(textKey, v[textKey]);
        }
        continue;
      }
      writeEntry(k, v);
    }
    view.setInt32(countPos, n, true);
  }
  function emitCreate(nodeId, typeId, style, styleBytes = styleEncSize(style)) {
    ensureSpace(12 + styleBytes);
    w32(CMD.CREATE);
    w32(nodeId);
    w32(typeId);
    writeStyleRun(style);
  }
  const CREATE_PARAM_HAS_SIZE = 1 << 0;
  const CREATE_PARAM_HAS_COLOR = 1 << 1;
  const CREATE_PARAM_FILLED = 1 << 2;
  const CREATE_PARAM_HAS_FILLED = 1 << 3;
  function emitCreateParam(nodeId, typeId, stringId, style, options = {}, styleBytes = styleEncSize(style)) {
    ensureSpace(36 + styleBytes);
    w32(CMD.CREATE_PARAM);
    w32(nodeId);
    w32(typeId);
    w32(stringId);
    w32(options.flags ?? 0);
    wF64(options.size ?? 0);
    wU32(options.color ?? 0);
    w32(options.variantId ?? 0);
    writeStyleRun(style);
  }
  function utf8ByteLen(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 56320 && c2 <= 57343) {
          c = 65536 + (c - 55296 << 10) + (c2 - 56320);
          i++;
        }
      }
      n += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
    }
    return n;
  }
  function writeUtf8(s) {
    const v = view;
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 56320 && c2 <= 57343) {
          c = 65536 + (c - 55296 << 10) + (c2 - 56320);
          i++;
        }
      }
      if (c < 128) {
        v.setUint8(cursor++, c);
      } else if (c < 2048) {
        v.setUint8(cursor++, 192 | c >> 6);
        v.setUint8(cursor++, 128 | c & 63);
      } else if (c < 65536) {
        v.setUint8(cursor++, 224 | c >> 12);
        v.setUint8(cursor++, 128 | c >> 6 & 63);
        v.setUint8(cursor++, 128 | c & 63);
      } else {
        v.setUint8(cursor++, 240 | c >> 18);
        v.setUint8(cursor++, 128 | c >> 12 & 63);
        v.setUint8(cursor++, 128 | c >> 6 & 63);
        v.setUint8(cursor++, 128 | c & 63);
      }
    }
  }
  function internString(s) {
    const existing = stringIds.get(s);
    if (existing !== void 0) return existing;
    const id = nextStringId++;
    stringIds.set(s, id);
    const len = utf8ByteLen(s);
    const padded = len + 3 & -4;
    ensureSpace(12 + padded);
    w32(CMD.NEW_STRING);
    w32(id);
    w32(len);
    writeUtf8(s);
    cursor = cursor + 3 & -4;
    return id;
  }
  function emitSetText(nodeId, stringId) {
    ensureSpace(12);
    w32(CMD.SET_TEXT);
    w32(nodeId);
    w32(stringId);
  }
  function flushCommands() {
    if (!view || cursor === 0) return;
    const g = globalThis;
    const len = cursor;
    cursor = 0;
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    g.__rayactFlushCommands(len);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    perfLogBatch(end - start, len >> 2);
  }
  const prof = {
    create: 0,
    append: 0,
    remove: 0,
    insert: 0,
    update: 0,
    calls: 0
  };
  const profNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  function profEnter() {
    return globalThis.__RAYACT_PROF ? profNow() : -1;
  }
  function profExit(key, start) {
    if (start >= 0) {
      prof[key] += profNow() - start;
      prof.calls++;
    }
  }
  function profFlush() {
    if (!globalThis.__RAYACT_PROF) return;
    console.log(`[prof] create=${prof.create.toFixed(1)} append=${prof.append.toFixed(1)} remove=${prof.remove.toFixed(1)} insert=${prof.insert.toFixed(1)} update=${prof.update.toFixed(1)} calls=${prof.calls}`);
    prof.create = prof.append = prof.remove = prof.insert = prof.update = 0;
    prof.calls = 0;
  }
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
    "onDragEnd",
    // TextInput (react-native parity). keyPress/contentSizeChange are accepted and
    // stripped from the payload but not yet fired by the host.
    "onSubmitEditing",
    "onEndEditing",
    "onSelectionChange",
    "onKeyPress",
    "onContentSizeChange"
  ];
  const eventPropSet = new Set(eventProps);
  function hasEventHandler(props) {
    for (const prop of eventProps) {
      if (typeof props[prop] === "function") return true;
    }
    return false;
  }
  const hostNodeTypes = /* @__PURE__ */ new Set(["root", "view", "text", "button", "image", "icon", "textInput", "scrollView", "modal", "externalView", "safeArea", "statusBar", "activityIndicator", "appBar", "badge", "banner", "bottomAppBar", "bottomSheet", "dataTable", "dockedToolbar", "floatingToolbar", "buttonGroup", "card", "carousel", "checkbox", "chip", "datePicker", "dialog", "divider", "extendedFab", "fab", "fabMenu", "iconButton", "list", "loadingIndicator", "menu", "menuItem", "navigationBar", "navigationBarItem", "navigationDrawer", "navigationRail", "progressIndicator", "radioButton", "rangeSlider", "search", "searchBar", "segmentedButton", "sideSheet", "slider", "snackbar", "splitButton", "switch", "tabs", "textField", "timePicker", "toolbar", "tooltip", "popover"]);
  const normalizeCache = /* @__PURE__ */ new Map();
  function normalizeType(type) {
    const key = String(type);
    const cached = normalizeCache.get(key);
    if (cached !== void 0) return cached;
    const raw = key.replace(/^rayact-/, "");
    const normalized = raw.toLowerCase().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!hostNodeTypes.has(normalized)) {
      throw new Error(`Unknown Rayact element type: ${type}`);
    }
    normalizeCache.set(key, normalized);
    return normalized;
  }
  function isText(instance) {
    return instance.kind === "text";
  }
  const sharedBinaryCreateProps = /* @__PURE__ */ new Set(["style", "children", "key", "ref", ...eventProps]);
  function hasOnlyProps(props, allowed) {
    for (const key in props) {
      if (!allowed.has(key)) return false;
    }
    return true;
  }
  const viewBinaryProps = sharedBinaryCreateProps;
  const buttonBinaryProps = /* @__PURE__ */ new Set([...sharedBinaryCreateProps, "label", "text", "title"]);
  const imageBinaryProps = /* @__PURE__ */ new Set([...sharedBinaryCreateProps, "source", "src"]);
  const iconBinaryProps = /* @__PURE__ */ new Set([...sharedBinaryCreateProps, "name", "icon", "size", "color", "variant", "filled"]);
  const textInputBinaryProps = /* @__PURE__ */ new Set([...sharedBinaryCreateProps, "value", "defaultValue"]);
  function primitiveString(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return void 0;
  }
  function labelFromProps(props) {
    return primitiveString(props.label) ?? primitiveString(props.text) ?? primitiveString(props.title) ?? primitiveString(props.children) ?? "";
  }
  function sourceFromProps(props) {
    return primitiveString(props.source) ?? primitiveString(props.src);
  }
  function iconNameFromProps(props) {
    return primitiveString(props.name) ?? primitiveString(props.icon);
  }
  function binaryTypeId(type) {
    switch (type) {
      case "view":
      case "root":
        return TYPE.VIEW;
      case "text":
        return TYPE.TEXT;
      case "button":
        return TYPE.BUTTON;
      case "image":
        return TYPE.IMAGE;
      case "icon":
        return TYPE.ICON;
      case "scrollView":
        return TYPE.SCROLL_VIEW;
      case "textInput":
        return TYPE.TEXT_INPUT;
      case "safeArea":
        return TYPE.SAFE_AREA;
      case "statusBar":
        return TYPE.STATUS_BAR;
      default:
        return void 0;
    }
  }
  function getBridge(parent) {
    return parent.kind === "container" ? parent.bridge : getDefaultRuntime().bridge;
  }
  function textFromChildren(instance) {
    if (instance.type !== "text" && instance.type !== "button") return void 0;
    let text = "";
    for (const child of instance.children) {
      if (isText(child)) text += child.text;
    }
    return text || void 0;
  }
  function syncTextContent(instance) {
    const text = textFromChildren(instance);
    if (text === void 0) return;
    if (binaryEnabled() && (instance.type === "text" || instance.type === "button")) {
      emitSetText(instance.node.id, internString(text));
      return;
    }
    if (nativeFastPath.batch && (instance.type === "text" || instance.type === "button")) {
      enqueueMutation({
        op: "setText",
        nodeId: instance.node.id,
        text
      });
      return;
    }
    getDefaultRuntime().bridge.updateNode(instance.node, {
      children: text
    });
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
    if (prop === "onSubmitEditing") return "submitEditing";
    if (prop === "onEndEditing") return "endEditing";
    if (prop === "onSelectionChange") return "selectionChange";
    if (prop === "onKeyPress") return "keyPress";
    if (prop === "onContentSizeChange") return "contentSizeChange";
    if (prop === "onDragStart") return "dragStart";
    if (prop === "onDragMove") return "dragMove";
    if (prop === "onDragEnd") return "dragEnd";
    if (prop === "onLayout") return "layout";
    return "press";
  }
  function appendChild(parent, child) {
    const __p = profEnter();
    try {
      child.parent = parent;
      parent.children.push(child);
      if (isText(child)) {
        if (parent.kind === "instance") syncTextContent(parent);
        return;
      }
      const parentNode = parent.kind === "container" ? parent.rootNode : parent.node;
      if (binaryEnabled()) {
        emitAppend(parentNode.id, child.node.id);
        return;
      }
      if (nativeFastPath.batch) {
        enqueueMutation({
          op: "appendChild",
          parentId: parentNode.id,
          childId: child.node.id
        });
        return;
      }
      getBridge(parent).appendChild(parentNode, child.node);
    } finally {
      profExit("append", __p);
    }
  }
  function disposeSubtreeNative(instance) {
    for (const grandchild of instance.children) {
      if (isText(grandchild)) continue;
      disposeSubtreeNative(grandchild);
    }
    if (binaryEnabled()) {
      emitDispose(instance.node.id);
      perfIncDisposed();
      return;
    }
    if (nativeFastPath.batch) {
      enqueueMutation({
        op: "disposeNode",
        nodeId: instance.node.id
      });
      perfIncDisposed();
      return;
    }
    getDefaultRuntime().bridge.disposeNode(instance.node);
    perfIncDisposed();
  }
  function disposeSubtree(instance) {
    disposeSubtreeNative(instance);
  }
  function removeChild(parent, child) {
    const __p = profEnter();
    try {
      const index = parent.children.indexOf(child);
      if (index !== -1) parent.children.splice(index, 1);
      child.parent = void 0;
      if (isText(child)) {
        if (parent.kind === "instance") syncTextContent(parent);
        return;
      }
      const parentNode = parent.kind === "container" ? parent.rootNode : parent.node;
      if (binaryEnabled()) {
        emitRemove(parentNode.id, child.node.id);
      } else if (nativeFastPath.batch) {
        enqueueMutation({
          op: "removeChild",
          parentId: parentNode.id,
          childId: child.node.id
        });
      } else {
        getBridge(parent).removeChild(parentNode, child.node);
      }
      disposeSubtree(child);
    } finally {
      profExit("remove", __p);
    }
  }
  function insertBefore(parent, child, beforeChild) {
    const __p = profEnter();
    try {
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
      const parentNode = parent.kind === "container" ? parent.rootNode : parent.node;
      if (binaryEnabled()) {
        emitInsert(parentNode.id, child.node.id, beforeChild.node.id);
        return;
      }
      if (nativeFastPath.batch) {
        enqueueMutation({
          op: "insertBefore",
          parentId: parentNode.id,
          childId: child.node.id,
          beforeChildId: beforeChild.node.id
        });
        return;
      }
      getBridge(parent).insertBefore(parentNode, child.node, beforeChild.node);
    } finally {
      profExit("insert", __p);
    }
  }
  function styleValueEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!styleValueEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aObj = a;
    const bObj = b;
    let aCount = 0;
    for (const key in aObj) {
      const av = aObj[key];
      if (av === void 0) continue;
      aCount++;
      if (!styleValueEqual(av, bObj[key])) return false;
    }
    let bCount = 0;
    for (const key in bObj) {
      if (bObj[key] !== void 0) bCount++;
    }
    return aCount === bCount;
  }
  function diffProps(oldProps, newProps) {
    const payload = {};
    let changed = false;
    for (const key in newProps) {
      if (key === "children") continue;
      if (eventPropSet.has(key)) continue;
      if (key === "style") {
        if (!styleValueEqual(oldProps.style, newProps.style)) {
          payload.style = newProps.style;
          changed = true;
        }
        continue;
      }
      if (oldProps[key] !== newProps[key]) {
        payload[key] = newProps[key];
        changed = true;
      }
    }
    for (const key in oldProps) {
      if (key === "children" || key === "style" || eventPropSet.has(key)) continue;
      if (!(key in newProps)) {
        payload[key] = void 0;
        changed = true;
      }
    }
    if (oldProps.className !== newProps.className && !Object.prototype.hasOwnProperty.call(payload, "style") && newProps.style !== void 0) {
      payload.style = newProps.style;
      changed = true;
    }
    return changed || oldProps.children !== newProps.children ? payload : null;
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
  function tryCreateBinaryNode(normalizedType, props) {
    if (!binaryEnabled()) return null;
    if (hasEventHandler(props)) {
      perfIncBinaryCreateFallback(normalizedType, "event-handler");
      return null;
    }
    const typeId = binaryTypeId(normalizedType);
    if (typeId === void 0) {
      perfIncBinaryCreateFallback(normalizedType, "unsupported-type");
      return null;
    }
    const styleBytes = styleEncSize(props.style);
    if (styleBytes < 0) {
      perfIncBinaryCreateFallback(normalizedType, "unsupported-style");
      return null;
    }
    const id = allocNodeId();
    switch (normalizedType) {
      case "view":
      case "root":
      case "text": {
        if (!hasOnlyProps(props, viewBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        emitCreate(id, typeId, props.style, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      case "button": {
        if (!hasOnlyProps(props, buttonBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        emitCreateParam(id, typeId, internString(labelFromProps(props)), props.style, {}, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      case "image": {
        if (!hasOnlyProps(props, imageBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        const source = sourceFromProps(props);
        if (source === void 0) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-source");
          return null;
        }
        emitCreateParam(id, typeId, internString(source), props.style, {}, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      case "icon": {
        if (!hasOnlyProps(props, iconBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        const name = iconNameFromProps(props);
        if (name === void 0) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-name");
          return null;
        }
        let flags = 0;
        let size = 0;
        let color = 0;
        let variantId = 0;
        if (typeof props.size === "number") {
          flags |= CREATE_PARAM_HAS_SIZE;
          size = props.size;
        }
        if (typeof props.color === "number") {
          flags |= CREATE_PARAM_HAS_COLOR;
          color = props.color;
        } else if (props.color !== void 0) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-color");
          return null;
        }
        if (typeof props.variant === "string") {
          variantId = internString(props.variant);
        }
        if (typeof props.filled === "boolean") {
          flags |= CREATE_PARAM_HAS_FILLED;
          if (props.filled) flags |= CREATE_PARAM_FILLED;
        }
        emitCreateParam(id, typeId, internString(name), props.style, {
          flags,
          size,
          color,
          variantId
        }, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      case "scrollView":
      case "safeArea":
      case "statusBar": {
        if (!hasOnlyProps(props, viewBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        emitCreate(id, typeId, props.style, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      case "textInput": {
        if (!hasOnlyProps(props, textInputBinaryProps)) {
          perfIncBinaryCreateFallback(normalizedType, "unsupported-props");
          return null;
        }
        const value = primitiveString(props.value) ?? primitiveString(props.defaultValue) ?? "";
        emitCreateParam(id, typeId, internString(value), props.style, {}, styleBytes);
        return {
          id,
          type: normalizedType
        };
      }
      default:
        perfIncBinaryCreateFallback(normalizedType, "unhandled-type");
        return null;
    }
  }
  function createHostContainer() {
    const runtime = getDefaultRuntime();
    if (binaryEnabled()) {
      const id = allocNodeId();
      emitCreate(id, TYPE.VIEW, {
        flexGrow: 1
      });
      emitSetRoot(id);
      return {
        kind: "container",
        rootNode: {
          id,
          type: "root"
        },
        bridge: runtime.bridge,
        runtime,
        children: []
      };
    }
    const rootNode = runtime.bridge.createNode("root", {
      style: {
        flexGrow: 1
      }
    });
    if (nativeFastPath.batch) {
      enqueueMutation({
        op: "setRoot",
        nodeId: rootNode.id
      });
    } else {
      runtime.bridge.setRoot(rootNode);
    }
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
    prepareForCommit: () => {
      perfMarkCommitStart();
      return null;
    },
    resetAfterCommit: () => {
      flushCommands();
      flushMutations();
      perfMarkCommitEnd();
      profFlush();
    },
    shouldSetTextContent: () => false,
    clearContainer: (container) => {
      for (const child of [...container.children]) {
        removeChild(container, child);
      }
      return false;
    },
    createInstance(type, props) {
      const __p = profEnter();
      try {
        const normalizedType = normalizeType(type);
        const node = tryCreateBinaryNode(normalizedType, props) ?? createNodeFast(normalizedType, props) ?? getDefaultRuntime().bridge.createNode(normalizedType, props);
        perfIncCreated();
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
      } finally {
        profExit("create", __p);
      }
    },
    createTextInstance(text) {
      return {
        kind: "text",
        text
      };
    },
    appendInitialChild(parent, child) {
      appendChild(parent, child);
    },
    finalizeInitialChildren: () => false,
    resetTextContent: (instance) => {
      if (instance.type === "text" || instance.type === "button") {
        getDefaultRuntime().bridge.updateNode(instance.node, {
          children: ""
        });
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
      const __p = profEnter();
      try {
        instance.props = newProps;
        const payload = diffProps(oldProps, newProps);
        if (payload) {
          const handled = nativeFastPath.updateNode ? updateNodeFast(instance.node.id, instance.type, oldProps, newProps) : false;
          if (!handled) {
            getDefaultRuntime().bridge.updateNode(instance.node, payload);
          }
        }
        perfIncUpdated();
        updateEvents(instance, oldProps, newProps);
        syncTextContent(instance);
        if (oldProps.style !== newProps.style) {
          scanAndBindSharedValues(instance.node.id, newProps.style);
        }
      } finally {
        profExit("update", __p);
      }
    },
    commitTextUpdate(textInstance, _oldText, newText) {
      textInstance.text = newText;
      if (textInstance.parent?.kind === "instance") {
        syncTextContent(textInstance.parent);
      }
    },
    commitMount: () => {
    },
    hideInstance: (instance) => {
      if (nativeFastPath.batch) {
        enqueueMutation({
          op: "setStyle",
          nodeId: instance.node.id,
          style: {
            display: "none"
          }
        });
        return;
      }
      getDefaultRuntime().bridge.updateNode(instance.node, {
        display: "none"
      });
    },
    hideTextInstance: () => {
    },
    unhideInstance: (instance, props) => {
      if (nativeFastPath.batch && props.style) {
        enqueueMutation({
          op: "setStyle",
          nodeId: instance.node.id,
          style: props.style
        });
        return;
      }
      getDefaultRuntime().bridge.updateNode(instance.node, props);
    },
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
      rendererPackageName: "rayact/react",
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
  var compilerRuntime = { exports: {} };
  var reactCompilerRuntime_production = {};
  var hasRequiredReactCompilerRuntime_production;
  function requireReactCompilerRuntime_production() {
    if (hasRequiredReactCompilerRuntime_production) return reactCompilerRuntime_production;
    hasRequiredReactCompilerRuntime_production = 1;
    var ReactSharedInternals = requireReact().__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    reactCompilerRuntime_production.c = function(size) {
      return ReactSharedInternals.H.useMemoCache(size);
    };
    return reactCompilerRuntime_production;
  }
  var hasRequiredCompilerRuntime;
  function requireCompilerRuntime() {
    if (hasRequiredCompilerRuntime) return compilerRuntime.exports;
    hasRequiredCompilerRuntime = 1;
    {
      compilerRuntime.exports = requireReactCompilerRuntime_production();
    }
    return compilerRuntime.exports;
  }
  var compilerRuntimeExports = requireCompilerRuntime();
  const COLOR_ROLES = ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer", "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer", "error", "onError", "errorContainer", "onErrorContainer", "surface", "onSurface", "surfaceVariant", "onSurfaceVariant", "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest", "outline", "outlineVariant", "shadow", "scrim", "inverseSurface", "inverseOnSurface", "inversePrimary"];
  function pack(r, g, b, a = 255) {
    return (r << 24 | g << 16 | b << 8 | a) >>> 0;
  }
  function buildTheme(dark, colors) {
    const theme = {
      dark
    };
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
    const theme = {
      dark: scheme.isDark
    };
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
    const result = {
      ...to,
      dark: t >= 0.5 ? to.dark : from.dark
    };
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
    return React.createElement(ThemeContext.Provider, {
      value: theme
    }, children);
  }
  function useTheme() {
    return React.useContext(ThemeContext);
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
    const {
      duration = 300,
      easing = easeInOutCubic,
      onSettled,
      from
    } = options;
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
  function RayactThemeProvider(t0) {
    const $ = compilerRuntimeExports.c(18);
    const {
      children
    } = t0;
    const isDark2 = useColorScheme();
    let t1;
    if ($[0] !== isDark2) {
      t1 = getNativeTheme(isDark2);
      $[0] = isDark2;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    const targetTheme = t1;
    const stableThemeRef = reactExports.useRef(targetTheme);
    const [blend, setBlend] = reactExports.useState(null);
    const t2 = blend ? 350 : 0;
    let t3;
    if ($[2] !== t2) {
      t3 = {
        duration: t2
      };
      $[2] = t2;
      $[3] = t3;
    } else {
      t3 = $[3];
    }
    const progress = useAnimatedValue(blend ? 1 : 0, t3);
    let t4;
    let t5;
    if ($[4] !== targetTheme) {
      t4 = () => {
        if (stableThemeRef.current.dark === targetTheme.dark) {
          stableThemeRef.current = targetTheme;
          return;
        }
        setBlend({
          from: stableThemeRef.current,
          to: targetTheme
        });
      };
      t5 = [targetTheme];
      $[4] = targetTheme;
      $[5] = t4;
      $[6] = t5;
    } else {
      t4 = $[5];
      t5 = $[6];
    }
    reactExports.useEffect(t4, t5);
    let t6;
    let t7;
    if ($[7] !== blend || $[8] !== progress) {
      t6 = () => {
        if (!blend || progress < 1) {
          return;
        }
        stableThemeRef.current = blend.to;
        setBlend(null);
      };
      t7 = [blend, progress];
      $[7] = blend;
      $[8] = progress;
      $[9] = t6;
      $[10] = t7;
    } else {
      t6 = $[9];
      t7 = $[10];
    }
    reactExports.useEffect(t6, t7);
    let t8;
    bb0: {
      if (!blend) {
        t8 = targetTheme;
        break bb0;
      }
      let t92;
      if ($[11] !== blend.from || $[12] !== blend.to || $[13] !== progress) {
        t92 = lerpTheme(blend.from, blend.to, progress);
        $[11] = blend.from;
        $[12] = blend.to;
        $[13] = progress;
        $[14] = t92;
      } else {
        t92 = $[14];
      }
      t8 = t92;
    }
    const displayTheme = t8;
    let t9;
    if ($[15] !== children || $[16] !== displayTheme) {
      t9 = /* @__PURE__ */ jsxRuntimeExports.jsx(ThemeProvider, { theme: displayTheme, children });
      $[15] = children;
      $[16] = displayTheme;
      $[17] = t9;
    } else {
      t9 = $[17];
    }
    return t9;
  }
  const defaultKeyboard = {
    visible: false,
    height: 0,
    duration: 250
  };
  const defaultSafeArea = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
  let cachedKeyboard = defaultKeyboard;
  let cachedSafeArea = defaultSafeArea;
  const insetsListeners = /* @__PURE__ */ new Set();
  let listenerInstalled = false;
  function readKeyboardRaw() {
    const globalObj2 = globalThis;
    const snapshot = globalObj2.__rayactKeyboardInsets;
    if (!snapshot) return defaultKeyboard;
    return {
      visible: !!snapshot.visible,
      height: typeof snapshot.height === "number" ? snapshot.height : 0,
      duration: typeof snapshot.duration === "number" ? snapshot.duration : 250
    };
  }
  function readSafeAreaRaw() {
    const globalObj2 = globalThis;
    const snapshot = globalObj2.__rayactSafeAreaInsets;
    if (!snapshot) return defaultSafeArea;
    return {
      top: typeof snapshot.top === "number" ? snapshot.top : 0,
      right: typeof snapshot.right === "number" ? snapshot.right : 0,
      bottom: typeof snapshot.bottom === "number" ? snapshot.bottom : 0,
      left: typeof snapshot.left === "number" ? snapshot.left : 0
    };
  }
  function sameKeyboard(a, b) {
    return a.visible === b.visible && a.height === b.height && a.duration === b.duration;
  }
  function sameSafeArea(a, b) {
    return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
  }
  function getKeyboardSnapshot() {
    const next = readKeyboardRaw();
    if (sameKeyboard(next, cachedKeyboard)) return cachedKeyboard;
    cachedKeyboard = next;
    return cachedKeyboard;
  }
  function getSafeAreaSnapshot() {
    const next = readSafeAreaRaw();
    if (sameSafeArea(next, cachedSafeArea)) return cachedSafeArea;
    cachedSafeArea = next;
    return cachedSafeArea;
  }
  function getServerSafeAreaSnapshot() {
    return defaultSafeArea;
  }
  function ensureInsetsListener() {
    if (listenerInstalled) return;
    listenerInstalled = true;
    const globalObj2 = globalThis;
    globalObj2.__rayactOnKeyboardInsetsChange = () => {
      getKeyboardSnapshot();
      getSafeAreaSnapshot();
      for (const listener of insetsListeners) listener();
    };
  }
  function subscribeInsets(listener) {
    ensureInsetsListener();
    insetsListeners.add(listener);
    return () => insetsListeners.delete(listener);
  }
  function useSafeAreaInsets() {
    return reactExports.useSyncExternalStore(subscribeInsets, getSafeAreaSnapshot, getServerSafeAreaSnapshot);
  }
  function asStyleObject(style) {
    if (!style) return {};
    if (Array.isArray(style)) {
      return style.reduce((acc, item) => ({
        ...acc,
        ...asStyleObject(item)
      }), {});
    }
    return {
      ...style
    };
  }
  const View = React.forwardRef((props, ref) => {
    return React.createElement("rayact-view", {
      ...props,
      ref
    });
  });
  function Text(props) {
    return React.createElement("rayact-text", props);
  }
  function Button(props) {
    return React.createElement("rayact-button", props);
  }
  function Icon(props) {
    return React.createElement("rayact-icon", props);
  }
  function inputTypeFromKeyboardType(keyboardType, multiline, secure) {
    if (secure) return "password";
    if (multiline) return "multiline";
    switch (keyboardType) {
      case "email-address":
        return "email";
      case "numeric":
      case "number-pad":
      case "decimal-pad":
        return "number";
      case "phone-pad":
        return "phone";
      case "url":
        return "url";
      default:
        return "text";
    }
  }
  function TextInput(props) {
    const {
      // RN names mapped onto wire props:
      keyboardType,
      returnKeyType,
      autoCorrect,
      secureTextEntry,
      editable,
      multiline,
      // passthrough / renamed below:
      selection,
      ...rest
    } = props;
    const wire = {
      ...rest,
      inputType: inputTypeFromKeyboardType(keyboardType, multiline, secureTextEntry),
      imeAction: returnKeyType && returnKeyType !== "default" ? returnKeyType : "done",
      secure: !!secureTextEntry,
      secureTextEntry: !!secureTextEntry,
      autocorrect: autoCorrect !== false,
      readOnly: editable === false,
      multiline: !!multiline,
      // blurOnSubmit defaults to single-line behaviour (RN parity).
      blurOnSubmit: props.blurOnSubmit ?? !multiline
    };
    if (selection) {
      wire.selectionStart = selection.start;
      wire.selectionEnd = selection.end ?? selection.start;
    }
    return React.createElement("rayact-text-input", wire);
  }
  function ScrollView(props) {
    return React.createElement("rayact-scroll-view", props);
  }
  function createMaterialComponent(tag) {
    return function MaterialComponent(props) {
      return React.createElement(tag, props);
    };
  }
  const NAVIGATION_BAR_HEIGHT = 80;
  function NavigationBar(props) {
    const $ = compilerRuntimeExports.c(28);
    let extendBottomPaddingToNavigationBar;
    let ignoreSafeAreaView;
    let rest;
    let style;
    if ($[0] !== props) {
      ({
        extendBottomPaddingToNavigationBar,
        ignoreSafeAreaView,
        style,
        ...rest
      } = props);
      $[0] = props;
      $[1] = extendBottomPaddingToNavigationBar;
      $[2] = ignoreSafeAreaView;
      $[3] = rest;
      $[4] = style;
    } else {
      extendBottomPaddingToNavigationBar = $[1];
      ignoreSafeAreaView = $[2];
      rest = $[3];
      style = $[4];
    }
    const extend = ignoreSafeAreaView || extendBottomPaddingToNavigationBar;
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    if (!extend) {
      let t02;
      if ($[5] !== rest || $[6] !== style) {
        t02 = React.createElement("rayact-navigation-bar", {
          ...rest,
          style
        });
        $[5] = rest;
        $[6] = style;
        $[7] = t02;
      } else {
        t02 = $[7];
      }
      return t02;
    }
    const bottomInset = Math.max(0, insets.bottom);
    const leftInset = Math.max(0, insets.left);
    const rightInset = Math.max(0, insets.right);
    let t0;
    if ($[8] !== style || $[9] !== theme) {
      t0 = asStyleObject(style).backgroundColor ?? theme.surfaceContainer;
      $[8] = style;
      $[9] = theme;
      $[10] = t0;
    } else {
      t0 = $[10];
    }
    const backgroundColor = t0;
    const t1 = NAVIGATION_BAR_HEIGHT + bottomInset;
    const t2 = NAVIGATION_BAR_HEIGHT + bottomInset;
    let t3;
    if ($[11] !== backgroundColor || $[12] !== bottomInset || $[13] !== leftInset || $[14] !== rightInset || $[15] !== t1 || $[16] !== t2) {
      t3 = {
        height: t1,
        minHeight: t2,
        paddingBottom: bottomInset,
        paddingLeft: leftInset,
        paddingRight: rightInset,
        backgroundColor
      };
      $[11] = backgroundColor;
      $[12] = bottomInset;
      $[13] = leftInset;
      $[14] = rightInset;
      $[15] = t1;
      $[16] = t2;
      $[17] = t3;
    } else {
      t3 = $[17];
    }
    const barStyle = t3;
    let t4;
    if ($[18] !== barStyle || $[19] !== rest || $[20] !== style) {
      let t5;
      if ($[22] !== barStyle || $[23] !== style) {
        t5 = [style, barStyle];
        $[22] = barStyle;
        $[23] = style;
        $[24] = t5;
      } else {
        t5 = $[24];
      }
      let t6;
      if ($[25] !== rest || $[26] !== t5) {
        t6 = {
          ...rest,
          style: t5
        };
        $[25] = rest;
        $[26] = t5;
        $[27] = t6;
      } else {
        t6 = $[27];
      }
      t4 = React.createElement("rayact-navigation-bar", t6);
      $[18] = barStyle;
      $[19] = rest;
      $[20] = style;
      $[21] = t4;
    } else {
      t4 = $[21];
    }
    return t4;
  }
  const NavigationBarItem = createMaterialComponent("rayact-navigation-bar-item");
  const globalObj = globalThis;
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
  function withTiming(target, duration = 300) {
    return {
      type: "timing",
      target,
      duration
    };
  }
  class SharedValue {
    constructor(initialValue) {
      this.nodeId = null;
      this.propertyOffset = -1;
      this.index = -1;
      this.dirtyIndex = -1;
      this.fallbackFrameId = null;
      this.initialValue = initialValue;
    }
    // Automatically called by the reconciler when styles are parsed
    bindToNode(nodeId, property) {
      const propOffset = OFFSETS[property];
      if (propOffset !== void 0) {
        this.nodeId = nodeId;
        this.propertyOffset = propOffset;
        this.index = nodeId * SLAB_SIZE + propOffset;
        this.dirtyIndex = nodeId * SLAB_SIZE + OFFSETS.dirty;
        const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
        if (buffer && !sharedFloatArray) {
          sharedFloatArray = new Float32Array(buffer);
        }
        if (sharedFloatArray) {
          sharedFloatArray[this.index] = this.initialValue;
          sharedFloatArray[this.dirtyIndex] = 1;
        }
        if (typeof globalObj.__rayactRegisterAnimatedNode === "function") {
          globalObj.__rayactRegisterAnimatedNode(nodeId, {
            [property]: this.initialValue
          });
        }
      }
    }
    get value() {
      const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray) {
        sharedFloatArray = new Float32Array(buffer);
      }
      return this.index !== -1 && sharedFloatArray ? sharedFloatArray[this.index] : this.initialValue;
    }
    set value(newValue) {
      const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray) {
        sharedFloatArray = new Float32Array(buffer);
      }
      if (typeof newValue === "number") {
        if (this.fallbackFrameId !== null) {
          cancelAnimationFrame(this.fallbackFrameId);
          this.fallbackFrameId = null;
        }
        this.initialValue = newValue;
        if (this.index !== -1 && sharedFloatArray) {
          sharedFloatArray[this.index] = newValue;
          sharedFloatArray[this.dirtyIndex] = 1;
        }
        if (this.nodeId !== null && this.propertyOffset !== -1 && typeof globalObj.__rayactSetAnimatedStyle === "function") {
          globalObj.__rayactSetAnimatedStyle(this.nodeId, {
            [this.propertyName()]: newValue
          });
        }
      } else {
        if (this.index !== -1) {
          if (this.nodeId !== null && this.propertyOffset !== -1 && typeof globalObj.__rayactStartStyleAnimation === "function") {
            globalObj.__rayactStartStyleAnimation(this.nodeId, {
              [this.propertyName()]: newValue.target
            }, newValue);
          } else {
            this.runFallbackAnimation(newValue);
          }
        } else {
          this.initialValue = newValue.target;
        }
      }
    }
    runFallbackAnimation(config) {
      if (this.fallbackFrameId !== null) {
        cancelAnimationFrame(this.fallbackFrameId);
      }
      const start = performance.now();
      const fromVal = this.value;
      const diff = config.target - fromVal;
      const step = (timestamp) => {
        const elapsed = timestamp - start;
        const t = config.duration <= 0 ? 1 : Math.min(1, elapsed / config.duration);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const val = fromVal + diff * eased;
        const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
        if (buffer && !sharedFloatArray) {
          sharedFloatArray = new Float32Array(buffer);
        }
        if (this.index !== -1 && sharedFloatArray) {
          sharedFloatArray[this.index] = val;
          sharedFloatArray[this.dirtyIndex] = 1;
        } else {
          this.initialValue = val;
        }
        if (t < 1) {
          this.fallbackFrameId = requestAnimationFrame(step);
        } else {
          if (this.index !== -1 && sharedFloatArray) {
            sharedFloatArray[this.index] = config.target;
            sharedFloatArray[this.dirtyIndex] = 1;
          } else {
            this.initialValue = config.target;
          }
          this.fallbackFrameId = null;
        }
      };
      this.fallbackFrameId = requestAnimationFrame(step);
    }
    propertyName() {
      switch (this.propertyOffset) {
        case OFFSETS.translateX:
          return "translateX";
        case OFFSETS.translateY:
          return "translateY";
        case OFFSETS.scale:
          return "scale";
        case OFFSETS.opacity:
          return "opacity";
        case OFFSETS.rotation:
          return "rotation";
        default:
          return "opacity";
      }
    }
  }
  function useSharedValue(initialValue) {
    return React.useMemo(() => new SharedValue(initialValue), []);
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
    return RayactReconciler.createContainer(container, ReconcilerRootTag.LegacyRoot, null, false, null, "", getDefaultRuntime().reportError, getDefaultRuntime().reportError, getDefaultRuntime().reportError, null);
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
    const alreadyMounted = !!globalThis.__rayactReactRoot;
    if (globalThis.__RAYACT_HMR_ACTIVE__ && alreadyMounted) {
      return getOrCreateRoot();
    }
    const root = getOrCreateRoot();
    root.render(React.createElement(RayactThemeProvider, null, element));
    return root;
  }
  globalThis.Icons = {
    "10k": 59729,
    "10mp": 59730,
    "11mp": 59731,
    "123": 60301,
    "12mp": 59732,
    "13mp": 59733,
    "14mp": 59734,
    "15mp": 59735,
    "16mp": 59736,
    "17mp": 59737,
    "18_up_rating": 63741,
    "18mp": 59738,
    "19mp": 59739,
    "1k": 59740,
    "1k_plus": 59741,
    "1x_mobiledata": 61389,
    "1x_mobiledata_badge": 63473,
    "20mp": 59742,
    "21mp": 59743,
    "22mp": 59744,
    "23mp": 59745,
    "24fps_select": 62450,
    "24mp": 59746,
    "2d": 61239,
    "2d_2": 1048334,
    "2k": 59747,
    "2k_plus": 59748,
    "2mp": 59749,
    "30fps": 61390,
    "30fps_select": 61391,
    "360": 58743,
    "3d": 60728,
    "3d_2": 1048335,
    "3d_rotation": 59469,
    "3g_mobiledata": 61392,
    "3g_mobiledata_badge": 63472,
    "3k": 59750,
    "3k_plus": 59751,
    "3mp": 59752,
    "3p": 61393,
    "4g_mobiledata": 61394,
    "4g_mobiledata_badge": 63471,
    "4g_plus_mobiledata": 61395,
    "4k": 57458,
    "4k_plus": 59753,
    "4mp": 59754,
    "50mp": 63219,
    "5g": 61240,
    "5g_mobiledata_badge": 63470,
    "5k": 59755,
    "5k_plus": 59756,
    "5mp": 59757,
    "60fps": 61396,
    "60fps_select": 61397,
    "6_ft_apart": 61982,
    "6k": 59758,
    "6k_plus": 59759,
    "6mp": 59760,
    "7k": 59761,
    "7k_plus": 59762,
    "7mp": 59763,
    "8k": 59764,
    "8k_plus": 59765,
    "8mp": 59766,
    "9k": 59767,
    "9k_plus": 59768,
    "9mp": 59769,
    "abc": 60308,
    "ac_unit": 60219,
    "access_alarm": 59477,
    "access_alarms": 59477,
    "access_time": 61398,
    "access_time_filled": 61398,
    "accessibility": 59470,
    "accessibility_new": 59692,
    "accessible": 59668,
    "accessible_forward": 59700,
    "accessible_menu": 62286,
    "account_balance": 59471,
    "account_balance_wallet": 59472,
    "account_box": 59473,
    "account_child": 59474,
    "account_child_invert": 58969,
    "account_circle": 61963,
    "account_circle_filled": 61963,
    "account_circle_off": 63411,
    "account_tree": 59770,
    "action_key": 62722,
    "activity_zone": 57830,
    "acupuncture": 62148,
    "acute": 58571,
    "ad": 58970,
    "ad_group": 58971,
    "ad_group_off": 60133,
    "ad_off": 63410,
    "ad_units": 62187,
    "adaptive_audio_mic": 62668,
    "adaptive_audio_mic_off": 62667,
    "adb": 58894,
    "add": 57669,
    "add_2": 62429,
    "add_a_photo": 58425,
    "add_ad": 59178,
    "add_alarm": 59478,
    "add_alert": 57347,
    "add_box": 57670,
    "add_business": 59177,
    "add_call": 61623,
    "add_card": 60294,
    "add_chart": 61244,
    "add_circle": 58298,
    "add_circle_outline": 58298,
    "add_column_left": 62501,
    "add_column_right": 62500,
    "add_comment": 57958,
    "add_diamond": 62620,
    "add_home": 63723,
    "add_home_work": 63725,
    "add_ic_call": 61623,
    "add_link": 57720,
    "add_location": 58727,
    "add_location_alt": 61242,
    "add_moderator": 59773,
    "add_notes": 57489,
    "add_photo_alternate": 58430,
    "add_reaction": 57811,
    "add_road": 61243,
    "add_row_above": 62499,
    "add_row_below": 62498,
    "add_shopping_cart": 59476,
    "add_task": 62010,
    "add_to_drive": 58972,
    "add_to_home_screen": 62137,
    "add_to_photos": 58269,
    "add_to_queue": 57436,
    "add_triangle": 62606,
    "addchart": 61244,
    "adf_scanner": 60122,
    "adjust": 58270,
    "admin_meds": 58509,
    "admin_panel_settings": 61245,
    "ads_click": 59234,
    "agender": 63624,
    "agriculture": 60025,
    "air": 61400,
    "air_freshener": 58058,
    "air_purifier": 59774,
    "air_purifier_gen": 59433,
    "airline_seat_flat": 58928,
    "airline_seat_flat_angled": 58929,
    "airline_seat_individual_suite": 58930,
    "airline_seat_legroom_extra": 58931,
    "airline_seat_legroom_normal": 58932,
    "airline_seat_legroom_reduced": 58933,
    "airline_seat_recline_extra": 58934,
    "airline_seat_recline_normal": 58935,
    "airline_stops": 59344,
    "airlines": 59338,
    "airplane_ticket": 61401,
    "airplanemode_active": 58685,
    "airplanemode_inactive": 57748,
    "airplay": 57429,
    "airport_shuttle": 60220,
    "airware": 61780,
    "airwave": 61780,
    "alarm": 59477,
    "alarm_add": 59478,
    "alarm_off": 59479,
    "alarm_on": 59480,
    "alarm_pause": 62299,
    "alarm_smart_wake": 63152,
    "album": 57369,
    "align_center": 58198,
    "align_end": 63383,
    "align_flex_center": 63382,
    "align_flex_end": 63381,
    "align_flex_start": 63380,
    "align_horizontal_center": 57359,
    "align_horizontal_left": 57357,
    "align_horizontal_right": 57360,
    "align_items_stretch": 63379,
    "align_justify_center": 63378,
    "align_justify_flex_end": 63377,
    "align_justify_flex_start": 63376,
    "align_justify_space_around": 63375,
    "align_justify_space_between": 63374,
    "align_justify_space_even": 63373,
    "align_justify_stretch": 63372,
    "align_self_stretch": 63371,
    "align_space_around": 63370,
    "align_space_between": 63369,
    "align_space_even": 63368,
    "align_start": 63367,
    "align_stretch": 63366,
    "align_vertical_bottom": 57365,
    "align_vertical_center": 57361,
    "align_vertical_top": 57356,
    "all_inbox": 59775,
    "all_inclusive": 60221,
    "all_match": 57491,
    "all_out": 59659,
    "allergies": 57492,
    "allergy": 58958,
    "alt_route": 61828,
    "alternate_email": 57574,
    "altitude": 63603,
    "ambient_screen": 63172,
    "ambulance": 63491,
    "amend": 63490,
    "amp_stories": 59923,
    "analytics": 61246,
    "anchor": 61901,
    "android": 59481,
    "android_cell_4_bar": 61190,
    "android_cell_4_bar_alert": 61193,
    "android_cell_4_bar_off": 61192,
    "android_cell_4_bar_plus": 61191,
    "android_cell_5_bar": 61186,
    "android_cell_5_bar_alert": 61189,
    "android_cell_5_bar_off": 61188,
    "android_cell_5_bar_plus": 61187,
    "android_cell_dual_4_bar": 61197,
    "android_cell_dual_4_bar_alert": 61199,
    "android_cell_dual_4_bar_plus": 61198,
    "android_cell_dual_5_bar": 61194,
    "android_cell_dual_5_bar_alert": 61196,
    "android_cell_dual_5_bar_plus": 61195,
    "android_wifi_3_bar": 61206,
    "android_wifi_3_bar_alert": 61211,
    "android_wifi_3_bar_lock": 61210,
    "android_wifi_3_bar_off": 61209,
    "android_wifi_3_bar_plus": 61208,
    "android_wifi_3_bar_question": 61207,
    "android_wifi_4_bar": 61200,
    "android_wifi_4_bar_alert": 61205,
    "android_wifi_4_bar_lock": 61204,
    "android_wifi_4_bar_off": 61203,
    "android_wifi_4_bar_plus": 61202,
    "android_wifi_4_bar_question": 61201,
    "animated_images": 62618,
    "animation": 59164,
    "announcement": 59519,
    "antigravity": 1048530,
    "aod": 62182,
    "aod_tablet": 63647,
    "aod_watch": 63148,
    "apartment": 59968,
    "api": 61879,
    "apk_document": 63630,
    "apk_install": 63631,
    "app_badging": 63279,
    "app_blocking": 62181,
    "app_promo": 62157,
    "app_registration": 61248,
    "app_settings_alt": 62169,
    "app_shortcut": 62175,
    "apparel": 61307,
    "approval": 59778,
    "approval_delegation": 63562,
    "approval_delegation_off": 62149,
    "apps": 58819,
    "apps_outage": 59340,
    "aq": 62810,
    "aq_indoor": 62811,
    "ar_on_you": 61308,
    "ar_stickers": 59779,
    "architecture": 59963,
    "archive": 57673,
    "area_chart": 59248,
    "arming_countdown": 59274,
    "arrow_and_edge": 62935,
    "arrow_back": 58820,
    "arrow_back_2": 62522,
    "arrow_back_ios": 58848,
    "arrow_back_ios_new": 58090,
    "arrow_circle_down": 61825,
    "arrow_circle_left": 60071,
    "arrow_circle_right": 60074,
    "arrow_circle_up": 61826,
    "arrow_cool_down": 62646,
    "arrow_downward": 58843,
    "arrow_downward_alt": 59780,
    "arrow_drop_down": 58821,
    "arrow_drop_down_circle": 58822,
    "arrow_drop_up": 58823,
    "arrow_forward": 58824,
    "arrow_forward_ios": 58849,
    "arrow_insert": 63543,
    "arrow_left": 58846,
    "arrow_left_alt": 61309,
    "arrow_menu_close": 62419,
    "arrow_menu_open": 62418,
    "arrow_or_edge": 62934,
    "arrow_outward": 63694,
    "arrow_range": 63131,
    "arrow_right": 58847,
    "arrow_right_alt": 59713,
    "arrow_selector_tool": 63535,
    "arrow_shape_up": 61174,
    "arrow_shape_up_stack": 61175,
    "arrow_shape_up_stack_2": 61176,
    "arrow_split": 59908,
    "arrow_top_left": 63278,
    "arrow_top_right": 63277,
    "arrow_upload_progress": 62452,
    "arrow_upload_ready": 62453,
    "arrow_upward": 58840,
    "arrow_upward_alt": 59782,
    "arrow_warm_up": 62645,
    "arrows_input": 62356,
    "arrows_left_right_circle": 61156,
    "arrows_more_down": 63659,
    "arrows_more_up": 63660,
    "arrows_output": 62355,
    "arrows_outward": 63276,
    "arrows_up_down_circle": 61155,
    "art_track": 57440,
    "article": 61250,
    "article_person": 62312,
    "article_shortcut": 62855,
    "artist": 57370,
    "aspect_ratio": 59483,
    "assessment": 61644,
    "assignment": 59485,
    "assignment_add": 63560,
    "assignment_globe": 61164,
    "assignment_ind": 59486,
    "assignment_late": 59487,
    "assignment_return": 59488,
    "assignment_returned": 59489,
    "assignment_turned_in": 59490,
    "assist_walker": 63701,
    "assistant": 58271,
    "assistant_device": 59783,
    "assistant_direction": 59784,
    "assistant_navigation": 59785,
    "assistant_on_hub": 63169,
    "assistant_photo": 61638,
    "assured_workload": 60271,
    "asterisk": 62757,
    "astrophotography_auto": 61913,
    "astrophotography_off": 61914,
    "atm": 58739,
    "atr": 60359,
    "attach_email": 59998,
    "attach_file": 57894,
    "attach_file_add": 63553,
    "attach_file_off": 62681,
    "attach_money": 57895,
    "attachment": 58044,
    "attractions": 59986,
    "attribution": 61403,
    "audio_capture": 1048323,
    "audio_description": 62860,
    "audio_file": 60290,
    "audio_video_receiver": 62931,
    "audiotrack": 58373,
    "auto_activity_zone": 63661,
    "auto_awesome": 58975,
    "auto_awesome_mosaic": 58976,
    "auto_awesome_motion": 58977,
    "auto_delete": 59980,
    "auto_detect_voice": 63550,
    "auto_draw_solid": 59786,
    "auto_fix": 58979,
    "auto_fix_high": 58979,
    "auto_fix_normal": 58980,
    "auto_fix_off": 58981,
    "auto_graph": 58619,
    "auto_label": 63166,
    "auto_meeting_room": 63167,
    "auto_mode": 60448,
    "auto_read_pause": 61977,
    "auto_read_play": 61974,
    "auto_schedule": 57876,
    "auto_stories": 58982,
    "auto_stories_off": 62055,
    "auto_timer": 61311,
    "auto_towing": 59166,
    "auto_transmission": 62783,
    "auto_videocam": 63168,
    "autofps_select": 61404,
    "automation": 62497,
    "autopause": 63158,
    "autopay": 63563,
    "autoplay": 63157,
    "autorenew": 59491,
    "autostop": 63106,
    "av1": 62640,
    "av_timer": 57371,
    "avc": 62639,
    "avg_pace": 63163,
    "avg_time": 63507,
    "avocado_bean": 1048487,
    "award_meal": 62017,
    "award_star": 62994,
    "azm": 63212,
    "b_circle": 61154,
    "baby_changing_station": 61851,
    "back_hand": 59236,
    "back_to_tab": 63275,
    "background_dot_large": 63390,
    "background_dot_small": 62740,
    "background_grid_small": 63389,
    "background_replace": 61962,
    "backlight_high": 63469,
    "backlight_high_off": 62703,
    "backlight_low": 63468,
    "backpack": 61852,
    "backspace": 57674,
    "backup": 59492,
    "backup_table": 61251,
    "badge": 60007,
    "badge_critical_battery": 61782,
    "badminton": 62120,
    "bakery_dining": 59987,
    "balance": 60150,
    "balcony": 58767,
    "ballot": 57714,
    "bar_chart": 57963,
    "bar_chart_4_bars": 63105,
    "bar_chart_off": 62481,
    "barcode": 59147,
    "barcode_reader": 63580,
    "barcode_scanner": 59148,
    "barefoot": 63601,
    "batch_prediction": 61685,
    "bath_bedrock": 62086,
    "bath_outdoor": 63227,
    "bath_private": 63226,
    "bath_public_large": 63225,
    "bath_soak": 62112,
    "bathroom": 61405,
    "bathtub": 59969,
    "battery_0_bar": 60380,
    "battery_1_bar": 61596,
    "battery_20": 61596,
    "battery_2_bar": 61597,
    "battery_30": 61597,
    "battery_3_bar": 61598,
    "battery_4_bar": 61599,
    "battery_50": 61598,
    "battery_5_bar": 61600,
    "battery_60": 61599,
    "battery_6_bar": 61601,
    "battery_80": 61600,
    "battery_90": 61601,
    "battery_alert": 57756,
    "battery_android_0": 62221,
    "battery_android_1": 62220,
    "battery_android_2": 62219,
    "battery_android_3": 62218,
    "battery_android_4": 62217,
    "battery_android_5": 62216,
    "battery_android_6": 62215,
    "battery_android_alert": 62214,
    "battery_android_bolt": 62213,
    "battery_android_frame_1": 62039,
    "battery_android_frame_2": 62038,
    "battery_android_frame_3": 62037,
    "battery_android_frame_4": 62036,
    "battery_android_frame_5": 62035,
    "battery_android_frame_6": 62034,
    "battery_android_frame_alert": 62033,
    "battery_android_frame_bolt": 62032,
    "battery_android_frame_full": 62031,
    "battery_android_frame_plus": 62030,
    "battery_android_frame_question": 62029,
    "battery_android_frame_share": 62028,
    "battery_android_frame_shield": 62027,
    "battery_android_full": 62212,
    "battery_android_plus": 62211,
    "battery_android_question": 62210,
    "battery_android_share": 62209,
    "battery_android_shield": 62208,
    "battery_change": 63467,
    "battery_charging_20": 61602,
    "battery_charging_20_2": 1048382,
    "battery_charging_30": 61603,
    "battery_charging_30_2": 1048381,
    "battery_charging_50": 61604,
    "battery_charging_50_2": 1048380,
    "battery_charging_60": 61605,
    "battery_charging_60_2": 1048379,
    "battery_charging_80": 61606,
    "battery_charging_80_2": 1048378,
    "battery_charging_90": 61607,
    "battery_charging_full": 57763,
    "battery_charging_full_2": 1048377,
    "battery_error": 63466,
    "battery_full": 57765,
    "battery_full_alt": 61755,
    "battery_horiz_000": 63662,
    "battery_horiz_050": 63663,
    "battery_horiz_075": 63664,
    "battery_low": 61781,
    "battery_plus": 63465,
    "battery_profile": 57862,
    "battery_saver": 61406,
    "battery_share": 63102,
    "battery_status_good": 63101,
    "battery_std": 57765,
    "battery_unknown": 57766,
    "battery_vert_005": 63665,
    "battery_vert_020": 63666,
    "battery_vert_050": 63667,
    "battery_very_low": 61782,
    "beach_access": 60222,
    "bed": 61407,
    "bedroom_baby": 61408,
    "bedroom_child": 61409,
    "bedroom_parent": 61410,
    "bedtime": 61785,
    "bedtime_off": 60278,
    "beenhere": 58669,
    "beer_meal": 62085,
    "bento": 61940,
    "bia": 63211,
    "bid_landscape": 59e3,
    "bid_landscape_disabled": 61313,
    "bigtop_updates": 58985,
    "bike_dock": 62587,
    "bike_lane": 62586,
    "bike_scooter": 61253,
    "biotech": 59962,
    "bitbucket": 1048343,
    "blanket": 59432,
    "blender": 61411,
    "blind": 63702,
    "blinds": 57990,
    "blinds_2": 1048440,
    "blinds_2_closed": 1048441,
    "blinds_closed": 60447,
    "block": 61580,
    "blood_pressure": 57495,
    "bloodtype": 61412,
    "bluetooth": 57767,
    "bluetooth_audio": 58895,
    "bluetooth_connected": 57768,
    "bluetooth_disabled": 57769,
    "bluetooth_drive": 61413,
    "bluetooth_searching": 58895,
    "blur_circular": 58274,
    "blur_linear": 58275,
    "blur_medium": 59468,
    "blur_off": 58276,
    "blur_on": 58277,
    "blur_short": 59599,
    "boat_bus": 62317,
    "boat_railway": 62316,
    "body_fat": 57496,
    "body_system": 57497,
    "bolt": 59915,
    "bolt_boost": 1048426,
    "bomb": 62824,
    "book": 59502,
    "book_2": 62782,
    "book_3": 62781,
    "book_4": 62780,
    "book_5": 62779,
    "book_6": 62431,
    "book_online": 62180,
    "book_ribbon": 62439,
    "bookmark": 59623,
    "bookmark_add": 58776,
    "bookmark_added": 58777,
    "bookmark_bag": 62480,
    "bookmark_border": 59623,
    "bookmark_check": 62551,
    "bookmark_flag": 62550,
    "bookmark_heart": 62549,
    "bookmark_manager": 63409,
    "bookmark_remove": 58778,
    "bookmark_stacks": 61160,
    "bookmark_star": 62548,
    "bookmarks": 59787,
    "books_movies_and_music": 61314,
    "border_all": 57896,
    "border_bottom": 57897,
    "border_clear": 57898,
    "border_color": 57899,
    "border_horizontal": 57900,
    "border_inner": 57901,
    "border_left": 57902,
    "border_outer": 57903,
    "border_right": 57904,
    "border_style": 57905,
    "border_top": 57906,
    "border_vertical": 57907,
    "borg": 62477,
    "bottom_app_bar": 59184,
    "bottom_drawer": 59181,
    "bottom_navigation": 59788,
    "bottom_panel_close": 63274,
    "bottom_panel_open": 63273,
    "bottom_right_click": 63108,
    "bottom_sheets": 59789,
    "box": 62884,
    "box_add": 62885,
    "box_edit": 62886,
    "boy": 60263,
    "brand_awareness": 59790,
    "brand_family": 62705,
    "branding_watermark": 57451,
    "breakfast_dining": 59988,
    "breaking_news": 59912,
    "breaking_news_alt_1": 61626,
    "breastfeeding": 63574,
    "brick": 62344,
    "briefcase_meal": 62022,
    "brightness_1": 58362,
    "brightness_2": 61494,
    "brightness_3": 58280,
    "brightness_4": 58281,
    "brightness_5": 58282,
    "brightness_6": 58283,
    "brightness_7": 58284,
    "brightness_alert": 62927,
    "brightness_auto": 57771,
    "brightness_empty": 63464,
    "brightness_high": 57772,
    "brightness_low": 57773,
    "brightness_medium": 57774,
    "bring_your_own_ip": 57366,
    "broadcast_on_home": 63736,
    "broadcast_on_personal": 63737,
    "broken_image": 58285,
    "browse": 60179,
    "browse_activity": 63653,
    "browse_gallery": 60369,
    "browser_not_supported": 61255,
    "browser_updated": 59343,
    "brunch_dining": 60019,
    "brush": 58286,
    "bubble": 61315,
    "bubble_chart": 59101,
    "bubbles": 63054,
    "bucket_check": 61226,
    "bug_report": 59496,
    "build": 63693,
    "build_circle": 61256,
    "bungalow": 58769,
    "burst_mode": 58428,
    "bus_alert": 59791,
    "bus_map_pin": 1048482,
    "bus_railway": 62315,
    "business": 59374,
    "business_center": 60223,
    "business_chip": 63564,
    "business_messages": 61316,
    "buttons_alt": 59183,
    "cabin": 58761,
    "cable": 61414,
    "cable_car": 62585,
    "cached": 59498,
    "cadence": 62644,
    "cake": 59369,
    "cake_add": 63579,
    "calculate": 59999,
    "calendar_add_on": 61317,
    "calendar_apps_script": 61627,
    "calendar_check": 62019,
    "calendar_clock": 62784,
    "calendar_lock": 62018,
    "calendar_meal": 62102,
    "calendar_meal_2": 62016,
    "calendar_month": 60364,
    "calendar_today": 59701,
    "calendar_view_day": 59702,
    "calendar_view_month": 61415,
    "calendar_view_week": 61416,
    "call": 61652,
    "call_end": 61628,
    "call_end_alt": 61628,
    "call_log": 57486,
    "call_made": 57522,
    "call_merge": 57523,
    "call_missed": 57524,
    "call_missed_outgoing": 57572,
    "call_quality": 63058,
    "call_received": 57525,
    "call_split": 57526,
    "call_to_action": 57452,
    "camera": 58287,
    "camera_alt": 58386,
    "camera_enhance": 59644,
    "camera_front": 62153,
    "camera_indoor": 61417,
    "camera_outdoor": 61418,
    "camera_rear": 62152,
    "camera_roll": 58291,
    "camera_video": 63398,
    "cameraswitch": 61419,
    "campaign": 61257,
    "camping": 63650,
    "cancel": 59528,
    "cancel_presentation": 57577,
    "cancel_schedule_send": 59961,
    "candle": 62856,
    "candlestick_chart": 60116,
    "cannabis": 62195,
    "captive_portal": 63272,
    "capture": 63271,
    "car_crash": 60402,
    "car_defrost_left": 62276,
    "car_defrost_low_left": 62275,
    "car_defrost_low_right": 62274,
    "car_defrost_mid_left": 62072,
    "car_defrost_mid_low_left": 62273,
    "car_defrost_mid_low_right": 62071,
    "car_defrost_mid_right": 62272,
    "car_defrost_right": 62271,
    "car_fan_low_left": 62270,
    "car_fan_low_mid_left": 62269,
    "car_fan_low_right": 62268,
    "car_fan_mid_left": 62267,
    "car_fan_mid_low_right": 62266,
    "car_fan_mid_right": 62265,
    "car_fan_recirculate": 62264,
    "car_fan_recirculate_2": 1048384,
    "car_gear": 62263,
    "car_lock": 62262,
    "car_mirror_heat": 62261,
    "car_rental": 59989,
    "car_repair": 59990,
    "car_tag": 62691,
    "card_giftcard": 59638,
    "card_membership": 59639,
    "card_travel": 59640,
    "cardio_load": 62649,
    "cardiology": 57500,
    "cards": 59793,
    "cards_stack": 62351,
    "cards_star": 62325,
    "carpenter": 61944,
    "carry_on_bag": 60168,
    "carry_on_bag_checked": 60171,
    "carry_on_bag_inactive": 60170,
    "carry_on_bag_question": 60169,
    "cases": 59794,
    "casino": 60224,
    "cast": 58119,
    "cast_connected": 58120,
    "cast_for_education": 61420,
    "cast_pause": 62960,
    "cast_warning": 62959,
    "castle": 60081,
    "category": 58740,
    "category_search": 62519,
    "celebration": 60005,
    "cell_merge": 63534,
    "cell_tower": 60346,
    "cell_wifi": 57580,
    "center_focus_strong": 58292,
    "center_focus_weak": 58293,
    "chair": 61421,
    "chair_alt": 61422,
    "chair_counter": 62111,
    "chair_fireplace": 62110,
    "chair_umbrella": 62109,
    "chalet": 58757,
    "change_circle": 58087,
    "change_history": 59499,
    "charger": 58030,
    "charging_station": 62179,
    "chart_data": 58483,
    "chat": 57545,
    "chat_add_on": 61683,
    "chat_apps_script": 61629,
    "chat_bubble": 57547,
    "chat_bubble_off": 1048507,
    "chat_bubble_outline": 57547,
    "chat_dashed": 61165,
    "chat_error": 63404,
    "chat_info": 62763,
    "chat_paste_go": 63165,
    "chat_paste_go_2": 62411,
    "check": 58826,
    "check_alert": 1048453,
    "check_box": 59444,
    "check_box_outline_blank": 59445,
    "check_circle": 61630,
    "check_circle_filled": 61630,
    "check_circle_outline": 61630,
    "check_circle_unread": 62078,
    "check_in_out": 63222,
    "check_indeterminate_small": 63626,
    "check_small": 63627,
    "checkbook": 59149,
    "checked_bag": 60172,
    "checked_bag_question": 60173,
    "checklist": 59057,
    "checklist_rtl": 59059,
    "checkroom": 61854,
    "cheer": 63144,
    "chef_hat": 62295,
    "chess": 62951,
    "chess_bishop": 62049,
    "chess_bishop_2": 62050,
    "chess_king": 62047,
    "chess_king_2": 62048,
    "chess_knight": 62046,
    "chess_pawn": 62390,
    "chess_pawn_2": 62045,
    "chess_queen": 62044,
    "chess_rook": 62043,
    "chevron_backward": 62571,
    "chevron_forward": 62570,
    "chevron_left": 58827,
    "chevron_line_up": 61123,
    "chevron_right": 58828,
    "child_care": 60225,
    "child_friendly": 60226,
    "child_hat": 61232,
    "chip_extraction": 63521,
    "chips": 59795,
    "chrome_reader_mode": 59501,
    "chromecast_2": 61819,
    "chromecast_device": 59452,
    "chronic": 60338,
    "church": 60078,
    "cinematic_blur": 63571,
    "circle": 61258,
    "circle_circle": 61153,
    "circle_notifications": 59796,
    "circles": 59370,
    "circles_ext": 59372,
    "clarify": 61631,
    "class": 59502,
    "clean_hands": 61983,
    "cleaning": 59797,
    "cleaning_bucket": 63668,
    "cleaning_services": 61695,
    "clear": 58829,
    "clear_all": 57528,
    "clear_day": 61783,
    "clear_night": 61785,
    "climate_mini_split": 63669,
    "clinical_notes": 57502,
    "clock_arrow_down": 62338,
    "clock_arrow_up": 62337,
    "clock_loader_10": 63270,
    "clock_loader_20": 63269,
    "clock_loader_40": 63268,
    "clock_loader_60": 63267,
    "clock_loader_80": 63266,
    "clock_loader_90": 63265,
    "close": 58829,
    "close_fullscreen": 61903,
    "close_small": 62728,
    "closed_caption": 59798,
    "closed_caption_add": 62638,
    "closed_caption_disabled": 61916,
    "closed_caption_off": 59798,
    "cloud": 61788,
    "cloud_alert": 62412,
    "cloud_circle": 58046,
    "cloud_done": 58047,
    "cloud_download": 58048,
    "cloud_lock": 62342,
    "cloud_off": 58049,
    "cloud_queue": 61788,
    "cloud_sync": 60250,
    "cloud_upload": 58051,
    "cloudy": 61788,
    "cloudy_filled": 61788,
    "cloudy_snowing": 59408,
    "co2": 59312,
    "co_present": 60144,
    "code": 59503,
    "code_blocks": 63565,
    "code_off": 58611,
    "code_xml": 1048459,
    "coffee": 61423,
    "coffee_maker": 61424,
    "cognition": 57503,
    "cognition_2": 62389,
    "collapse_all": 59716,
    "collapse_content": 62727,
    "collections": 58323,
    "collections_bookmark": 58417,
    "color_lens": 58378,
    "colorize": 58296,
    "colors": 59799,
    "combine_columns": 62496,
    "comedy_mask": 62678,
    "comic_bubble": 62941,
    "comment": 57932,
    "comment_bank": 59982,
    "comments_disabled": 59298,
    "commit": 60149,
    "communication": 57980,
    "communities": 60182,
    "communities_filled": 60182,
    "commute": 59712,
    "compare": 58297,
    "compare_arrows": 59669,
    "compass_calibration": 58748,
    "component_exchange": 61927,
    "compost": 59233,
    "compress": 59725,
    "computer": 58142,
    "computer_arrow_up": 62199,
    "computer_cancel": 62198,
    "computer_sound": 61108,
    "concierge": 62817,
    "conditions": 57504,
    "confirmation_number": 58936,
    "congenital": 57505,
    "connect_without_contact": 61987,
    "connected_tv": 59800,
    "connecting_airports": 59337,
    "construction": 59964,
    "contact_emergency": 63697,
    "contact_mail": 57552,
    "contact_page": 61998,
    "contact_phone": 61632,
    "contact_phone_filled": 61632,
    "contact_support": 59724,
    "contactless": 60017,
    "contactless_off": 63576,
    "contacts": 57530,
    "contacts_product": 59801,
    "content_copy": 57677,
    "content_cut": 57678,
    "content_paste": 57679,
    "content_paste_go": 60046,
    "content_paste_off": 58616,
    "content_paste_search": 60059,
    "contextual_token": 62598,
    "contextual_token_add": 62597,
    "contract": 62880,
    "contract_delete": 62882,
    "contract_edit": 62881,
    "contrast": 60215,
    "contrast_circle": 62623,
    "contrast_rtl_off": 60530,
    "contrast_square": 62624,
    "control_camera": 57460,
    "control_point": 58298,
    "control_point_duplicate": 58299,
    "controller_gen": 59453,
    "conversation": 61231,
    "conversion_path": 61633,
    "conversion_path_off": 63412,
    "convert_to_text": 62495,
    "conveyor_belt": 63591,
    "cookie": 60076,
    "cookie_off": 63386,
    "cooking": 58038,
    "cool_to_dry": 57974,
    "copy_all": 58092,
    "copyright": 59660,
    "coronavirus": 61985,
    "corporate_fare": 61904,
    "cottage": 58759,
    "counter_0": 63365,
    "counter_1": 63364,
    "counter_2": 63363,
    "counter_3": 63362,
    "counter_4": 63361,
    "counter_5": 63360,
    "counter_6": 63359,
    "counter_7": 63358,
    "counter_8": 63357,
    "counter_9": 63356,
    "countertops": 61943,
    "create": 61591,
    "create_new_folder": 58060,
    "credit_card": 59553,
    "credit_card_clock": 62520,
    "credit_card_gear": 62765,
    "credit_card_heart": 62764,
    "credit_card_off": 58612,
    "credit_score": 61425,
    "crib": 58760,
    "crisis_alert": 60393,
    "crop": 58302,
    "crop_16_9": 58300,
    "crop_21_9": 1048330,
    "crop_2_3": 1048331,
    "crop_3_2": 58301,
    "crop_5_4": 58303,
    "crop_7_5": 58304,
    "crop_9_16": 62793,
    "crop_din": 58310,
    "crop_free": 58306,
    "crop_landscape": 58307,
    "crop_original": 58356,
    "crop_portrait": 58309,
    "crop_rotate": 58423,
    "crop_square": 58310,
    "crossword": 62949,
    "crowdsource": 60184,
    "crown": 60595,
    "cruelty_free": 59289,
    "css": 60307,
    "csv": 59087,
    "currency_bitcoin": 60357,
    "currency_exchange": 60272,
    "currency_franc": 60154,
    "currency_lira": 60143,
    "currency_pound": 60145,
    "currency_ruble": 60140,
    "currency_rupee": 60151,
    "currency_rupee_circle": 62560,
    "currency_yen": 60155,
    "currency_yuan": 60153,
    "curtains": 60446,
    "curtains_closed": 60445,
    "custom_typography": 59186,
    "cut": 61579,
    "cycle": 63572,
    "cyclone": 60373,
    "dangerous": 59802,
    "dark_mode": 58652,
    "dashboard": 59505,
    "dashboard_2": 62442,
    "dashboard_2_edit": 1048535,
    "dashboard_2_gear": 1048534,
    "dashboard_customize": 59803,
    "data_alert": 63478,
    "data_array": 60113,
    "data_check": 63474,
    "data_exploration": 59247,
    "data_info_alert": 63477,
    "data_loss_prevention": 58076,
    "data_object": 60115,
    "data_saver_off": 61426,
    "data_saver_on": 61427,
    "data_table": 59804,
    "data_thresholding": 60319,
    "data_usage": 61426,
    "database": 61966,
    "database_off": 62484,
    "database_search": 62350,
    "database_upload": 62428,
    "dataset": 63726,
    "dataset_linked": 63727,
    "date_range": 59670,
    "deblur": 60279,
    "deceased": 57509,
    "decimal_decrease": 63533,
    "decimal_increase": 63532,
    "deck": 59970,
    "dehaze": 58311,
    "delete": 59694,
    "delete_forever": 59691,
    "delete_history": 62744,
    "delete_outline": 59694,
    "delete_sweep": 57708,
    "delivery_dining": 60200,
    "delivery_truck_bolt": 62370,
    "delivery_truck_speed": 62369,
    "demography": 58505,
    "density_large": 60329,
    "density_medium": 60318,
    "density_small": 60328,
    "dentistry": 57510,
    "departure_board": 58742,
    "deployed_code": 63264,
    "deployed_code_account": 62747,
    "deployed_code_alert": 62962,
    "deployed_code_history": 62963,
    "deployed_code_update": 62964,
    "dermatology": 57511,
    "description": 59507,
    "deselect": 60342,
    "design_services": 61706,
    "desk": 63732,
    "deskphone": 63482,
    "desktop_access_disabled": 59805,
    "desktop_cloud": 62427,
    "desktop_cloud_stack": 62398,
    "desktop_landscape": 62558,
    "desktop_landscape_add": 62521,
    "desktop_mac": 58123,
    "desktop_portrait": 62557,
    "desktop_windows": 58124,
    "destruction": 62853,
    "details": 58312,
    "detection_and_zone": 58015,
    "detection_and_zone_off": 61119,
    "detector": 57986,
    "detector_alarm": 57847,
    "detector_battery": 57860,
    "detector_co": 58031,
    "detector_offline": 57891,
    "detector_smoke": 57989,
    "detector_status": 57832,
    "developer_board": 58125,
    "developer_board_off": 58623,
    "developer_guide": 59806,
    "developer_mode": 62178,
    "developer_mode_tv": 59508,
    "device_band": 62197,
    "device_hub": 58165,
    "device_reset": 59571,
    "device_thermostat": 57855,
    "device_unknown": 62177,
    "devices": 58150,
    "devices_fold": 60382,
    "devices_fold_2": 62470,
    "devices_off": 63397,
    "devices_other": 58167,
    "devices_wearables": 63147,
    "dew_point": 63609,
    "diagnosis": 57512,
    "diagonal_line": 62494,
    "dialer_sip": 57531,
    "dialogs": 59807,
    "dialpad": 57532,
    "diamond": 60117,
    "diamond_shine": 62130,
    "dictionary": 62777,
    "difference": 60285,
    "digital_out_of_home": 61918,
    "digital_wellbeing": 61318,
    "dine_heart": 62108,
    "dine_in": 62101,
    "dine_lamp": 62107,
    "dining": 61428,
    "dinner_dining": 59991,
    "directions": 58670,
    "directions_alt": 63616,
    "directions_alt_off": 63617,
    "directions_bike": 58671,
    "directions_boat": 61429,
    "directions_boat_filled": 61429,
    "directions_bus": 61430,
    "directions_bus_filled": 61430,
    "directions_car": 61431,
    "directions_car_filled": 61431,
    "directions_off": 61711,
    "directions_railway": 61432,
    "directions_railway_2": 62562,
    "directions_railway_filled": 61432,
    "directions_run": 58726,
    "directions_subway": 61434,
    "directions_subway_filled": 61434,
    "directions_transit": 61434,
    "directions_transit_filled": 61434,
    "directions_walk": 58678,
    "directory_sync": 58260,
    "dirty_lens": 61259,
    "disabled_by_default": 62e3,
    "disabled_visible": 59246,
    "disc_full": 58896,
    "discover_tune": 57368,
    "dishwasher": 59808,
    "dishwasher_gen": 59442,
    "display_external_input": 63463,
    "display_settings": 60311,
    "distance": 63210,
    "diversity_1": 63703,
    "diversity_2": 63704,
    "diversity_3": 63705,
    "diversity_4": 63575,
    "dns": 59509,
    "do_disturb": 61580,
    "do_disturb_alt": 61581,
    "do_disturb_off": 61582,
    "do_disturb_on": 61583,
    "do_not_disturb": 61581,
    "do_not_disturb_alt": 61580,
    "do_not_disturb_off": 61582,
    "do_not_disturb_on": 61583,
    "do_not_disturb_on_total_silence": 61435,
    "do_not_step": 61855,
    "do_not_touch": 61872,
    "dock": 62176,
    "dock_to_bottom": 63462,
    "dock_to_left": 63461,
    "dock_to_right": 63460,
    "docs": 60029,
    "docs_add_on": 61634,
    "docs_apps_script": 61635,
    "document_scanner": 58874,
    "document_search": 62341,
    "domain": 59374,
    "domain_add": 60258,
    "domain_disabled": 57583,
    "domain_verification": 61260,
    "domain_verification_off": 63408,
    "domino_mask": 62948,
    "done": 59510,
    "done_all": 59511,
    "done_outline": 59695,
    "donut_large": 59671,
    "donut_small": 59672,
    "door_back": 61436,
    "door_front": 61437,
    "door_open": 59260,
    "door_sensor": 57994,
    "door_sliding": 61438,
    "doorbell": 61439,
    "doorbell_3p": 57831,
    "doorbell_chime": 57843,
    "double_arrow": 59984,
    "downhill_skiing": 58633,
    "download": 61584,
    "download_2": 62755,
    "download_done": 61585,
    "download_for_offline": 61440,
    "downloading": 61441,
    "draft": 58989,
    "draft_orders": 59315,
    "drafts": 57681,
    "drag_click": 63263,
    "drag_handle": 57949,
    "drag_indicator": 59717,
    "drag_pan": 63262,
    "draw": 59206,
    "draw_abstract": 63480,
    "draw_collage": 63479,
    "drawing_recognition": 60160,
    "dresser": 57872,
    "drive_eta": 61431,
    "drive_export": 62493,
    "drive_file_move": 59809,
    "drive_file_move_outline": 59809,
    "drive_file_move_rtl": 59809,
    "drive_file_rename_outline": 59810,
    "drive_folder_upload": 59811,
    "drive_fusiontable": 59e3,
    "drone": 62042,
    "drone_2": 62041,
    "dropdown": 59812,
    "dropper_eye": 62289,
    "dry": 61875,
    "dry_cleaning": 59992,
    "dual_screen": 63183,
    "duo": 59813,
    "dvr": 57778,
    "dynamic_feed": 59924,
    "dynamic_form": 61887,
    "e911_avatar": 61722,
    "e911_emergency": 61721,
    "e_mobiledata": 61442,
    "e_mobiledata_badge": 63459,
    "ear_sound": 62294,
    "earbud_case": 62247,
    "earbud_left": 62246,
    "earbud_right": 62245,
    "earbuds": 61443,
    "earbuds_2": 62244,
    "earbuds_battery": 61444,
    "early_on": 58042,
    "earthquake": 63055,
    "east": 61919,
    "ecg": 63503,
    "ecg_heart": 63209,
    "eco": 59957,
    "eda": 63208,
    "edgesensor_high": 62191,
    "edgesensor_low": 62190,
    "edit": 61591,
    "edit_arrow_down": 62336,
    "edit_arrow_up": 62335,
    "edit_attributes": 58744,
    "edit_audio": 62509,
    "edit_calendar": 59202,
    "edit_document": 63628,
    "edit_location": 58728,
    "edit_location_alt": 57797,
    "edit_note": 59205,
    "edit_notifications": 58661,
    "edit_off": 59728,
    "edit_road": 61261,
    "edit_square": 63629,
    "editor_choice": 62760,
    "egg": 60108,
    "egg_alt": 60104,
    "eject": 59643,
    "elderly": 61978,
    "elderly_woman": 60265,
    "electric_bike": 60187,
    "electric_bolt": 60444,
    "electric_car": 60188,
    "electric_meter": 60443,
    "electric_moped": 60189,
    "electric_rickshaw": 60190,
    "electric_scooter": 60191,
    "electrical_services": 61698,
    "elevation": 63207,
    "elevator": 61856,
    "email": 57689,
    "emergency": 57835,
    "emergency_heat": 61789,
    "emergency_heat_2": 62693,
    "emergency_home": 59434,
    "emergency_recording": 60404,
    "emergency_share": 60406,
    "emergency_share_off": 62878,
    "emoji_emotions": 59938,
    "emoji_events": 59939,
    "emoji_flags": 61638,
    "emoji_food_beverage": 59931,
    "emoji_language": 62669,
    "emoji_nature": 59932,
    "emoji_objects": 59940,
    "emoji_people": 59933,
    "emoji_symbols": 59934,
    "emoji_transportation": 59935,
    "emoticon": 58867,
    "empty_dashboard": 63556,
    "enable": 61832,
    "encrypted": 58771,
    "encrypted_add": 62505,
    "encrypted_add_circle": 62506,
    "encrypted_minus_circle": 62504,
    "encrypted_off": 62503,
    "endocrinology": 57513,
    "energy": 59814,
    "energy_program_saving": 61791,
    "energy_program_time_used": 61793,
    "energy_savings_leaf": 60442,
    "engineering": 59965,
    "enhanced_encryption": 58943,
    "ent": 57514,
    "enterprise": 59150,
    "enterprise_off": 60237,
    "equal": 63355,
    "equalizer": 57373,
    "eraser_size_1": 62460,
    "eraser_size_2": 62459,
    "eraser_size_3": 62458,
    "eraser_size_4": 62457,
    "eraser_size_5": 62456,
    "error": 63670,
    "error_circle_rounded": 63670,
    "error_med": 58523,
    "error_outline": 63670,
    "escalator": 61857,
    "escalator_warning": 61868,
    "euro": 59925,
    "euro_symbol": 59686,
    "ev_charger": 58733,
    "ev_mobiledata_badge": 63458,
    "ev_shadow": 61327,
    "ev_shadow_add": 62848,
    "ev_shadow_minus": 62847,
    "ev_station": 58733,
    "event": 59512,
    "event_available": 58900,
    "event_busy": 58901,
    "event_list": 63107,
    "event_note": 58902,
    "event_repeat": 60283,
    "event_seat": 59651,
    "event_upcoming": 62008,
    "exclamation": 61999,
    "exercise": 63206,
    "exit_to_app": 59513,
    "expand": 59727,
    "expand_all": 59718,
    "expand_circle_down": 59341,
    "expand_circle_right": 62865,
    "expand_circle_up": 62930,
    "expand_content": 63536,
    "expand_less": 58830,
    "expand_more": 58831,
    "expansion_panels": 61328,
    "expension_panels": 61328,
    "experiment": 59014,
    "explicit": 57374,
    "explore": 59514,
    "explore_nearby": 58680,
    "explore_off": 59816,
    "explosion": 63109,
    "export_notes": 57516,
    "exposure": 58358,
    "exposure_neg_1": 58315,
    "exposure_neg_2": 58316,
    "exposure_plus_1": 59392,
    "exposure_plus_2": 58318,
    "exposure_zero": 58319,
    "extension": 59515,
    "extension_off": 58613,
    "eye_tracking": 62665,
    "eyebrow": 61107,
    "eyeglasses": 63214,
    "eyeglasses_2": 62151,
    "eyeglasses_2_sound": 62053,
    "face": 61448,
    "face_2": 63706,
    "face_3": 63707,
    "face_4": 63708,
    "face_5": 63709,
    "face_6": 63710,
    "face_down": 62466,
    "face_left": 62465,
    "face_nod": 62464,
    "face_retouching_natural": 61262,
    "face_retouching_off": 61447,
    "face_right": 62463,
    "face_shake": 62462,
    "face_unlock": 61448,
    "face_up": 62461,
    "fact_check": 61637,
    "factory": 60348,
    "falling": 62989,
    "familiar_face_and_zone": 57884,
    "family_group": 61170,
    "family_history": 57517,
    "family_home": 60198,
    "family_link": 60185,
    "family_restroom": 61858,
    "family_star": 62759,
    "fan_focus": 62260,
    "fan_indirect": 62259,
    "farsight_digital": 62809,
    "fast_forward": 57375,
    "fast_rewind": 57376,
    "fastfood": 58746,
    "faucet": 57976,
    "favorite": 59518,
    "favorite_border": 59518,
    "fax": 60120,
    "feature_search": 59817,
    "featured_play_list": 57453,
    "featured_seasonal_and_gifts": 61329,
    "featured_video": 57454,
    "feed": 61449,
    "feedback": 59519,
    "female": 58768,
    "femur": 63633,
    "femur_alt": 63634,
    "fence": 61942,
    "fertile": 63205,
    "festival": 60008,
    "fiber_dvr": 57437,
    "fiber_manual_record": 57441,
    "fiber_new": 57438,
    "fiber_pin": 57450,
    "fiber_smart_record": 57442,
    "file_copy": 57715,
    "file_copy_off": 62680,
    "file_download": 61584,
    "file_download_done": 61585,
    "file_download_off": 58622,
    "file_export": 62386,
    "file_json": 62395,
    "file_map": 58053,
    "file_map_stack": 62434,
    "file_open": 60147,
    "file_png": 62396,
    "file_present": 59918,
    "file_save": 61823,
    "file_save_off": 58629,
    "file_upload": 61595,
    "file_upload_off": 63622,
    "files": 60037,
    "filter": 58323,
    "filter_1": 58320,
    "filter_2": 58321,
    "filter_3": 58322,
    "filter_4": 58324,
    "filter_5": 58325,
    "filter_6": 58326,
    "filter_7": 58327,
    "filter_8": 58328,
    "filter_9": 58329,
    "filter_9_plus": 58330,
    "filter_alt": 61263,
    "filter_alt_off": 60210,
    "filter_arrow_right": 62417,
    "filter_b_and_w": 58331,
    "filter_center_focus": 58332,
    "filter_drama": 58333,
    "filter_frames": 58334,
    "filter_hdr": 58335,
    "filter_list": 57682,
    "filter_list_alt": 59726,
    "filter_list_off": 60247,
    "filter_none": 58336,
    "filter_retrolux": 58337,
    "filter_tilt_shift": 58338,
    "filter_vintage": 58339,
    "finance": 59071,
    "finance_chip": 63566,
    "finance_mode": 61330,
    "find_in_page": 59520,
    "find_replace": 59521,
    "fingerprint": 59661,
    "fingerprint_off": 62621,
    "fire_check": 1048488,
    "fire_extinguisher": 61912,
    "fire_hydrant": 61859,
    "fire_truck": 63730,
    "fireplace": 59971,
    "first_page": 58844,
    "fit_page": 63354,
    "fit_page_height": 62359,
    "fit_page_width": 62358,
    "fit_screen": 59920,
    "fit_width": 63353,
    "fitness_center": 60227,
    "fitness_tracker": 62563,
    "fitness_trackers": 61169,
    "flag": 61638,
    "flag_2": 62479,
    "flag_check": 62424,
    "flag_circle": 60152,
    "flag_filled": 61638,
    "flaky": 61264,
    "flare": 58340,
    "flash_auto": 58341,
    "flash_off": 58342,
    "flash_on": 58343,
    "flashlight_off": 61450,
    "flashlight_on": 61451,
    "flatware": 61452,
    "flex_direction": 63352,
    "flex_no_wrap": 63351,
    "flex_wrap": 63350,
    "flight": 58681,
    "flight_class": 59339,
    "flight_land": 59652,
    "flight_takeoff": 59653,
    "flights_and_hotels": 59819,
    "flightsmode": 61331,
    "flip": 58344,
    "flip_camera_android": 59959,
    "flip_camera_ios": 59960,
    "flip_to_back": 59522,
    "flip_to_front": 59523,
    "float_landscape_2": 62556,
    "float_portrait_2": 62555,
    "flood": 60390,
    "floor": 63204,
    "floor_lamp": 57886,
    "flourescent": 61565,
    "flowchart": 62349,
    "flowsheet": 57518,
    "fluid": 58499,
    "fluid_balance": 63501,
    "fluid_med": 63500,
    "fluorescent": 61565,
    "flutter": 61917,
    "flutter_dash": 57355,
    "flyover": 62584,
    "fmd_bad": 61454,
    "fmd_good": 61915,
    "foggy": 59416,
    "folded_hands": 62957,
    "folder": 58055,
    "folder_check": 62423,
    "folder_check_2": 62422,
    "folder_code": 62408,
    "folder_copy": 60349,
    "folder_data": 62854,
    "folder_delete": 60212,
    "folder_eye": 62421,
    "folder_info": 62357,
    "folder_limited": 62692,
    "folder_managed": 63349,
    "folder_match": 62420,
    "folder_off": 60291,
    "folder_open": 58056,
    "folder_shared": 58057,
    "folder_special": 58903,
    "folder_supervised": 63348,
    "folder_zip": 60204,
    "follow_the_signs": 61986,
    "font_download": 57703,
    "font_download_off": 58617,
    "food_bank": 61938,
    "foot_bones": 63635,
    "footprint": 63613,
    "for_you": 59820,
    "forest": 60057,
    "fork_chart": 1048486,
    "fork_left": 60320,
    "fork_right": 60332,
    "fork_spoon": 62436,
    "forklift": 63592,
    "format_align_center": 57908,
    "format_align_justify": 57909,
    "format_align_left": 57910,
    "format_align_right": 57911,
    "format_bold": 57912,
    "format_clear": 57913,
    "format_color_fill": 57914,
    "format_color_reset": 57915,
    "format_color_text": 57916,
    "format_h1": 63581,
    "format_h2": 63582,
    "format_h3": 63583,
    "format_h4": 63584,
    "format_h5": 63585,
    "format_h6": 63586,
    "format_image_back": 61104,
    "format_image_break_left": 61103,
    "format_image_break_right": 61102,
    "format_image_front": 61101,
    "format_image_inline_left": 61100,
    "format_image_inline_right": 1048573,
    "format_image_left": 63587,
    "format_image_right": 63588,
    "format_indent_decrease": 57917,
    "format_indent_increase": 57918,
    "format_ink_highlighter": 63531,
    "format_italic": 57919,
    "format_letter_spacing": 63347,
    "format_letter_spacing_2": 63e3,
    "format_letter_spacing_standard": 62999,
    "format_letter_spacing_wide": 62998,
    "format_letter_spacing_wider": 62997,
    "format_line_spacing": 57920,
    "format_list_bulleted": 57921,
    "format_list_bulleted_add": 63561,
    "format_list_numbered": 57922,
    "format_list_numbered_rtl": 57959,
    "format_overline": 60261,
    "format_paint": 57923,
    "format_paint_off": 1048471,
    "format_paragraph": 63589,
    "format_quote": 57924,
    "format_quote_off": 62483,
    "format_shapes": 57950,
    "format_size": 57925,
    "format_strikethrough": 57926,
    "format_text_clip": 63530,
    "format_text_overflow": 63529,
    "format_text_wrap": 63528,
    "format_textdirection_l_to_r": 57927,
    "format_textdirection_r_to_l": 57928,
    "format_textdirection_vertical": 62648,
    "format_underlined": 57929,
    "format_underlined_squiggle": 63621,
    "forms_add_on": 61639,
    "forms_apps_script": 61640,
    "fort": 60077,
    "forum": 59567,
    "forward": 62842,
    "forward_10": 57430,
    "forward_30": 57431,
    "forward_5": 57432,
    "forward_circle": 63221,
    "forward_media": 63220,
    "forward_to_inbox": 61831,
    "foundation": 61952,
    "fragrance": 62277,
    "frame_bug": 61167,
    "frame_exclamation": 61166,
    "frame_inspect": 63346,
    "frame_person": 63654,
    "frame_person_mic": 62677,
    "frame_person_off": 63441,
    "frame_reload": 63345,
    "frame_source": 63344,
    "free_breakfast": 60228,
    "free_cancellation": 59208,
    "front_hand": 59241,
    "front_loader": 63593,
    "full_coverage": 60178,
    "full_hd": 62859,
    "full_stacked_bar_chart": 61970,
    "fullscreen": 58832,
    "fullscreen_exit": 58833,
    "fullscreen_portrait": 62554,
    "function": 63590,
    "functions": 57930,
    "funicular": 62583,
    "g_mobiledata": 61456,
    "g_mobiledata_badge": 63457,
    "g_translate": 59687,
    "gallery_thumbnail": 63599,
    "game_bumper_left": 61152,
    "game_bumper_right": 61151,
    "game_button_l": 61150,
    "game_button_l1": 61149,
    "game_button_l2": 61148,
    "game_button_r": 61147,
    "game_button_r1": 61146,
    "game_button_r2": 61145,
    "game_button_zl": 61144,
    "game_button_zr": 61143,
    "game_stick_l3": 61142,
    "game_stick_left": 61141,
    "game_stick_r3": 61140,
    "game_stick_right": 61139,
    "game_trigger_left": 61138,
    "game_trigger_right": 61137,
    "gamepad": 58127,
    "gamepad_circle_down": 61136,
    "gamepad_circle_left": 61135,
    "gamepad_circle_right": 61134,
    "gamepad_circle_up": 61133,
    "gamepad_down": 61132,
    "gamepad_left": 61131,
    "gamepad_right": 61130,
    "gamepad_up": 61129,
    "games": 58127,
    "garage": 61457,
    "garage_check": 62093,
    "garage_door": 59156,
    "garage_door_open": 1048439,
    "garage_home": 59437,
    "garage_money": 62092,
    "garden_cart": 63657,
    "gas_meter": 60441,
    "gastroenterology": 57585,
    "gate": 57975,
    "gavel": 59662,
    "general_device": 59102,
    "generating_tokens": 59209,
    "genetics": 57587,
    "genres": 59118,
    "gesture": 57685,
    "gesture_select": 63063,
    "get_app": 61584,
    "gif": 59656,
    "gif_2": 62478,
    "gif_box": 59299,
    "girl": 60264,
    "gite": 58763,
    "gitlab": 1048344,
    "glass_cup": 63203,
    "globe": 58956,
    "globe_2_cancel": 1048503,
    "globe_2_question": 1048502,
    "globe_asia": 63385,
    "globe_book": 62409,
    "globe_location_pin": 62301,
    "globe_uk": 63384,
    "glucose": 58528,
    "glyphs": 63651,
    "go_to_line": 63261,
    "golf_course": 60229,
    "gondola_lift": 62582,
    "google_home_devices": 59157,
    "google_plus_reshare": 62842,
    "google_tv_remote": 62939,
    "google_wifi": 62841,
    "gpp_bad": 61458,
    "gpp_good": 61459,
    "gpp_maybe": 61460,
    "gps_fixed": 58716,
    "gps_not_fixed": 57783,
    "gps_off": 57782,
    "grade": 61594,
    "gradient": 58345,
    "grading": 59983,
    "grain": 58346,
    "graph_1": 62368,
    "graph_2": 62367,
    "graph_3": 62366,
    "graph_4": 62365,
    "graph_5": 62364,
    "graph_6": 62363,
    "graph_7": 62278,
    "graph_8": 1048556,
    "graphic_eq": 57784,
    "graphic_eq_off": 1048472,
    "grass": 61957,
    "grid_3x3": 61461,
    "grid_3x3_off": 63100,
    "grid_4x4": 61462,
    "grid_goldenratio": 61463,
    "grid_guides": 63343,
    "grid_layout_side": 1048461,
    "grid_off": 58347,
    "grid_on": 58348,
    "grid_view": 59824,
    "grocery": 61335,
    "group": 59937,
    "group_add": 59376,
    "group_off": 59207,
    "group_remove": 59309,
    "group_search": 62414,
    "group_work": 59526,
    "grouped_bar_chart": 61969,
    "groups": 62003,
    "groups_2": 63711,
    "groups_3": 63712,
    "guardian": 62657,
    "gynecology": 57588,
    "h_mobiledata": 61464,
    "h_mobiledata_badge": 63456,
    "h_plus_mobiledata": 61465,
    "h_plus_mobiledata_badge": 63455,
    "hail": 59825,
    "hallway": 59128,
    "hanami_dango": 62015,
    "hand_bones": 63636,
    "hand_gesture": 61340,
    "hand_gesture_off": 62451,
    "hand_meal": 62100,
    "hand_package": 62099,
    "handheld_controller": 62662,
    "handshake": 60363,
    "handwriting_recognition": 60162,
    "handyman": 61707,
    "hangout_video": 57537,
    "hangout_video_off": 57538,
    "hard_disk": 62426,
    "hard_drive": 63502,
    "hard_drive_2": 63396,
    "hardware": 59993,
    "hd": 57426,
    "hdr_auto": 61466,
    "hdr_auto_select": 61467,
    "hdr_enhanced_select": 61265,
    "hdr_off": 58349,
    "hdr_off_select": 61468,
    "hdr_on": 58350,
    "hdr_on_select": 61469,
    "hdr_plus": 61470,
    "hdr_plus_off": 58351,
    "hdr_strong": 58353,
    "hdr_weak": 58354,
    "head_mounted_device": 62661,
    "headphones": 61471,
    "headphones_battery": 61472,
    "headset": 61471,
    "headset_mic": 58129,
    "headset_off": 58170,
    "healing": 58355,
    "health_and_beauty": 61341,
    "health_and_safety": 57813,
    "health_cross": 62147,
    "health_metrics": 63202,
    "heap_snapshot_large": 63342,
    "heap_snapshot_multiple": 63341,
    "heap_snapshot_thumbnail": 63340,
    "hearing": 57379,
    "hearing_aid": 62564,
    "hearing_aid_disabled": 62384,
    "hearing_aid_disabled_left": 62188,
    "hearing_aid_left": 62189,
    "hearing_disabled": 61700,
    "heart_broken": 60098,
    "heart_check": 62986,
    "heart_minus": 63619,
    "heart_plus": 63620,
    "heart_smile": 62098,
    "heat": 62775,
    "heat_pump": 60440,
    "heat_pump_balance": 57982,
    "height": 59926,
    "helicopter": 62988,
    "help": 59645,
    "help_center": 61888,
    "help_clinic": 63504,
    "help_outline": 59645,
    "hematology": 57590,
    "hevc": 61473,
    "hexagon": 60217,
    "hide": 61342,
    "hide_image": 61474,
    "hide_source": 61475,
    "high_chair": 62106,
    "high_density": 63388,
    "high_quality": 57380,
    "high_res": 62795,
    "highlight": 57951,
    "highlight_alt": 61266,
    "highlight_keyboard_focus": 62736,
    "highlight_mouse_cursor": 62737,
    "highlight_off": 59528,
    "highlight_text_cursor": 62738,
    "highlighter_size_1": 63339,
    "highlighter_size_2": 63338,
    "highlighter_size_3": 63337,
    "highlighter_size_4": 63336,
    "highlighter_size_5": 63335,
    "hiking": 58634,
    "history": 59571,
    "history_2": 62438,
    "history_edu": 59966,
    "history_off": 62682,
    "history_toggle_off": 61821,
    "hive": 60070,
    "hls": 60298,
    "hls_off": 60300,
    "holiday_village": 58762,
    "home": 59826,
    "home_and_garden": 61343,
    "home_app_logo": 58005,
    "home_filled": 59826,
    "home_health": 58553,
    "home_improvement_and_tools": 61344,
    "home_iot_device": 57987,
    "home_max": 61476,
    "home_max_dots": 59465,
    "home_mini": 61477,
    "home_pin": 61773,
    "home_repair_service": 61696,
    "home_speaker": 61724,
    "home_storage": 63596,
    "home_storage_gear": 1048446,
    "home_work": 61488,
    "horizontal_align_center": 1048476,
    "horizontal_align_left": 1048475,
    "horizontal_align_right": 1048474,
    "horizontal_distribute": 57364,
    "horizontal_rule": 61704,
    "horizontal_split": 59719,
    "host": 62425,
    "hot_tub": 60230,
    "hotel": 58697,
    "hotel_class": 59203,
    "hourglass": 60415,
    "hourglass_arrow_down": 62334,
    "hourglass_arrow_up": 62333,
    "hourglass_bottom": 59996,
    "hourglass_check": 1048557,
    "hourglass_disabled": 61267,
    "hourglass_empty": 59531,
    "hourglass_full": 59532,
    "hourglass_pause": 62348,
    "hourglass_top": 59995,
    "house": 59972,
    "house_siding": 61954,
    "house_with_shield": 59270,
    "houseboat": 58756,
    "household_supplies": 61345,
    "hov": 62581,
    "how_to_reg": 57716,
    "how_to_vote": 57717,
    "hr_resting": 63162,
    "html": 60286,
    "http": 59650,
    "https": 59545,
    "hub": 59892,
    "humerus": 63637,
    "humerus_alt": 63638,
    "humidity_high": 61795,
    "humidity_indoor": 62808,
    "humidity_low": 61796,
    "humidity_mid": 61797,
    "humidity_percentage": 63614,
    "hvac": 61710,
    "hvac_max_defrost": 62258,
    "ice_skating": 58635,
    "icecream": 60009,
    "id_card": 62666,
    "identity_aware_proxy": 58077,
    "identity_platform": 60343,
    "ifl": 57381,
    "iframe": 63259,
    "iframe_off": 63260,
    "image": 58356,
    "image_arrow_up": 62231,
    "image_aspect_ratio": 58357,
    "image_inset": 62023,
    "image_not_supported": 61718,
    "image_search": 58431,
    "imagesearch_roller": 59828,
    "imagesmode": 61346,
    "immunology": 57595,
    "import_contacts": 57568,
    "import_export": 59605,
    "important_devices": 59666,
    "in_home_mode": 59443,
    "inactive_order": 57596,
    "inbox": 57686,
    "inbox_customize": 63577,
    "inbox_text": 62361,
    "inbox_text_asterisk": 62304,
    "inbox_text_person": 62302,
    "inbox_text_share": 62300,
    "incomplete_circle": 59291,
    "indeterminate_check_box": 59657,
    "indeterminate_question_box": 62829,
    "info": 59534,
    "info_i": 62875,
    "infrared": 63612,
    "ink_eraser": 59088,
    "ink_eraser_off": 59363,
    "ink_highlighter": 59089,
    "ink_highlighter_move": 62756,
    "ink_highlighter_off": 1048340,
    "ink_marker": 59090,
    "ink_pen": 59091,
    "ink_selection": 61266,
    "inpatient": 57598,
    "input": 59536,
    "input_circle": 63258,
    "insert_chart": 61644,
    "insert_chart_filled": 61644,
    "insert_chart_outlined": 61644,
    "insert_comment": 57932,
    "insert_drive_file": 58989,
    "insert_emoticon": 59938,
    "insert_invitation": 59512,
    "insert_link": 57936,
    "insert_page_break": 60106,
    "insert_photo": 58356,
    "insert_text": 63527,
    "insights": 61586,
    "install_desktop": 60273,
    "install_mobile": 62157,
    "instant_mix": 57382,
    "integration_instructions": 61268,
    "interactive_space": 63487,
    "interests": 59336,
    "interpreter_mode": 59451,
    "inventory": 57721,
    "inventory_2": 57761,
    "invert_colors": 59537,
    "invert_colors_off": 57540,
    "ios": 57383,
    "ios_share": 59064,
    "iron": 58755,
    "iso": 58358,
    "jamboard_kiosk": 59829,
    "japanese_curry": 62084,
    "japanese_flag": 62083,
    "javascript": 60284,
    "join": 63567,
    "join_full": 63567,
    "join_inner": 60148,
    "join_left": 60146,
    "join_right": 60138,
    "joystick": 62958,
    "jump_to_element": 63257,
    "kanji_alcohol": 62014,
    "kayaking": 58636,
    "kebab_dining": 59458,
    "keep": 61478,
    "keep_off": 59129,
    "keep_pin": 61478,
    "keep_public": 62831,
    "kettle": 58041,
    "key": 59196,
    "key_off": 60292,
    "key_vertical": 62746,
    "key_visualizer": 61849,
    "keyboard": 58130,
    "keyboard_alt": 61480,
    "keyboard_arrow_down": 58131,
    "keyboard_arrow_left": 58132,
    "keyboard_arrow_right": 58133,
    "keyboard_arrow_up": 58134,
    "keyboard_backspace": 58135,
    "keyboard_capslock": 58136,
    "keyboard_capslock_badge": 63454,
    "keyboard_command_key": 60135,
    "keyboard_control_key": 60134,
    "keyboard_double_arrow_down": 60112,
    "keyboard_double_arrow_left": 60099,
    "keyboard_double_arrow_right": 60105,
    "keyboard_double_arrow_up": 60111,
    "keyboard_external_input": 63453,
    "keyboard_full": 63452,
    "keyboard_hide": 58138,
    "keyboard_keys": 63099,
    "keyboard_lock": 62610,
    "keyboard_lock_off": 62609,
    "keyboard_off": 63098,
    "keyboard_onscreen": 63451,
    "keyboard_option_key": 60136,
    "keyboard_previous_language": 63450,
    "keyboard_return": 58139,
    "keyboard_tab": 58140,
    "keyboard_tab_rtl": 60531,
    "keyboard_voice": 58141,
    "kid_star": 62758,
    "king_bed": 59973,
    "kitchen": 60231,
    "kitesurfing": 58637,
    "lab_panel": 57603,
    "lab_profile": 57604,
    "lab_research": 63499,
    "label": 59539,
    "label_important": 59720,
    "label_important_outline": 59720,
    "label_off": 59830,
    "label_outline": 59539,
    "labs": 57605,
    "lan": 60207,
    "landscape": 58724,
    "landscape_2": 62660,
    "landscape_2_edit": 62224,
    "landscape_2_off": 62659,
    "landslide": 60375,
    "language": 59540,
    "language_chinese_array": 63334,
    "language_chinese_cangjie": 63333,
    "language_chinese_dayi": 63332,
    "language_chinese_pinyin": 63331,
    "language_chinese_quick": 63330,
    "language_chinese_wubi": 63329,
    "language_french": 63328,
    "language_gb_english": 63327,
    "language_international": 63326,
    "language_japanese_kana": 62739,
    "language_korean_latin": 63325,
    "language_pinyin": 63324,
    "language_spanish": 62953,
    "language_us": 63321,
    "language_us_colemak": 63323,
    "language_us_dvorak": 63322,
    "laps": 63161,
    "laptop": 58142,
    "laptop_car": 62413,
    "laptop_chromebook": 58143,
    "laptop_mac": 58144,
    "laptop_windows": 58145,
    "lasso_select": 60163,
    "last_page": 58845,
    "launch": 59550,
    "laundry": 58024,
    "layers": 58683,
    "layers_clear": 58684,
    "lda": 57606,
    "leaderboard": 61964,
    "leak_add": 58360,
    "leak_remove": 58361,
    "left_click": 63256,
    "left_panel_close": 63255,
    "left_panel_open": 63254,
    "legend_toggle": 61723,
    "lens": 58362,
    "lens_blur": 61481,
    "letter_switch": 63320,
    "library_add": 57404,
    "library_add_check": 59831,
    "library_books": 57391,
    "library_music": 57392,
    "license": 60164,
    "lift_to_talk": 61347,
    "light": 61482,
    "light_group": 57995,
    "light_group_2": 1048438,
    "light_mode": 58648,
    "light_mode_auto": 1048320,
    "light_off": 59832,
    "lightbulb": 59663,
    "lightbulb_2": 62435,
    "lightbulb_circle": 60414,
    "lightbulb_outline": 59663,
    "lightning_stand": 61348,
    "lightstrip": 1048437,
    "line_axis": 60058,
    "line_curve": 63319,
    "line_end": 63526,
    "line_end_arrow": 63517,
    "line_end_arrow_notch": 63516,
    "line_end_circle": 63515,
    "line_end_diamond": 63514,
    "line_end_square": 63513,
    "line_start": 63525,
    "line_start_arrow": 63512,
    "line_start_arrow_notch": 63511,
    "line_start_circle": 63510,
    "line_start_diamond": 63509,
    "line_start_square": 63508,
    "line_style": 59673,
    "line_weight": 59674,
    "linear_scale": 57952,
    "link": 57936,
    "link_2": 1048501,
    "link_off": 57711,
    "linked_camera": 58424,
    "linked_services": 62773,
    "lips": 61106,
    "liquor": 6e4,
    "list": 59542,
    "list_alt": 57582,
    "list_alt_add": 63318,
    "list_alt_check": 62430,
    "list_arrow": 1048371,
    "lists": 59833,
    "live_help": 57542,
    "live_tv": 58938,
    "living": 61483,
    "local_activity": 58707,
    "local_airport": 58685,
    "local_atm": 58686,
    "local_bar": 58688,
    "local_cafe": 60228,
    "local_car_wash": 58690,
    "local_convenience_store": 58691,
    "local_dining": 58721,
    "local_drink": 58692,
    "local_fire_department": 61269,
    "local_florist": 58693,
    "local_gas_station": 58694,
    "local_grocery_store": 59596,
    "local_hospital": 58696,
    "local_hotel": 58697,
    "local_laundry_service": 58698,
    "local_library": 58699,
    "local_mall": 58700,
    "local_movies": 59610,
    "local_offer": 61531,
    "local_parking": 58703,
    "local_pharmacy": 58704,
    "local_phone": 61652,
    "local_pizza": 58706,
    "local_play": 58707,
    "local_police": 61270,
    "local_post_office": 58708,
    "local_printshop": 59565,
    "local_see": 58711,
    "local_shipping": 58712,
    "local_taxi": 58713,
    "location_automation": 61775,
    "location_away": 61776,
    "location_chip": 63568,
    "location_city": 59377,
    "location_disabled": 57782,
    "location_home": 61778,
    "location_off": 57543,
    "location_on": 61915,
    "location_pin": 61915,
    "location_searching": 57783,
    "locator_tag": 63681,
    "lock": 59545,
    "lock_clock": 61271,
    "lock_open": 59544,
    "lock_open_circle": 62305,
    "lock_open_right": 63062,
    "lock_outline": 59545,
    "lock_person": 63731,
    "lock_reset": 60126,
    "login": 60023,
    "logo_dev": 60118,
    "logout": 59834,
    "looks": 58364,
    "looks_3": 58363,
    "looks_4": 58365,
    "looks_5": 58366,
    "looks_6": 58367,
    "looks_one": 58368,
    "looks_two": 58369,
    "loop": 59491,
    "loupe": 58370,
    "low_density": 63387,
    "low_priority": 57709,
    "lowercase": 62602,
    "loyalty": 59546,
    "lte_mobiledata": 61484,
    "lte_mobiledata_badge": 63449,
    "lte_plus_mobiledata": 61485,
    "lte_plus_mobiledata_badge": 63448,
    "luggage": 62005,
    "lunch_dining": 60001,
    "lyrics": 60427,
    "macro_auto": 63218,
    "macro_off": 63698,
    "magic_button": 61750,
    "magic_exchange": 63476,
    "magic_tether": 63447,
    "magnification_large": 63549,
    "magnification_small": 63548,
    "magnify_docked": 63446,
    "magnify_fullscreen": 63445,
    "mail": 57689,
    "mail_asterisk": 61172,
    "mail_lock": 60426,
    "mail_off": 62603,
    "mail_outline": 57689,
    "mail_shield": 62025,
    "male": 58766,
    "man": 58603,
    "man_2": 63713,
    "man_3": 63714,
    "man_4": 63715,
    "manage_accounts": 61486,
    "manage_history": 60391,
    "manage_search": 61487,
    "manga": 62947,
    "manufacturing": 59174,
    "map": 58715,
    "map_pin_heart": 62104,
    "map_pin_review": 62103,
    "map_search": 62410,
    "maps_home_work": 61488,
    "maps_ugc": 61272,
    "margin": 59835,
    "mark_as_unread": 59836,
    "mark_chat_read": 61835,
    "mark_chat_unread": 61833,
    "mark_email_read": 61836,
    "mark_email_unread": 61834,
    "mark_unread_chat_alt": 60317,
    "markdown": 62802,
    "markdown_copy": 62803,
    "markdown_paste": 62804,
    "markunread": 57689,
    "markunread_mailbox": 59547,
    "masked_transitions": 59182,
    "masked_transitions_add": 62507,
    "masks": 61976,
    "massage": 62146,
    "match_case": 63217,
    "match_case_off": 62319,
    "match_word": 63216,
    "matter": 59655,
    "maximize": 59696,
    "meal_dinner": 62013,
    "meal_lunch": 62012,
    "measuring_tape": 63151,
    "media_bluetooth_off": 61489,
    "media_bluetooth_on": 61490,
    "media_link": 63551,
    "media_output": 62706,
    "media_output_off": 62707,
    "mediation": 61351,
    "medical_information": 60397,
    "medical_mask": 63498,
    "medical_services": 61705,
    "medication": 61491,
    "medication_liquid": 60039,
    "meeting_room": 60239,
    "memory": 58146,
    "memory_alt": 63395,
    "menstrual_health": 63201,
    "menu": 58834,
    "menu_book": 59929,
    "menu_book_2": 62097,
    "menu_open": 59837,
    "merge": 60312,
    "merge_type": 57938,
    "message": 57545,
    "metabolism": 57611,
    "metro": 62580,
    "mfg_nest_yale_lock": 61725,
    "mic": 58141,
    "mic_alert": 62354,
    "mic_double": 62929,
    "mic_external_off": 61273,
    "mic_external_on": 61274,
    "mic_gear": 61114,
    "mic_none": 58141,
    "mic_off": 57387,
    "microbiology": 57612,
    "microwave": 61956,
    "microwave_gen": 59463,
    "military_tech": 59967,
    "mimo": 59838,
    "mimo_disconnect": 59839,
    "mindfulness": 63200,
    "minimize": 59697,
    "minor_crash": 60401,
    "mintmark": 61353,
    "missed_video_call": 61646,
    "missed_video_call_filled": 61646,
    "missing_controller": 59137,
    "mist": 57736,
    "mitre": 62791,
    "mixture_med": 58568,
    "mms": 58904,
    "mobile": 59322,
    "mobile_2": 62171,
    "mobile_3": 62170,
    "mobile_alert": 62163,
    "mobile_arrow_down": 62157,
    "mobile_arrow_right": 62162,
    "mobile_arrow_up_right": 62137,
    "mobile_block": 62181,
    "mobile_camera": 62542,
    "mobile_camera_front": 62153,
    "mobile_camera_rear": 62152,
    "mobile_cancel": 62186,
    "mobile_cast": 62156,
    "mobile_charge": 62179,
    "mobile_chat": 63391,
    "mobile_check": 61555,
    "mobile_code": 62178,
    "mobile_dots": 62160,
    "mobile_friendly": 61555,
    "mobile_gear": 62169,
    "mobile_hand": 62243,
    "mobile_hand_left": 62227,
    "mobile_hand_left_off": 62226,
    "mobile_hand_off": 62228,
    "mobile_info": 62172,
    "mobile_landscape": 60734,
    "mobile_layout": 62143,
    "mobile_lock_landscape": 62168,
    "mobile_lock_portrait": 62142,
    "mobile_loupe": 62242,
    "mobile_menu": 62161,
    "mobile_off": 57857,
    "mobile_question": 62177,
    "mobile_rotate": 62165,
    "mobile_rotate_lock": 62166,
    "mobile_screen_share": 62175,
    "mobile_screensaver": 62241,
    "mobile_sensor_hi": 62191,
    "mobile_sensor_lo": 62190,
    "mobile_share": 62175,
    "mobile_share_stack": 62174,
    "mobile_sound": 62184,
    "mobile_sound_2": 62232,
    "mobile_sound_off": 63402,
    "mobile_speaker": 62240,
    "mobile_text": 62187,
    "mobile_text_2": 62182,
    "mobile_theft": 62121,
    "mobile_ticket": 62180,
    "mobile_unlock": 61162,
    "mobile_vibrate": 62155,
    "mobile_wrench": 62128,
    "mobiledata_arrows": 1048483,
    "mobiledata_off": 61492,
    "mode": 61591,
    "mode_comment": 57939,
    "mode_cool": 61798,
    "mode_cool_off": 61799,
    "mode_dual": 62807,
    "mode_edit": 61591,
    "mode_edit_outline": 61591,
    "mode_fan": 61800,
    "mode_fan_2": 1048528,
    "mode_fan_off": 60439,
    "mode_heat": 61802,
    "mode_heat_cool": 61803,
    "mode_heat_off": 61805,
    "mode_night": 61494,
    "mode_of_travel": 59342,
    "mode_off_on": 61807,
    "mode_standby": 61495,
    "model_training": 61647,
    "modeling": 62378,
    "monetization_on": 57955,
    "money": 58749,
    "money_bag": 62446,
    "money_off": 61496,
    "money_off_csred": 61496,
    "money_range": 62021,
    "monitor": 61275,
    "monitor_heart": 60066,
    "monitor_weight": 61497,
    "monitor_weight_gain": 63199,
    "monitor_weight_loss": 63198,
    "monitoring": 61840,
    "monochrome_photos": 58371,
    "monorail": 62579,
    "mood": 59938,
    "mood_bad": 59379,
    "mood_heart": 1048500,
    "moon_stars": 62287,
    "mop": 57997,
    "moped": 60200,
    "moped_package": 62091,
    "more": 58905,
    "more_down": 61846,
    "more_horiz": 58835,
    "more_time": 59997,
    "more_up": 61847,
    "more_vert": 58836,
    "mosque": 60082,
    "motion_blur": 61648,
    "motion_mode": 63554,
    "motion_photos_auto": 61498,
    "motion_photos_off": 59840,
    "motion_photos_on": 59841,
    "motion_photos_pause": 61991,
    "motion_photos_paused": 61991,
    "motion_play": 62475,
    "motion_sensor_active": 59282,
    "motion_sensor_alert": 59268,
    "motion_sensor_idle": 59267,
    "motion_sensor_urgent": 59278,
    "motorcycle": 59675,
    "mountain_flag": 62946,
    "mountain_steam": 62082,
    "mouse": 58147,
    "mouse_lock": 62608,
    "mouse_lock_off": 62607,
    "move": 59200,
    "move_down": 60257,
    "move_group": 63253,
    "move_item": 61951,
    "move_location": 59201,
    "move_selection_down": 63252,
    "move_selection_left": 63251,
    "move_selection_right": 63250,
    "move_selection_up": 63249,
    "move_to_inbox": 57704,
    "move_up": 60260,
    "moved_location": 58772,
    "movie": 58372,
    "movie_creation": 58372,
    "movie_edit": 63552,
    "movie_edit_off": 1048445,
    "movie_filter": 58426,
    "movie_info": 57389,
    "movie_off": 62617,
    "movie_speaker": 62115,
    "moving": 58625,
    "moving_beds": 59197,
    "moving_ministry": 59198,
    "mp": 59843,
    "multicooker": 58003,
    "multiline_chart": 59103,
    "multimodal_hand_eye": 62491,
    "multiple_airports": 61355,
    "multiple_stop": 61881,
    "museum": 59958,
    "music_cast": 60186,
    "music_history": 62145,
    "music_note": 58373,
    "music_note_2": 1048536,
    "music_note_add": 62353,
    "music_off": 58432,
    "music_video": 57443,
    "my_location": 58716,
    "mystery": 62945,
    "nat": 61276,
    "nature": 58374,
    "nature_people": 58375,
    "navigate_before": 58827,
    "navigate_next": 58828,
    "navigation": 58717,
    "near_me": 58729,
    "near_me_disabled": 61935,
    "nearby": 59063,
    "nearby_error": 61499,
    "nearby_off": 61500,
    "nephrology": 57613,
    "nest_audio": 60351,
    "nest_cam_floodlight": 63671,
    "nest_cam_indoor": 61726,
    "nest_cam_iq": 61727,
    "nest_cam_iq_outdoor": 61728,
    "nest_cam_magnet_mount": 63672,
    "nest_cam_outdoor": 61729,
    "nest_cam_stand": 63673,
    "nest_cam_wall_mount": 63674,
    "nest_cam_wired_stand": 60438,
    "nest_clock_farsight_analog": 63675,
    "nest_clock_farsight_digital": 63676,
    "nest_connect": 61730,
    "nest_detect": 61731,
    "nest_display": 61732,
    "nest_display_max": 61733,
    "nest_doorbell_visitor": 63677,
    "nest_eco_leaf": 63678,
    "nest_farsight_cool": 62077,
    "nest_farsight_dual": 62076,
    "nest_farsight_eco": 62075,
    "nest_farsight_heat": 62074,
    "nest_farsight_seasonal": 62073,
    "nest_farsight_weather": 63679,
    "nest_found_savings": 63680,
    "nest_gale_wifi": 62841,
    "nest_heat_link_e": 61734,
    "nest_heat_link_gen_3": 61735,
    "nest_hello_doorbell": 59436,
    "nest_locator_tag": 63681,
    "nest_mini": 59273,
    "nest_multi_room": 63682,
    "nest_protect": 59022,
    "nest_remote": 62939,
    "nest_remote_comfort_sensor": 61738,
    "nest_secure_alarm": 61739,
    "nest_sunblock": 63683,
    "nest_tag": 63681,
    "nest_thermostat": 59023,
    "nest_thermostat_e_eu": 61741,
    "nest_thermostat_gen_3": 61742,
    "nest_thermostat_sensor": 61743,
    "nest_thermostat_sensor_eu": 61744,
    "nest_thermostat_zirconium_eu": 61745,
    "nest_true_radiant": 63684,
    "nest_wake_on_approach": 63685,
    "nest_wake_on_press": 63686,
    "nest_wifi_gale": 61746,
    "nest_wifi_mistral": 61747,
    "nest_wifi_point": 61748,
    "nest_wifi_point_vento": 61748,
    "nest_wifi_pro": 62827,
    "nest_wifi_pro_2": 62826,
    "nest_wifi_router": 61747,
    "network_cell": 57785,
    "network_check": 58944,
    "network_intel_node": 62321,
    "network_intelligence": 61356,
    "network_intelligence_history": 62966,
    "network_intelligence_update": 62965,
    "network_locked": 58906,
    "network_manage": 63403,
    "network_node": 62830,
    "network_ping": 60362,
    "network_wifi": 57786,
    "network_wifi_1_bar": 60388,
    "network_wifi_1_bar_locked": 62863,
    "network_wifi_2_bar": 60374,
    "network_wifi_2_bar_locked": 62862,
    "network_wifi_3_bar": 60385,
    "network_wifi_3_bar_locked": 62861,
    "network_wifi_locked": 62770,
    "neurology": 57614,
    "new_label": 58889,
    "new_releases": 61302,
    "new_window": 63248,
    "news": 57394,
    "newsmode": 61357,
    "newspaper": 60289,
    "newsstand": 59844,
    "next_plan": 61277,
    "next_week": 57706,
    "nfc": 57787,
    "nfc_off": 62313,
    "night_shelter": 61937,
    "night_sight_auto": 61911,
    "night_sight_auto_off": 61945,
    "night_sight_max": 63171,
    "nightlife": 60002,
    "nightlight": 61501,
    "nightlight_round": 61501,
    "nights_stay": 61812,
    "no_accounts": 61502,
    "no_adult_content": 63742,
    "no_backpack": 62007,
    "no_crash": 60400,
    "no_drinks": 61861,
    "no_encryption": 61503,
    "no_encryption_gmailerrorred": 61503,
    "no_flash": 61862,
    "no_food": 61863,
    "no_luggage": 62011,
    "no_meals": 61910,
    "no_meeting_room": 60238,
    "no_photography": 61864,
    "no_sim": 57806,
    "no_sound": 59152,
    "no_stroller": 61871,
    "no_transfer": 61909,
    "noise_aware": 60396,
    "noise_control_off": 60403,
    "noise_control_on": 63656,
    "nordic_walking": 58638,
    "north": 61920,
    "north_east": 61921,
    "north_west": 61922,
    "not_accessible": 61694,
    "not_accessible_forward": 62794,
    "not_interested": 61580,
    "not_listed_location": 58741,
    "not_started": 61649,
    "note": 58989,
    "note_add": 59548,
    "note_alt": 61504,
    "note_stack": 62818,
    "note_stack_add": 62819,
    "notes": 57964,
    "notification_add": 58265,
    "notification_audio": 61121,
    "notification_audio_off": 61120,
    "notification_important": 57348,
    "notification_multiple": 59074,
    "notification_settings": 62311,
    "notification_sound": 62291,
    "notifications": 59381,
    "notifications_active": 59383,
    "notifications_none": 59381,
    "notifications_off": 59382,
    "notifications_paused": 59384,
    "notifications_unread": 62718,
    "numbers": 60103,
    "nutrition": 57616,
    "ods": 59112,
    "odt": 59113,
    "offline_bolt": 59698,
    "offline_pin": 59658,
    "offline_pin_off": 62672,
    "offline_share": 62174,
    "oil_barrel": 60437,
    "okonomiyaki": 62081,
    "on_device_training": 60413,
    "on_hub_device": 59075,
    "oncology": 57620,
    "ondemand_video": 58938,
    "online_prediction": 61675,
    "onsen": 63224,
    "opacity": 59676,
    "open_in_browser": 59549,
    "open_in_full": 61902,
    "open_in_new": 59550,
    "open_in_new_down": 63247,
    "open_in_new_off": 58614,
    "open_in_phone": 62162,
    "open_jam": 61358,
    "open_run": 62647,
    "open_with": 59551,
    "ophthalmology": 57621,
    "oral_disease": 57622,
    "orbit": 62502,
    "order_approve": 63506,
    "order_play": 63505,
    "orders": 60180,
    "orthopedics": 63639,
    "other_admission": 58491,
    "other_houses": 58764,
    "outbound": 57802,
    "outbox": 61279,
    "outbox_alt": 60183,
    "outdoor_garden": 57861,
    "outdoor_grill": 59975,
    "outgoing_mail": 61650,
    "outlet": 61908,
    "outlined_flag": 61638,
    "outpatient": 57624,
    "outpatient_med": 57625,
    "output": 60350,
    "output_circle": 63246,
    "oven": 59847,
    "oven_gen": 59459,
    "overview": 58535,
    "overview_key": 63444,
    "owl": 62388,
    "oxygen_saturation": 58590,
    "p2p": 62762,
    "pace": 63160,
    "pacemaker": 58966,
    "package": 58511,
    "package_2": 62825,
    "padding": 59848,
    "padel": 62119,
    "page_control": 59185,
    "page_footer": 62339,
    "page_header": 62340,
    "page_info": 62996,
    "page_menu_ios": 61179,
    "pageless": 62729,
    "pages": 59385,
    "pageview": 59552,
    "paid": 61505,
    "palette": 58378,
    "pallet": 63594,
    "pan_tool": 59685,
    "pan_tool_alt": 60345,
    "pan_zoom": 63061,
    "panorama": 58379,
    "panorama_fish_eye": 58380,
    "panorama_horizontal": 58381,
    "panorama_photosphere": 59849,
    "panorama_vertical": 58382,
    "panorama_wide_angle": 58383,
    "paragliding": 58639,
    "parent_child_dining": 61997,
    "park": 60003,
    "parking_meter": 62090,
    "parking_sign": 62089,
    "parking_valet": 62088,
    "partly_cloudy_day": 61810,
    "partly_cloudy_night": 61812,
    "partner_exchange": 63481,
    "partner_heart": 61230,
    "partner_reports": 61359,
    "party_mode": 59386,
    "passkey": 63615,
    "passport": 61124,
    "password": 61506,
    "password_2": 62633,
    "password_2_off": 62632,
    "patient_list": 58963,
    "pattern": 61507,
    "pause": 57396,
    "pause_circle": 57762,
    "pause_circle_filled": 57762,
    "pause_circle_outline": 57762,
    "pause_presentation": 57578,
    "payment": 59553,
    "payment_arrow_down": 62144,
    "payment_card": 62113,
    "payments": 61283,
    "pedal_bike": 60201,
    "pediatrics": 57629,
    "pen_size_1": 63317,
    "pen_size_2": 63316,
    "pen_size_3": 63315,
    "pen_size_4": 63314,
    "pen_size_5": 63313,
    "pending": 61284,
    "pending_actions": 61883,
    "pentagon": 60240,
    "people": 59937,
    "people_alt": 59937,
    "people_outline": 59937,
    "percent": 60248,
    "percent_discount": 62020,
    "performance_max": 58650,
    "pergola": 57859,
    "perm_camera_mic": 59554,
    "perm_contact_calendar": 59555,
    "perm_data_setting": 59556,
    "perm_device_information": 62172,
    "perm_identity": 61651,
    "perm_media": 59559,
    "perm_phone_msg": 59560,
    "perm_scan_wifi": 59561,
    "person": 61651,
    "person_2": 63716,
    "person_3": 63717,
    "person_4": 63718,
    "person_add": 59981,
    "person_add_alt": 59981,
    "person_add_disabled": 59851,
    "person_alert": 62823,
    "person_apron": 62883,
    "person_book": 62952,
    "person_cancel": 62822,
    "person_celebrate": 63486,
    "person_check": 62821,
    "person_edit": 62714,
    "person_filled": 61651,
    "person_heart": 62096,
    "person_off": 58640,
    "person_outline": 61651,
    "person_pin": 58714,
    "person_pin_circle": 58730,
    "person_play": 63485,
    "person_raised_hand": 62874,
    "person_remove": 61286,
    "person_search": 61702,
    "person_shield": 58244,
    "person_text": 61117,
    "personal_bag": 60174,
    "personal_bag_off": 60175,
    "personal_bag_question": 60176,
    "personal_injury": 59098,
    "personal_places": 59139,
    "personal_video": 58939,
    "pest_control": 61690,
    "pest_control_rodent": 61693,
    "pet_supplies": 61361,
    "pets": 59677,
    "phishing": 60119,
    "phone": 61652,
    "phone_alt": 61652,
    "phone_android": 62171,
    "phone_bluetooth_speaker": 58907,
    "phone_callback": 58953,
    "phone_cancel": 1048477,
    "phone_disabled": 59852,
    "phone_enabled": 59853,
    "phone_forwarded": 58908,
    "phone_in_talk": 58909,
    "phone_iphone": 62170,
    "phone_locked": 58910,
    "phone_missed": 58911,
    "phone_paused": 58912,
    "phonelink": 58150,
    "phonelink_erase": 62186,
    "phonelink_lock": 62142,
    "phonelink_off": 63397,
    "phonelink_ring": 62184,
    "phonelink_ring_off": 63402,
    "phonelink_setup": 62169,
    "photo": 58418,
    "photo_album": 58385,
    "photo_auto_merge": 62768,
    "photo_camera": 58386,
    "photo_camera_back": 61288,
    "photo_camera_front": 61289,
    "photo_filter": 58427,
    "photo_frame": 61657,
    "photo_library": 58387,
    "photo_prints": 61362,
    "photo_size_select_actual": 58418,
    "photo_size_select_large": 58419,
    "photo_size_select_small": 58420,
    "php": 60303,
    "physical_therapy": 57630,
    "piano": 58657,
    "piano_off": 58656,
    "pickleball": 62118,
    "picture_as_pdf": 58389,
    "picture_in_picture": 59562,
    "picture_in_picture_alt": 59665,
    "picture_in_picture_center": 62800,
    "picture_in_picture_large": 62799,
    "picture_in_picture_medium": 62798,
    "picture_in_picture_mobile": 62743,
    "picture_in_picture_off": 62767,
    "picture_in_picture_small": 62797,
    "pie_chart": 61658,
    "pie_chart_filled": 61658,
    "pie_chart_outline": 61658,
    "pie_chart_outlined": 61658,
    "pill": 57631,
    "pill_off": 63497,
    "pin": 61509,
    "pin_drop": 58718,
    "pin_end": 59239,
    "pin_history": 1048366,
    "pin_invoke": 59235,
    "pin_road": 1048365,
    "pinboard": 62379,
    "pinboard_unread": 62380,
    "pinch": 60216,
    "pinch_zoom_in": 61946,
    "pinch_zoom_out": 61947,
    "pip": 63053,
    "pip_exit": 63245,
    "pivot_table_chart": 59854,
    "place": 61915,
    "place_item": 61936,
    "plagiarism": 59994,
    "plane_contrails": 62124,
    "planet": 62343,
    "planner_banner_ad_pt": 59026,
    "planner_review": 59028,
    "play_arrow": 57399,
    "play_circle": 57796,
    "play_disabled": 61290,
    "play_for_work": 59654,
    "play_lesson": 61511,
    "play_music": 59118,
    "play_pause": 61751,
    "play_shapes": 63484,
    "playground": 62094,
    "playground_2": 62095,
    "playing_cards": 62940,
    "playlist_add": 57403,
    "playlist_add_check": 57445,
    "playlist_add_check_circle": 59366,
    "playlist_add_circle": 59365,
    "playlist_play": 57439,
    "playlist_remove": 60288,
    "plug_connect": 62298,
    "plumbing": 61703,
    "plus_one": 59392,
    "podcasts": 61512,
    "podiatry": 57632,
    "podium": 63483,
    "point_of_sale": 61822,
    "point_scan": 63244,
    "poker_chip": 62619,
    "policy": 59927,
    "policy_alert": 62471,
    "poll": 61644,
    "polyline": 60347,
    "polymer": 59563,
    "pool": 60232,
    "portable_wifi_off": 61575,
    "portrait": 59473,
    "position_bottom_left": 63243,
    "position_bottom_right": 63242,
    "position_top_right": 63241,
    "post": 59141,
    "post_add": 59936,
    "potted_plant": 63658,
    "power": 58940,
    "power_input": 58166,
    "power_off": 58950,
    "power_rounded": 63687,
    "power_settings_circle": 62488,
    "power_settings_new": 63687,
    "prayer_times": 63544,
    "precision_manufacturing": 61513,
    "pregnancy": 62961,
    "pregnant_woman": 62961,
    "preliminary": 59352,
    "prescriptions": 57633,
    "present_to_all": 57567,
    "preview": 61893,
    "preview_off": 63407,
    "price_change": 61514,
    "price_check": 61515,
    "print": 59565,
    "print_add": 63394,
    "print_connect": 63393,
    "print_disabled": 59855,
    "print_error": 63392,
    "print_lock": 63057,
    "priority": 57759,
    "priority_high": 58949,
    "privacy": 61768,
    "privacy_tip": 61660,
    "private_connectivity": 59204,
    "problem": 57634,
    "procedure": 58961,
    "process_chart": 63573,
    "production_quantity_limits": 57809,
    "productivity": 58006,
    "progress_activity": 59856,
    "prompt_suggestion": 62710,
    "propane": 60436,
    "propane_tank": 60435,
    "psychiatry": 57635,
    "psychology": 59978,
    "psychology_alt": 63722,
    "public": 59403,
    "public_off": 61898,
    "publish": 57941,
    "published_with_changes": 62002,
    "pulmonology": 57636,
    "pulse_alert": 62721,
    "punch_clock": 60072,
    "push_pin": 61709,
    "qr_code": 61291,
    "qr_code_2": 57354,
    "qr_code_2_add": 63064,
    "qr_code_scanner": 61958,
    "query_builder": 61398,
    "query_stats": 58620,
    "question_answer": 59567,
    "question_exchange": 63475,
    "question_mark": 60299,
    "queue": 57404,
    "queue_music": 57405,
    "queue_play_next": 57446,
    "quick_phrases": 59345,
    "quick_reference": 58478,
    "quick_reference_all": 63489,
    "quick_reorder": 60181,
    "quickreply": 61292,
    "quiet_time": 61785,
    "quiet_time_active": 60278,
    "quiz": 61516,
    "r_mobiledata": 61517,
    "radar": 61518,
    "radio": 57406,
    "radio_button_checked": 59447,
    "radio_button_partial": 62816,
    "radio_button_unchecked": 59446,
    "radiology": 57637,
    "railway_alert": 59857,
    "railway_alert_2": 62561,
    "rainy": 61814,
    "rainy_heavy": 63007,
    "rainy_light": 63006,
    "rainy_snow": 63005,
    "ramen_dining": 60004,
    "ramp_left": 60316,
    "ramp_right": 60310,
    "range_hood": 57834,
    "rate_review": 58720,
    "rate_review_rtl": 59142,
    "raven": 62805,
    "raw_off": 61519,
    "raw_on": 61520,
    "read_more": 61293,
    "readiness_score": 63197,
    "real_estate_agent": 59194,
    "rear_camera": 63170,
    "rebase": 63557,
    "rebase_edit": 63558,
    "receipt": 59568,
    "receipt_long": 61294,
    "receipt_long_off": 62474,
    "recent_actors": 57407,
    "recent_patient": 63496,
    "recenter": 62656,
    "recommend": 59858,
    "record_voice_over": 59679,
    "rectangle": 60244,
    "rectangle_add": 61128,
    "recycling": 59232,
    "redeem": 59638,
    "redo": 57690,
    "reduce_capacity": 61980,
    "refresh": 58837,
    "regular_expression": 63312,
    "relax": 63196,
    "release_alert": 63060,
    "remember_me": 61521,
    "reminder": 59078,
    "reminders_alt": 59078,
    "remote_gen": 59454,
    "remove": 57691,
    "remove_circle": 61583,
    "remove_circle_outline": 61583,
    "remove_done": 59859,
    "remove_from_queue": 57447,
    "remove_moderator": 59860,
    "remove_red_eye": 59636,
    "remove_road": 60412,
    "remove_selection": 59861,
    "remove_shopping_cart": 59688,
    "reopen_window": 63240,
    "reorder": 59646,
    "repartition": 63720,
    "repeat": 57408,
    "repeat_on": 59862,
    "repeat_one": 57409,
    "repeat_one_on": 59863,
    "replace_audio": 62545,
    "replace_image": 62544,
    "replace_video": 62543,
    "replay": 57410,
    "replay_10": 57433,
    "replay_30": 57434,
    "replay_5": 57435,
    "replay_circle_filled": 59864,
    "reply": 57694,
    "reply_all": 57695,
    "report": 61522,
    "report_gmailerrorred": 61522,
    "report_off": 57712,
    "report_problem": 61571,
    "request_page": 61996,
    "request_quote": 61878,
    "reset_brightness": 62594,
    "reset_exposure": 62054,
    "reset_focus": 62593,
    "reset_image": 63524,
    "reset_iso": 62592,
    "reset_settings": 62591,
    "reset_shadow": 62590,
    "reset_shutter_speed": 62589,
    "reset_tv": 59865,
    "reset_white_balance": 62588,
    "reset_wrench": 62828,
    "resize": 63239,
    "resize_window": 1048473,
    "respiratory_rate": 57639,
    "responsive_layout": 59866,
    "rest_area": 61994,
    "restart_alt": 61523,
    "restaurant": 58732,
    "restaurant_menu": 58721,
    "restore": 59571,
    "restore_from_trash": 59704,
    "restore_page": 59689,
    "resume": 63440,
    "reviews": 61564,
    "rewarded_ads": 61366,
    "rheumatology": 57640,
    "rib_cage": 63640,
    "rice_bowl": 61941,
    "right_click": 63238,
    "right_panel_close": 63237,
    "right_panel_open": 63236,
    "ring_volume": 61661,
    "ring_volume_filled": 61661,
    "ripples": 59867,
    "road": 62578,
    "robot": 63618,
    "robot_2": 62928,
    "rocket": 60325,
    "rocket_launch": 60315,
    "roller_shades": 60434,
    "roller_shades_closed": 60433,
    "roller_skating": 60365,
    "roofing": 61953,
    "room": 61915,
    "room_preferences": 61880,
    "room_service": 60233,
    "rotate_90_degrees_ccw": 58392,
    "rotate_90_degrees_cw": 60075,
    "rotate_auto": 62487,
    "rotate_left": 58393,
    "rotate_right": 58394,
    "roundabout_left": 60313,
    "roundabout_right": 60323,
    "rounded_corner": 59680,
    "route": 60109,
    "router": 58152,
    "router_off": 62196,
    "routine": 57868,
    "rowing": 59681,
    "rss_feed": 57573,
    "rsvp": 61525,
    "rtt": 59821,
    "rubric": 60199,
    "rule": 61890,
    "rule_folder": 61897,
    "rule_settings": 63052,
    "run_circle": 61295,
    "running_with_errors": 58653,
    "rv_hookup": 58946,
    "safety_check": 60399,
    "safety_check_off": 62877,
    "safety_divider": 57804,
    "sailing": 58626,
    "salinity": 63606,
    "sanitizer": 61981,
    "satellite": 58722,
    "satellite_alt": 60218,
    "sauna": 63223,
    "save": 57697,
    "save_alt": 61584,
    "save_as": 60256,
    "save_clock": 62360,
    "saved_search": 59921,
    "savings": 58091,
    "scale": 60255,
    "scan": 63310,
    "scan_delete": 63311,
    "scanner": 58153,
    "scatter_plot": 57960,
    "scene": 58023,
    "schedule": 61398,
    "schedule_send": 59914,
    "schema": 58621,
    "school": 59404,
    "science": 59979,
    "science_off": 62786,
    "scooter": 62577,
    "score": 57961,
    "scoreboard": 60368,
    "screen_lock_landscape": 62168,
    "screen_lock_portrait": 62142,
    "screen_lock_rotation": 62166,
    "screen_record": 63097,
    "screen_rotation": 62165,
    "screen_rotation_alt": 60398,
    "screen_rotation_up": 63096,
    "screen_search_desktop": 61296,
    "screen_share": 57570,
    "screenshot": 61526,
    "screenshot_frame": 63095,
    "screenshot_frame_2": 62324,
    "screenshot_keyboard": 63443,
    "screenshot_monitor": 60424,
    "screenshot_region": 63442,
    "screenshot_tablet": 63127,
    "script": 62559,
    "scrollable_header": 59868,
    "scuba_diving": 60366,
    "sd": 59869,
    "sd_card": 58915,
    "sd_card_alert": 61527,
    "sd_storage": 58915,
    "sdk": 59168,
    "search": 59574,
    "search_activity": 62437,
    "search_check": 63488,
    "search_check_2": 62569,
    "search_gear": 61178,
    "search_hands_free": 59030,
    "search_insights": 62652,
    "search_off": 60022,
    "seat_cool_left": 62257,
    "seat_cool_right": 62256,
    "seat_heat_left": 62255,
    "seat_heat_right": 62254,
    "seat_vent_left": 62253,
    "seat_vent_right": 62252,
    "security": 58154,
    "security_key": 62723,
    "security_update": 62157,
    "security_update_good": 61555,
    "security_update_warning": 62163,
    "segment": 59723,
    "select": 63309,
    "select_all": 57698,
    "select_check_box": 61950,
    "select_to_speak": 63439,
    "select_window": 59130,
    "select_window_2": 62664,
    "select_window_off": 58630,
    "self_care": 63597,
    "self_improvement": 60024,
    "sell": 61531,
    "sell_cloud": 1048443,
    "send": 57699,
    "send_and_archive": 59916,
    "send_money": 59575,
    "send_time_extension": 60123,
    "send_to_mobile": 62162,
    "sensor_door": 61877,
    "sensor_occupied": 60432,
    "sensor_window": 61876,
    "sensors": 58654,
    "sensors_krx": 62806,
    "sensors_krx_off": 62741,
    "sensors_off": 58655,
    "sentiment_calm": 63143,
    "sentiment_content": 63142,
    "sentiment_dissatisfied": 59409,
    "sentiment_excited": 63141,
    "sentiment_extremely_dissatisfied": 61844,
    "sentiment_frustrated": 63140,
    "sentiment_neutral": 59410,
    "sentiment_sad": 63139,
    "sentiment_satisfied": 59411,
    "sentiment_satisfied_alt": 59411,
    "sentiment_stressed": 63138,
    "sentiment_very_dissatisfied": 59412,
    "sentiment_very_satisfied": 59413,
    "sentiment_worried": 63137,
    "serif": 62636,
    "server_person": 62397,
    "service_toolbox": 59159,
    "set_meal": 61930,
    "settings": 59576,
    "settings_accessibility": 61533,
    "settings_account_box": 63541,
    "settings_alert": 61763,
    "settings_applications": 59577,
    "settings_b_roll": 63013,
    "settings_backup_restore": 59578,
    "settings_bluetooth": 59579,
    "settings_brightness": 59581,
    "settings_cell": 62161,
    "settings_cinematic_blur": 63012,
    "settings_ethernet": 59582,
    "settings_heart": 62754,
    "settings_input_antenna": 59583,
    "settings_input_component": 59585,
    "settings_input_composite": 59585,
    "settings_input_hdmi": 59586,
    "settings_input_svideo": 59587,
    "settings_motion_mode": 63539,
    "settings_night_sight": 63538,
    "settings_overscan": 59588,
    "settings_panorama": 63537,
    "settings_phone": 59589,
    "settings_photo_camera": 63540,
    "settings_power": 59590,
    "settings_remote": 59591,
    "settings_seating": 61229,
    "settings_slow_motion": 63011,
    "settings_suggest": 61534,
    "settings_system_daydream": 57795,
    "settings_timelapse": 63010,
    "settings_video_camera": 63009,
    "settings_voice": 59592,
    "settop_component": 58028,
    "severe_cold": 60371,
    "shades": 1048435,
    "shades_closed": 1048436,
    "shadow": 59871,
    "shadow_add": 62852,
    "shadow_minus": 62851,
    "shape_line": 63699,
    "shape_recognition": 60161,
    "shapes": 58882,
    "share": 59405,
    "share_eta": 58871,
    "share_location": 61535,
    "share_off": 63179,
    "share_reviews": 63652,
    "share_windows": 62995,
    "shaved_ice": 61989,
    "sheets_rtl": 63523,
    "shelf_auto_hide": 63235,
    "shelf_position": 63234,
    "shelves": 63598,
    "shield": 59872,
    "shield_card": 1048368,
    "shield_lock": 63110,
    "shield_locked": 62866,
    "shield_moon": 60073,
    "shield_person": 63056,
    "shield_question": 62761,
    "shield_radar": 1048367,
    "shield_toggle": 62125,
    "shield_watch": 62223,
    "shield_with_heart": 59279,
    "shield_with_house": 59277,
    "shift": 58866,
    "shift_lock": 63406,
    "shift_lock_off": 62595,
    "shoe_cleats": 1048499,
    "shop": 59593,
    "shop_2": 59594,
    "shop_two": 59594,
    "shopping_bag": 61900,
    "shopping_bag_speed": 62362,
    "shopping_basket": 59595,
    "shopping_cart": 59596,
    "shopping_cart_checkout": 60296,
    "shopping_cart_off": 62711,
    "shoppingmode": 61367,
    "short_stay": 58576,
    "short_text": 57953,
    "shortcut": 62842,
    "show_chart": 59105,
    "shower": 61537,
    "shuffle": 57411,
    "shuffle_on": 59873,
    "shutter_speed": 58429,
    "shutter_speed_add": 62846,
    "shutter_speed_minus": 62845,
    "sick": 61984,
    "side_navigation": 59874,
    "sign_language": 60389,
    "sign_language_2": 62040,
    "signal_cellular_0_bar": 61608,
    "signal_cellular_1_bar": 61609,
    "signal_cellular_2_bar": 61610,
    "signal_cellular_3_bar": 61611,
    "signal_cellular_4_bar": 57800,
    "signal_cellular_add": 63401,
    "signal_cellular_alt": 57858,
    "signal_cellular_alt_1_bar": 60383,
    "signal_cellular_alt_2_bar": 60387,
    "signal_cellular_alt_off": 1048458,
    "signal_cellular_connected_no_internet_0_bar": 61612,
    "signal_cellular_connected_no_internet_4_bar": 57805,
    "signal_cellular_no_sim": 57806,
    "signal_cellular_nodata": 61538,
    "signal_cellular_null": 57807,
    "signal_cellular_off": 57808,
    "signal_cellular_pause": 62887,
    "signal_disconnected": 62009,
    "signal_wifi_0_bar": 61616,
    "signal_wifi_4_bar": 61541,
    "signal_wifi_4_bar_lock": 57825,
    "signal_wifi_bad": 61540,
    "signal_wifi_connected_no_internet_4": 61540,
    "signal_wifi_off": 57818,
    "signal_wifi_statusbar_4_bar": 61541,
    "signal_wifi_statusbar_not_connected": 61679,
    "signal_wifi_statusbar_null": 61543,
    "signature": 63308,
    "signpost": 60305,
    "sim_card": 58155,
    "sim_card_alert": 61527,
    "sim_card_download": 61544,
    "simulation": 62433,
    "single_bed": 59976,
    "sip": 61545,
    "siren": 62375,
    "siren_check": 62374,
    "siren_open": 62373,
    "siren_question": 62372,
    "skateboarding": 58641,
    "skeleton": 63641,
    "skillet": 62787,
    "skillet_cooktop": 62788,
    "skip_next": 57412,
    "skip_previous": 57413,
    "skull": 63642,
    "skull_list": 62320,
    "slab_serif": 62635,
    "sledding": 58642,
    "sleep": 57875,
    "sleep_score": 63159,
    "slide_library": 63522,
    "sliders": 59875,
    "slideshow": 58395,
    "slow_motion_video": 57448,
    "smart_button": 61889,
    "smart_card_reader": 62629,
    "smart_card_reader_off": 62630,
    "smart_display": 61546,
    "smart_outlet": 59460,
    "smart_screen": 62160,
    "smart_toy": 61548,
    "smartphone": 59322,
    "smartphone_camera": 62542,
    "smb_share": 63307,
    "smoke_free": 60234,
    "smoking_rooms": 60235,
    "sms": 58917,
    "sms_failed": 59519,
    "snippet_folder": 61895,
    "snooze": 57414,
    "snowboarding": 58643,
    "snowflake": 60763,
    "snowing": 59407,
    "snowing_heavy": 63004,
    "snowmobile": 58627,
    "snowshoeing": 58644,
    "soap": 61874,
    "soba": 61238,
    "social_distance": 57803,
    "social_leaderboard": 63136,
    "solar_power": 60431,
    "solo_dining": 61237,
    "sort": 57700,
    "sort_by_alpha": 57427,
    "sos": 60407,
    "sound_detection_dog_barking": 61769,
    "sound_detection_glass_break": 61770,
    "sound_detection_loud_sound": 61771,
    "sound_sampler": 63156,
    "soundbar": 1048434,
    "soup_kitchen": 59347,
    "source": 61896,
    "source_environment": 58663,
    "source_notes": 57645,
    "south": 61923,
    "south_america": 59364,
    "south_east": 61924,
    "south_west": 61925,
    "spa": 60236,
    "space_bar": 57942,
    "space_dashboard": 58987,
    "space_dashboard_2": 1048460,
    "spatial_audio": 60395,
    "spatial_audio_off": 60392,
    "spatial_speaker": 62671,
    "spatial_tracking": 60394,
    "speaker": 58157,
    "speaker_2": 1048433,
    "speaker_group": 58158,
    "speaker_notes": 59597,
    "speaker_notes_off": 59690,
    "speaker_phone": 57554,
    "special_character": 63306,
    "specific_gravity": 63602,
    "speech_to_text": 63655,
    "speed": 59876,
    "speed_0_25": 62676,
    "speed_0_2x": 62616,
    "speed_0_5": 62690,
    "speed_0_5x": 62615,
    "speed_0_75": 62675,
    "speed_0_7x": 62614,
    "speed_1_2": 62689,
    "speed_1_25": 62674,
    "speed_1_2x": 62613,
    "speed_1_5": 62688,
    "speed_1_5x": 62612,
    "speed_1_75": 62673,
    "speed_1_7x": 62611,
    "speed_2": 1048376,
    "speed_2x": 62699,
    "speed_3": 1048375,
    "speed_4": 1048374,
    "speed_camera": 62576,
    "spellcheck": 59598,
    "split_scene": 62399,
    "split_scene_down": 62207,
    "split_scene_left": 62206,
    "split_scene_right": 62205,
    "split_scene_up": 62204,
    "splitscreen": 61549,
    "splitscreen_add": 62717,
    "splitscreen_bottom": 63094,
    "splitscreen_landscape": 62553,
    "splitscreen_landscape_add": 1048506,
    "splitscreen_left": 63093,
    "splitscreen_portrait": 62552,
    "splitscreen_right": 63092,
    "splitscreen_top": 63091,
    "splitscreen_vertical_add": 62716,
    "spo2": 63195,
    "spoke": 59815,
    "sports": 59952,
    "sports_and_outdoors": 61368,
    "sports_bar": 61939,
    "sports_baseball": 59985,
    "sports_basketball": 59942,
    "sports_cricket": 59943,
    "sports_esports": 59944,
    "sports_football": 59945,
    "sports_golf": 59946,
    "sports_gymnastics": 60356,
    "sports_handball": 59955,
    "sports_hockey": 59947,
    "sports_kabaddi": 59956,
    "sports_martial_arts": 60137,
    "sports_mma": 59948,
    "sports_motorsports": 59949,
    "sports_rugby": 59950,
    "sports_score": 61550,
    "sports_soccer": 59951,
    "sports_tennis": 59954,
    "sports_volleyball": 59953,
    "sprinkler": 58010,
    "sprint": 63519,
    "sql": 1048469,
    "square": 60214,
    "square_circle": 61127,
    "square_dot": 62387,
    "square_foot": 59977,
    "ssid_chart": 60262,
    "stack": 62985,
    "stack_group": 62297,
    "stack_hexagon": 62492,
    "stack_off": 62984,
    "stack_star": 62983,
    "stacked_bar_chart": 59878,
    "stacked_email": 59079,
    "stacked_inbox": 59081,
    "stacked_line_chart": 61995,
    "stacks": 62720,
    "stadia_controller": 61749,
    "stadium": 60304,
    "stairs": 61865,
    "stairs_2": 62572,
    "star": 61594,
    "star_border": 61594,
    "star_border_purple500": 61594,
    "star_half": 59449,
    "star_outline": 61594,
    "star_purple500": 61594,
    "star_rate": 61676,
    "star_rate_half": 60485,
    "star_shine": 62237,
    "stars": 59600,
    "stars_2": 62236,
    "start": 57481,
    "stat_0": 59031,
    "stat_1": 59032,
    "stat_2": 59033,
    "stat_3": 59034,
    "stat_minus_1": 59035,
    "stat_minus_2": 59036,
    "stat_minus_3": 59037,
    "stay_current_landscape": 60734,
    "stay_current_portrait": 59322,
    "stay_primary_landscape": 60734,
    "stay_primary_portrait": 62163,
    "steering_wheel_heat": 62251,
    "step": 63230,
    "step_into": 63233,
    "step_out": 63232,
    "step_over": 63231,
    "steppers": 59879,
    "steps": 63194,
    "stethoscope": 63493,
    "stethoscope_arrow": 63495,
    "stethoscope_check": 63494,
    "sticker": 59143,
    "sticker_add": 61122,
    "sticky_note": 59880,
    "sticky_note_2": 61948,
    "stock_media": 62832,
    "stockpot": 62789,
    "stop": 57415,
    "stop_circle": 61297,
    "stop_screen_share": 57571,
    "storage": 57819,
    "store": 59601,
    "store_mall_directory": 59601,
    "storefront": 59922,
    "storm": 61552,
    "straight": 60309,
    "straighten": 58396,
    "strategy": 62943,
    "stream": 59881,
    "stream_apps": 63391,
    "streetview": 58734,
    "stress_management": 63193,
    "strikethrough_s": 57943,
    "stroke_full": 63305,
    "stroke_partial": 63304,
    "stroller": 61870,
    "style": 58397,
    "styler": 57971,
    "stylus": 62980,
    "stylus_brush": 62310,
    "stylus_fountain_pen": 62309,
    "stylus_highlighter": 62308,
    "stylus_laser_pointer": 63303,
    "stylus_note": 62979,
    "stylus_pen": 62307,
    "stylus_pencil": 62306,
    "subdirectory_arrow_left": 58841,
    "subdirectory_arrow_right": 58842,
    "subheader": 59882,
    "subject": 59602,
    "subscript": 61713,
    "subscriptions": 57444,
    "subtitles": 57416,
    "subtitles_gear": 62293,
    "subtitles_off": 61298,
    "subway": 58735,
    "subway_walk": 62087,
    "subwoofer": 1048432,
    "summarize": 61553,
    "sunny": 59418,
    "sunny_snowing": 59417,
    "superscript": 61714,
    "supervised_user_circle": 59705,
    "supervised_user_circle_off": 62990,
    "supervisor_account": 59603,
    "support": 61299,
    "support_agent": 61666,
    "surfing": 58645,
    "surgical": 57649,
    "surround_sound": 57417,
    "swap_calls": 57559,
    "swap_driving_apps": 59038,
    "swap_driving_apps_wheel": 59039,
    "swap_horiz": 59604,
    "swap_horizontal_circle": 59699,
    "swap_vert": 59605,
    "swap_vertical_circle": 59606,
    "sweep": 59052,
    "swipe": 59884,
    "swipe_down": 60243,
    "swipe_down_alt": 60208,
    "swipe_left": 60249,
    "swipe_left_2": 1048468,
    "swipe_left_alt": 60211,
    "swipe_right": 60242,
    "swipe_right_2": 1048467,
    "swipe_right_alt": 60246,
    "swipe_up": 60206,
    "swipe_up_alt": 60213,
    "swipe_vertical": 60241,
    "switch": 57844,
    "switch_access": 63229,
    "switch_access_2": 62726,
    "switch_access_3": 62285,
    "switch_access_shortcut": 59361,
    "switch_access_shortcut_add": 59362,
    "switch_account": 59885,
    "switch_camera": 58398,
    "switch_left": 61905,
    "switch_off": 1048431,
    "switch_right": 61906,
    "switch_video": 58399,
    "switches": 59187,
    "sword_rose": 62942,
    "swords": 63625,
    "symptoms": 57650,
    "synagogue": 60080,
    "sync": 58919,
    "sync_alt": 59928,
    "sync_arrow_down": 62332,
    "sync_arrow_up": 62331,
    "sync_desktop": 62490,
    "sync_disabled": 58920,
    "sync_lock": 60142,
    "sync_problem": 58921,
    "sync_saved_locally": 63520,
    "sync_saved_locally_off": 62052,
    "syringe": 57651,
    "system_security_update": 62157,
    "system_security_update_good": 61555,
    "system_security_update_warning": 62163,
    "system_update": 62157,
    "system_update_alt": 59607,
    "tab": 59608,
    "tab_close": 63301,
    "tab_close_inactive": 62416,
    "tab_close_right": 63302,
    "tab_duplicate": 63300,
    "tab_group": 63299,
    "tab_inactive": 62523,
    "tab_move": 63298,
    "tab_new_right": 63297,
    "tab_recent": 63296,
    "tab_search": 62194,
    "tab_unselected": 59609,
    "table": 61841,
    "table_bar": 60114,
    "table_chart": 57957,
    "table_chart_view": 63215,
    "table_convert": 62407,
    "table_edit": 62406,
    "table_eye": 62566,
    "table_lamp": 57842,
    "table_large": 62105,
    "table_restaurant": 60102,
    "table_rows": 61697,
    "table_rows_narrow": 63295,
    "table_sign": 61228,
    "table_view": 61886,
    "tablet": 58159,
    "tablet_android": 58160,
    "tablet_camera": 62541,
    "tablet_mac": 58161,
    "tabs": 59886,
    "tactic": 62820,
    "tag": 59887,
    "tag_faces": 59938,
    "takeout_dining": 60020,
    "takeout_dining_2": 61236,
    "tamper_detection_off": 59438,
    "tamper_detection_on": 63688,
    "tap_and_play": 62156,
    "tapas": 61929,
    "target": 59161,
    "task": 61557,
    "task_alt": 58086,
    "tatami_seat": 61235,
    "taunt": 63135,
    "taxi_alert": 61300,
    "team_dashboard": 57363,
    "temp_preferences_custom": 63689,
    "temp_preferences_eco": 63690,
    "temple_buddhist": 60083,
    "temple_hindu": 60079,
    "tenancy": 61667,
    "terminal": 60302,
    "terminal_2": 1048462,
    "terrain": 58724,
    "text_ad": 59176,
    "text_ad_off": 1048466,
    "text_compare": 62405,
    "text_decrease": 60125,
    "text_fields": 57954,
    "text_fields_alt": 59889,
    "text_format": 57701,
    "text_increase": 60130,
    "text_rotate_up": 59706,
    "text_rotate_vertical": 59707,
    "text_rotation_angledown": 59708,
    "text_rotation_angleup": 59709,
    "text_rotation_down": 59710,
    "text_rotation_none": 59711,
    "text_select_end": 63294,
    "text_select_jump_to_beginning": 63293,
    "text_select_jump_to_end": 63292,
    "text_select_move_back_character": 63291,
    "text_select_move_back_word": 63290,
    "text_select_move_down": 63289,
    "text_select_move_forward_character": 63288,
    "text_select_move_forward_word": 63287,
    "text_select_move_up": 63286,
    "text_select_start": 63285,
    "text_snippet": 61894,
    "text_to_speech": 61884,
    "text_up": 62622,
    "textsms": 58917,
    "texture": 58401,
    "texture_add": 62844,
    "texture_minus": 62843,
    "theater_comedy": 60006,
    "theaters": 59610,
    "thermometer": 59462,
    "thermometer_add": 62850,
    "thermometer_alert": 1048571,
    "thermometer_gain": 63192,
    "thermometer_loss": 63191,
    "thermometer_minus": 62849,
    "thermostat": 61558,
    "thermostat_arrow_down": 62330,
    "thermostat_arrow_up": 62329,
    "thermostat_auto": 61559,
    "thermostat_carbon": 61816,
    "things_to_do": 60202,
    "thread_unread": 62713,
    "threat_intelligence": 60141,
    "thumb_down": 62840,
    "thumb_down_alt": 62840,
    "thumb_down_filled": 62840,
    "thumb_down_off": 62840,
    "thumb_down_off_alt": 62840,
    "thumb_up": 62839,
    "thumb_up_alt": 62839,
    "thumb_up_filled": 62839,
    "thumb_up_off": 62839,
    "thumb_up_off_alt": 62839,
    "thumbnail_bar": 63284,
    "thumbs_up_double": 61180,
    "thumbs_up_down": 59613,
    "thunderstorm": 60379,
    "tibia": 63643,
    "tibia_alt": 63644,
    "tile_large": 62403,
    "tile_medium": 62402,
    "tile_small": 62401,
    "tilt_arrow_down": 1048358,
    "tilt_arrow_up": 1048357,
    "time_auto": 61668,
    "time_to_leave": 61431,
    "timelapse": 58402,
    "timeline": 59682,
    "timer": 58405,
    "timer_1": 62127,
    "timer_10": 58403,
    "timer_10_alt_1": 61375,
    "timer_10_select": 61562,
    "timer_2": 62126,
    "timer_3": 58404,
    "timer_3_alt_1": 61376,
    "timer_3_select": 61563,
    "timer_5": 62641,
    "timer_5_shutter": 62642,
    "timer_arrow_down": 62328,
    "timer_arrow_up": 62327,
    "timer_off": 58406,
    "timer_pause": 62651,
    "timer_play": 62650,
    "tips_and_updates": 59290,
    "tire_repair": 60360,
    "title": 57956,
    "titlecase": 62601,
    "toast": 61377,
    "toc": 59614,
    "today": 59615,
    "toggle_off": 59893,
    "toggle_on": 59894,
    "token": 59941,
    "toll": 59616,
    "tonality": 58407,
    "tonality_2": 62132,
    "toolbar": 59895,
    "tools_flat_head": 63691,
    "tools_installation_kit": 58027,
    "tools_ladder": 58059,
    "tools_level": 59259,
    "tools_phillips": 63692,
    "tools_pliers_wire_stripper": 58026,
    "tools_power_drill": 57833,
    "tools_wrench": 63693,
    "tooltip": 59896,
    "tooltip_2": 62445,
    "top_panel_close": 63283,
    "top_panel_open": 63282,
    "topic": 61896,
    "tornado": 57753,
    "total_dissolved_solids": 63607,
    "touch_app": 59667,
    "touch_double": 62347,
    "touch_double_2": 1048373,
    "touch_long": 62346,
    "touch_triple": 62345,
    "touchpad_mouse": 63111,
    "touchpad_mouse_off": 62694,
    "tour": 61301,
    "toys": 58162,
    "toys_and_games": 61378,
    "toys_fan": 63623,
    "track_changes": 59617,
    "trackpad_input": 62663,
    "trackpad_input_2": 62473,
    "trackpad_input_3": 62472,
    "traffic": 58725,
    "traffic_jam": 62575,
    "trail_length": 60254,
    "trail_length_medium": 60259,
    "trail_length_short": 60269,
    "train": 58736,
    "tram": 58737,
    "transcribe": 63724,
    "transfer_within_a_station": 58738,
    "transform": 58408,
    "transgender": 58765,
    "transit_enterexit": 58745,
    "transit_ticket": 62449,
    "transition_chop": 62734,
    "transition_dissolve": 62733,
    "transition_fade": 62732,
    "transition_push": 62731,
    "transition_slide": 62730,
    "translate": 59618,
    "translate_indic": 62051,
    "transportation": 57885,
    "travel": 61331,
    "travel_explore": 58075,
    "travel_luggage_and_bags": 61379,
    "trending_down": 59619,
    "trending_flat": 59620,
    "trending_up": 59621,
    "triangle_circle": 61126,
    "trip": 59131,
    "trip_origin": 58747,
    "trolley": 63595,
    "trolley_cable_car": 62574,
    "trophy": 59939,
    "troubleshoot": 57810,
    "try": 61564,
    "tsunami": 60376,
    "tsv": 59094,
    "tty": 61866,
    "tune": 58409,
    "tungsten": 61565,
    "turn_left": 60326,
    "turn_right": 60331,
    "turn_sharp_left": 60327,
    "turn_sharp_right": 60330,
    "turn_slight_left": 60324,
    "turn_slight_right": 60314,
    "turned_in": 59623,
    "turned_in_not": 59623,
    "tv": 58939,
    "tv_displays": 62444,
    "tv_gen": 59440,
    "tv_guide": 57820,
    "tv_next": 62443,
    "tv_off": 58951,
    "tv_options_edit_channels": 57821,
    "tv_options_input_settings": 57822,
    "tv_remote": 62937,
    "tv_signin": 59163,
    "tv_with_assistant": 59269,
    "two_pager": 62751,
    "two_pager_store": 62404,
    "two_wheeler": 59897,
    "type_specimen": 63728,
    "u_turn_left": 60321,
    "u_turn_right": 60322,
    "udon": 61234,
    "ulna_radius": 63645,
    "ulna_radius_alt": 63646,
    "umbrella": 61869,
    "unarchive": 57705,
    "undereye": 61105,
    "undo": 57702,
    "unfold_less": 58838,
    "unfold_less_double": 63695,
    "unfold_more": 58839,
    "unfold_more_double": 63696,
    "ungroup": 63281,
    "universal_currency": 59898,
    "universal_currency_alt": 59188,
    "universal_local": 59899,
    "unknown_2": 62623,
    "unknown_5": 59045,
    "unknown_7": 62622,
    "unknown_document": 63492,
    "unknown_med": 60093,
    "unlicense": 60165,
    "unpaved_road": 62573,
    "unpin": 59129,
    "unpublished": 62006,
    "unsubscribe": 57579,
    "upcoming": 61566,
    "update": 59683,
    "update_disabled": 57461,
    "upgrade": 61691,
    "upi_pay": 62415,
    "upload": 61595,
    "upload_2": 62753,
    "upload_file": 59900,
    "uppercase": 62600,
    "urology": 57655,
    "usb": 57824,
    "usb_off": 58618,
    "user_attributes": 59144,
    "vaccines": 57656,
    "vacuum": 61381,
    "vacuum_2": 1048429,
    "vacuum_2_on": 1048430,
    "valve": 57892,
    "vape_free": 60358,
    "vaping_rooms": 60367,
    "variable_add": 62750,
    "variable_insert": 62749,
    "variable_remove": 62748,
    "variables": 63569,
    "ventilator": 57657,
    "verified": 61302,
    "verified_off": 62222,
    "verified_user": 61459,
    "vertical_align_bottom": 57944,
    "vertical_align_center": 57945,
    "vertical_align_top": 57946,
    "vertical_distribute": 57462,
    "vertical_shades": 60430,
    "vertical_shades_closed": 60429,
    "vertical_split": 59721,
    "vibration": 62155,
    "video_call": 57456,
    "video_camera_back": 61567,
    "video_camera_back_add": 62476,
    "video_camera_front": 61568,
    "video_camera_front_off": 63547,
    "video_chat": 63648,
    "video_file": 60295,
    "video_frame_copy": 1048333,
    "video_frame_save": 1048332,
    "video_label": 57457,
    "video_library": 57418,
    "video_search": 61382,
    "video_settings": 60021,
    "video_stable": 61569,
    "video_template": 1048531,
    "videocam": 57419,
    "videocam_alert": 62352,
    "videocam_off": 57420,
    "videogame_asset": 58168,
    "videogame_asset_off": 58624,
    "view_agenda": 59625,
    "view_apps": 62326,
    "view_array": 59626,
    "view_carousel": 59627,
    "view_column": 59628,
    "view_column_2": 63559,
    "view_comfy": 58410,
    "view_comfy_alt": 60275,
    "view_compact": 58411,
    "view_compact_alt": 60276,
    "view_cozy": 60277,
    "view_day": 59629,
    "view_headline": 59630,
    "view_in_ar": 61385,
    "view_in_ar_new": 61385,
    "view_in_ar_off": 63003,
    "view_kanban": 60287,
    "view_list": 59631,
    "view_module": 59632,
    "view_object_track": 62514,
    "view_quilt": 59633,
    "view_real_size": 62658,
    "view_sidebar": 61716,
    "view_stream": 59634,
    "view_timeline": 60293,
    "view_week": 59635,
    "vignette": 58421,
    "vignette_2": 62131,
    "villa": 58758,
    "visibility": 59636,
    "visibility_lock": 63059,
    "visibility_off": 59637,
    "vital_signs": 58960,
    "vitals": 57659,
    "vo2_max": 62634,
    "voice_chat": 58926,
    "voice_chat_off": 61118,
    "voice_over_off": 59722,
    "voice_selection": 62858,
    "voice_selection_off": 62508,
    "voicemail": 57561,
    "voicemail_2": 62290,
    "volcano": 60378,
    "volume_down": 57421,
    "volume_down_alt": 59292,
    "volume_mute": 57422,
    "volume_off": 57423,
    "volume_up": 57424,
    "volunteer_activism": 60016,
    "voting_chip": 63570,
    "vpn_key": 57562,
    "vpn_key_alert": 63180,
    "vpn_key_off": 60282,
    "vpn_lock": 58927,
    "vpn_lock_2": 62288,
    "vr180_create2d": 61386,
    "vr180_create2d_off": 62833,
    "vrpano": 61570,
    "walk_bike": 1048321,
    "wall_art": 61387,
    "wall_lamp": 58036,
    "wallet": 63743,
    "wallpaper": 57788,
    "wallpaper_slideshow": 63090,
    "wand_shine": 62239,
    "wand_stars": 62238,
    "ward": 57660,
    "warehouse": 60344,
    "warning": 61571,
    "warning_amber": 61571,
    "warning_off": 63405,
    "wash": 61873,
    "washoku": 62080,
    "watch": 58164,
    "watch_alert": 1048529,
    "watch_arrow": 62154,
    "watch_arrow_down": 1048527,
    "watch_button": 1048352,
    "watch_button_press": 63146,
    "watch_check": 62568,
    "watch_later": 61398,
    "watch_lock": 61161,
    "watch_off": 60131,
    "watch_screentime": 63150,
    "watch_vibration": 62567,
    "watch_wake": 63145,
    "water": 61572,
    "water_bottle": 63133,
    "water_bottle_large": 63134,
    "water_damage": 61955,
    "water_do": 63600,
    "water_drop": 59288,
    "water_drops": 1048485,
    "water_ec": 63605,
    "water_full": 63190,
    "water_heater": 57988,
    "water_lock": 63149,
    "water_loss": 63189,
    "water_lux": 63604,
    "water_medium": 63188,
    "water_orp": 63608,
    "water_ph": 63610,
    "water_pump": 62936,
    "water_voc": 63611,
    "waterfall_chart": 59904,
    "waves": 57718,
    "waving_hand": 59238,
    "wb_auto": 58412,
    "wb_cloudy": 61788,
    "wb_incandescent": 58414,
    "wb_iridescent": 61565,
    "wb_shade": 59905,
    "wb_sunny": 58416,
    "wb_twilight": 57798,
    "wb_twilight_2": 1048351,
    "wc": 58941,
    "weather_hail": 63103,
    "weather_mix": 62987,
    "weather_snowy": 58061,
    "web": 57425,
    "web_asset": 57449,
    "web_asset_off": 61255,
    "web_stories": 58773,
    "web_traffic": 59907,
    "webhook": 60306,
    "weekend": 57707,
    "weight": 57661,
    "west": 61926,
    "whatshot": 59406,
    "wheat": 1048484,
    "wheelchair_pickup": 61867,
    "where_to_vote": 57719,
    "widget_medium": 62394,
    "widget_menu": 61111,
    "widget_small": 62393,
    "widget_width": 62392,
    "widgets": 57789,
    "width": 63280,
    "width_full": 63733,
    "width_normal": 63734,
    "width_wide": 63735,
    "wifi": 58942,
    "wifi_1_bar": 58570,
    "wifi_2_bar": 58585,
    "wifi_add": 63400,
    "wifi_calling": 61303,
    "wifi_calling_1": 61671,
    "wifi_calling_2": 61686,
    "wifi_calling_3": 61671,
    "wifi_calling_bar_1": 62540,
    "wifi_calling_bar_2": 62539,
    "wifi_calling_bar_3": 62538,
    "wifi_channel": 60266,
    "wifi_device": 1048372,
    "wifi_find": 60209,
    "wifi_home": 63089,
    "wifi_lock": 57825,
    "wifi_notification": 63088,
    "wifi_off": 58952,
    "wifi_password": 60267,
    "wifi_protected_setup": 61692,
    "wifi_proxy": 63399,
    "wifi_tethering": 57826,
    "wifi_tethering_error": 60121,
    "wifi_tethering_off": 61575,
    "wind_power": 60428,
    "window": 61576,
    "window_closed": 59262,
    "window_open": 59276,
    "window_sensor": 58043,
    "windshield_defrost_auto": 62024,
    "windshield_defrost_front": 62250,
    "windshield_defrost_rear": 62249,
    "windshield_heat_front": 62248,
    "wine_bar": 61928,
    "woman": 57662,
    "woman_2": 63719,
    "work": 59715,
    "work_alert": 62967,
    "work_history": 60425,
    "work_off": 59714,
    "work_outline": 59715,
    "work_update": 62968,
    "workflow": 59908,
    "workspace_premium": 59311,
    "workspaces": 59919,
    "workspaces_outline": 59919,
    "wounds_injuries": 57663,
    "wrap_text": 57947,
    "wrist": 63132,
    "wrong_location": 61304,
    "wysiwyg": 61891,
    "x_circle": 58185,
    "y_circle": 61125,
    "yakitori": 61233,
    "yard": 61577,
    "yoshoku": 62079,
    "your_trips": 60203,
    "youtube_activity": 63578,
    "youtube_searched_for": 59642,
    "zone_person_alert": 59265,
    "zone_person_idle": 59258,
    "zone_person_urgent": 59272,
    "zoom_in": 59647,
    "zoom_in_map": 60205,
    "zoom_out": 59648,
    "zoom_out_map": 58731
  };
  const FALLBACK_THEME = {
    surface: "#121212",
    surfaceContainer: "#1e1e1e",
    primary: "#80cbc4",
    primaryDark: "#4db6ac",
    background: "#121212",
    onSurface: "#ffffff",
    onSurfaceVariant: "#b0b0b0",
    secondaryContainer: "#1a3538",
    onSecondaryContainer: "#80cbc4",
    isDark: true
  };
  function resolveTheme(theme) {
    if (theme == null) return FALLBACK_THEME;
    return {
      surface: theme.surface ?? FALLBACK_THEME.surface,
      surfaceContainer: theme.surfaceContainer ?? FALLBACK_THEME.surfaceContainer,
      primary: theme.primary ?? FALLBACK_THEME.primary,
      primaryDark: theme.primaryDark ?? FALLBACK_THEME.primaryDark,
      background: theme.background ?? FALLBACK_THEME.background,
      onSurface: theme.onSurface ?? FALLBACK_THEME.onSurface,
      onSurfaceVariant: theme.onSurfaceVariant ?? FALLBACK_THEME.onSurfaceVariant,
      secondaryContainer: theme.secondaryContainer ?? FALLBACK_THEME.secondaryContainer,
      onSecondaryContainer: theme.onSecondaryContainer ?? FALLBACK_THEME.onSecondaryContainer,
      isDark: theme.isDark ?? FALLBACK_THEME.isDark
    };
  }
  function hexToRayactColor(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r << 24 | g << 16 | b << 8 | 255) >>> 0;
  }
  function themeColors(theme) {
    const t = resolveTheme(theme);
    return {
      surface: hexToRayactColor(t.surface),
      surfaceContainer: hexToRayactColor(t.surfaceContainer),
      primary: hexToRayactColor(t.primary),
      onSurface: hexToRayactColor(t.onSurface),
      onSurfaceVariant: hexToRayactColor(t.onSurfaceVariant),
      onPrimary: hexToRayactColor(t.isDark ? "#121212" : "#ffffff"),
      error: hexToRayactColor("#ef4444"),
      online: hexToRayactColor("#22c55e"),
      offline: hexToRayactColor("#ef4444"),
      checking: hexToRayactColor("#737373"),
      mismatch: hexToRayactColor("#f59e0b"),
      isDark: t.isDark ?? true
    };
  }
  var define_RAYACT_BUNDLED_MODULES_default = [{ name: "kv", lib: "", jsPackage: "rayact/runtime" }, { name: "mmkv", lib: "rayact_mmkv", jsPackage: "rayact/mmkv" }, { name: "secure-store", lib: "rayact_secure_store", jsPackage: "rayact/secure-store" }];
  var define_RAYACT_OFFICIAL_APP_default = { displayName: "Rayact Dev App", packageLabel: "Rayact Dev App", source: "official", androidPackageId: "com.rayact.devapp", creditTitle: "The official Rayact development client", links: [{ id: "github", icon: "github", set: "fab", label: "GitHub", url: "https://github.com/raythings/rayact" }, { id: "email", icon: "envelope", set: "fa", label: "ramnadroj@gmail.com", url: "mailto:ramnadroj@gmail.com" }] };
  function getOfficialApp() {
    try {
      return typeof define_RAYACT_OFFICIAL_APP_default !== "undefined" && define_RAYACT_OFFICIAL_APP_default ? define_RAYACT_OFFICIAL_APP_default : {};
    } catch {
      return {};
    }
  }
  function getBundledModules() {
    try {
      return typeof define_RAYACT_BUNDLED_MODULES_default !== "undefined" && Array.isArray(define_RAYACT_BUNDLED_MODULES_default) ? define_RAYACT_BUNDLED_MODULES_default : [];
    } catch {
      return [];
    }
  }
  function getBundledModuleNames() {
    return getBundledModules().map((m) => m.name);
  }
  const META_TIMEOUT_MS = 5e3;
  const HOST_REACT_COMPILER = "react-compiler";
  const HOST_BINARY_COMMANDS = true;
  const DEV_SERVER_HTTP_URL_RE = /^https?:\/\/(\[[0-9a-fA-F:.]+\]|[^/?:#\s@]+)(?::(\d{1,5}))?(\/[^\s?#]*)?$/i;
  function withTimeoutMs(ms) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), ms);
    return {
      signal: c.signal,
      cancel: () => clearTimeout(id)
    };
  }
  function trimDevUrlInput(input) {
    let s = input.trim().replace(/^\uFEFF/, "");
    s = s.replace(/\\\//g, "/");
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
          s = parsed[0].trim();
        } else if (parsed && typeof parsed === "object") {
          const o = parsed;
          if (typeof o.url === "string" && o.url) {
            s = o.url;
          } else {
            const ws = o.transports?.find((t) => t.type === "websocket");
            if (ws?.ips?.[0]) s = `${ws.ips[0]}:${ws.port}`;
          }
        }
      } catch {
      }
    }
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    return s;
  }
  function expandDevUrlCandidates(input) {
    const s = input.trim().replace(/^﻿/, "").replace(/\\\//g, "/");
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const out = [];
          for (const item of parsed) {
            if (typeof item !== "string" || !item.trim()) continue;
            let u = item.trim().replace(/\/+$/, "");
            if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
            out.push(u);
          }
          if (out.length > 0) return [...new Set(out)];
        }
      } catch {
      }
    }
    return [devServerProbeBase(input)];
  }
  function pickFastestReachable(candidates) {
    return new Promise((resolve) => {
      if (candidates.length === 0) {
        resolve(null);
        return;
      }
      let pending = candidates.length;
      let settled = false;
      for (const url of candidates) {
        void probeDevServerReachability(url).then((r) => {
          if (settled) return;
          if (r.kind === "reachable_rayact") {
            settled = true;
            resolve(url);
            return;
          }
          if (--pending === 0) resolve(null);
        });
      }
    });
  }
  function networkProbesAvailable() {
    return typeof fetch === "function";
  }
  function devServerProbeBase(input) {
    let s = trimDevUrlInput(input);
    s = s.replace(/\/+$/, "") || s;
    return s;
  }
  function persistedDevServerUrl(input) {
    return devServerProbeBase(input);
  }
  function validateDevServerUrl(input) {
    const parsed = persistedDevServerUrl(input);
    if (!parsed.trim()) return {
      ok: false,
      error: "Enter a server URL"
    };
    const m = DEV_SERVER_HTTP_URL_RE.exec(parsed);
    if (!m) return {
      ok: false,
      error: "Invalid URL"
    };
    const host = m[1];
    if (!host || host.length === 0) return {
      ok: false,
      error: "Missing host"
    };
    const portStr = m[2];
    if (portStr !== void 0 && portStr !== "") {
      const p = Number(portStr);
      if (!Number.isFinite(p) || p !== Math.trunc(p) || p < 1 || p > 65535) {
        return {
          ok: false,
          error: "Invalid port"
        };
      }
    }
    return {
      ok: true,
      parsed
    };
  }
  function manifestUrlForBase(base) {
    return `${base.replace(/\/+$/, "")}/rayact/manifest.json`;
  }
  async function probeDevServerReachability(baseUrl) {
    const probeBase = devServerProbeBase(baseUrl);
    const meta = manifestUrlForBase(probeBase);
    const {
      signal,
      cancel
    } = withTimeoutMs(META_TIMEOUT_MS);
    try {
      const res = await fetch(meta, {
        method: "GET",
        signal
      });
      if (res.ok) return {
        kind: "reachable_rayact"
      };
      if (res.status === 404) return {
        kind: "reachable_no_manifest"
      };
      return {
        kind: "unreachable"
      };
    } catch {
      return {
        kind: "unreachable"
      };
    } finally {
      cancel();
    }
  }
  async function probeRecentMetaMatch(baseUrl, expectedAppKey) {
    const meta = manifestUrlForBase(devServerProbeBase(baseUrl));
    const {
      signal,
      cancel
    } = withTimeoutMs(META_TIMEOUT_MS);
    try {
      const res = await fetch(meta, {
        method: "GET",
        signal
      });
      if (!res.ok) return res.status === 404 ? "stale" : "offline";
      let json;
      try {
        json = JSON.parse(await res.text());
      } catch {
        return "stale";
      }
      const liveKey = typeof json.rayactAppKey === "string" && json.rayactAppKey.trim() ? json.rayactAppKey.trim() : void 0;
      const expected = expectedAppKey?.trim();
      if (expected) {
        if (liveKey && liveKey !== expected) return "mismatch";
        if (!liveKey) return "stale";
      }
      return "matched";
    } catch {
      return "offline";
    } finally {
      cancel();
    }
  }
  async function checkManifestCompatibility(baseUrl) {
    const meta = manifestUrlForBase(devServerProbeBase(baseUrl));
    const {
      signal,
      cancel
    } = withTimeoutMs(META_TIMEOUT_MS);
    try {
      const res = await fetch(meta, {
        method: "GET",
        signal
      });
      if (!res.ok) return {
        compatible: true,
        modules: []
      };
      const json = await res.json();
      const nativeModules = json.nativeModules;
      const missing = [];
      const compiler = typeof json.compiler === "string" ? json.compiler : void 0;
      if (compiler && compiler !== HOST_REACT_COMPILER) {
        missing.push({
          name: `compiler:${compiler}`,
          jsPackage: HOST_REACT_COMPILER
        });
      }
      const binaryCommands = json.binaryCommands;
      if (binaryCommands === true && !HOST_BINARY_COMMANDS) ;
      if (!Array.isArray(nativeModules) || nativeModules.length === 0) {
        return {
          compatible: missing.length === 0,
          modules: missing
        };
      }
      const bundled = new Set(getBundledModuleNames());
      for (const item of nativeModules) {
        if (!item || typeof item !== "object") continue;
        const o = item;
        const name = o.name != null ? String(o.name) : "";
        if (!name || bundled.has(name)) continue;
        missing.push({
          name,
          jsPackage: o.jsPackage != null ? String(o.jsPackage) : void 0
        });
      }
      return {
        compatible: missing.length === 0,
        modules: missing
      };
    } catch {
      return {
        compatible: true,
        modules: []
      };
    } finally {
      cancel();
    }
  }
  function call(method, data) {
    return new Promise((resolve, reject) => {
      if (typeof devCall !== "function") {
        reject(new Error(`Rayact devCall unavailable: ${method}`));
        return;
      }
      devCall(method, data, (result) => resolve(result));
    });
  }
  function getDevServerUrl() {
    return call("getDevServerUrl");
  }
  function getRecentEntries() {
    return call("getRecentEntries");
  }
  function removeRecentUrl(url) {
    return call("removeRecentUrl", {
      url
    });
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
  function openProjectDirect(url) {
    return call("openProjectDirect", {
      url
    });
  }
  function getAppInfo() {
    return call("getAppInfo").then((raw) => {
      if (typeof raw === "string") {
        return JSON.parse(raw);
      }
      return raw;
    });
  }
  function scanQR() {
    return call("scanQR");
  }
  const INVALID_SERVER_URL_MESSAGE = "Invalid server URL";
  const DevLauncherContext = reactExports.createContext(null);
  function normalizeDiscovered(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item;
      const url = o.url != null ? String(o.url) : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        name: o.name != null ? String(o.name) : "",
        appKey: o.appKey != null ? String(o.appKey) : void 0,
        compatible: typeof o.compatible === "boolean" ? o.compatible : true
      });
    }
    return out;
  }
  function DevLauncherProvider({
    children
  }) {
    const [url, setUrlState] = reactExports.useState("");
    const [theme] = reactExports.useState(FALLBACK_THEME);
    const [recentEntries, setRecentEntries] = reactExports.useState([]);
    const recentEntriesRef = reactExports.useRef(recentEntries);
    recentEntriesRef.current = recentEntries;
    const recentListKey = reactExports.useMemo(() => recentEntries.map((e) => `${e.url}|${e.appKey ?? ""}`).join(";"), [recentEntries]);
    const [recentReachability, setRecentReachability] = reactExports.useState({});
    const [discoveredServers, setDiscoveredServers] = reactExports.useState([]);
    const [incompatibleModalVisible, setIncompatibleModalVisible] = reactExports.useState(false);
    const [incompatibleModules, setIncompatibleModules] = reactExports.useState([]);
    const [connectError, setConnectError] = reactExports.useState("");
    const [connecting, setConnecting] = reactExports.useState(false);
    const [devMenuOpen, setDevMenuOpen] = reactExports.useState(false);
    const [inspectorOpen, setInspectorOpen] = reactExports.useState(false);
    const setUrl = reactExports.useCallback((u) => {
      setUrlState(u);
      setConnectError("");
    }, []);
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
        void getDiscoveredServers().then((raw) => setDiscoveredServers(normalizeDiscovered(raw))).catch(() => {
        });
      }, 2e3);
      return () => {
        clearInterval(timer);
        void stopDiscovery().catch(() => {
        });
      };
    }, [refreshRecent]);
    const probeAllRecents = reactExports.useCallback((entries, initial) => {
      if (entries.length === 0) {
        setRecentReachability({});
        return () => {
        };
      }
      if (!networkProbesAvailable()) {
        setRecentReachability(Object.fromEntries(entries.map((e_0) => {
          const v = validateDevServerUrl(e_0.url);
          return [e_0.url, v.ok ? "matched" : "offline"];
        })));
        return () => {
        };
      }
      if (initial) {
        setRecentReachability(Object.fromEntries(entries.map((e_1) => [e_1.url, "checking"])));
      }
      let cancelled = false;
      void (async () => {
        const results = await Promise.all(entries.map(async (e_2) => {
          const v_0 = validateDevServerUrl(e_2.url);
          if (!v_0.ok) return [e_2.url, "offline"];
          const st = await probeRecentMetaMatch(devServerProbeBase(e_2.url), e_2.appKey);
          return [e_2.url, st];
        }));
        if (cancelled) return;
        setRecentReachability((prev) => ({
          ...prev,
          ...Object.fromEntries(results)
        }));
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    reactExports.useEffect(() => {
      const cancel = probeAllRecents(recentEntries, true);
      const id = setInterval(() => {
        probeAllRecents(recentEntriesRef.current, false);
      }, 5e3);
      return () => {
        cancel();
        clearInterval(id);
      };
    }, [recentListKey, probeAllRecents]);
    const parseUrl = reactExports.useCallback((input) => persistedDevServerUrl(input), []);
    const removeRecentItem = reactExports.useCallback((u_0) => {
      void removeRecentUrl(u_0).then(() => {
        setRecentReachability((prev_0) => {
          const next = {
            ...prev_0
          };
          delete next[u_0];
          return next;
        });
        refreshRecent();
      });
    }, [refreshRecent]);
    const connectToUrl = reactExports.useCallback((parsed) => {
      void (async () => {
        setConnecting(true);
        setConnectError("");
        try {
          const openResult = await openProjectDirect(parsed);
          if (!openResult?.ok) {
            throw new Error(INVALID_SERVER_URL_MESSAGE);
          }
          setUrlState(openResult.url ?? parsed);
          refreshRecent();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setConnectError(message === INVALID_SERVER_URL_MESSAGE ? message : INVALID_SERVER_URL_MESSAGE);
        } finally {
          setConnecting(false);
        }
      })();
    }, [refreshRecent]);
    const showIncompatibleModalForUrl = reactExports.useCallback((parsed_0) => {
      void (async () => {
        const {
          compatible,
          modules
        } = await checkManifestCompatibility(parsed_0);
        if (!compatible && modules.length > 0) {
          setIncompatibleModules(modules);
          setIncompatibleModalVisible(true);
        }
      })();
    }, []);
    const openProject = reactExports.useCallback((rawUrl) => {
      const candidates = expandDevUrlCandidates(rawUrl);
      setConnectError("");
      if (!networkProbesAvailable()) {
        const validated = validateDevServerUrl(candidates[0] ?? rawUrl);
        if (!validated.ok) {
          setConnectError(INVALID_SERVER_URL_MESSAGE);
          return;
        }
        connectToUrl(devServerProbeBase(validated.parsed));
        return;
      }
      void (async () => {
        if (candidates.length > 1) {
          const best = await pickFastestReachable(candidates);
          if (!best) {
            setConnectError(INVALID_SERVER_URL_MESSAGE);
            return;
          }
          connectToUrl(devServerProbeBase(best));
          return;
        }
        const validated_0 = validateDevServerUrl(candidates[0] ?? rawUrl);
        if (!validated_0.ok) {
          setConnectError(INVALID_SERVER_URL_MESSAGE);
          return;
        }
        const parsed_1 = devServerProbeBase(validated_0.parsed);
        connectToUrl(parsed_1);
      })();
    }, [connectToUrl]);
    const value = reactExports.useMemo(() => ({
      url,
      setUrl,
      theme,
      recentEntries,
      recentReachability,
      discoveredServers,
      incompatibleModalVisible,
      setIncompatibleModalVisible,
      incompatibleModules,
      connectError,
      connecting,
      clearConnectError: () => setConnectError(""),
      refreshRecent,
      removeRecentItem,
      connectToUrl,
      openProject,
      showIncompatibleModalForUrl,
      onSelectRecent: (u_1) => setUrlState(u_1),
      onScanQR: () => {
        void scanQR();
      },
      parseUrl,
      reload: () => {
        void reloadWithProjectBundle();
      },
      devMenuOpen,
      setDevMenuOpen,
      inspectorOpen,
      setInspectorOpen
    }), [url, setUrl, theme, recentEntries, recentReachability, discoveredServers, incompatibleModalVisible, incompatibleModules, connectError, connecting, refreshRecent, removeRecentItem, connectToUrl, openProject, showIncompatibleModalForUrl, parseUrl, devMenuOpen, inspectorOpen]);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(DevLauncherContext.Provider, { value, children });
  }
  function useDevLauncher() {
    const ctx = reactExports.useContext(DevLauncherContext);
    if (!ctx) {
      throw new Error("useDevLauncher must be used within DevLauncherProvider");
    }
    return ctx;
  }
  function ServerListRow(props) {
    const $ = compilerRuntimeExports.c(29);
    const {
      dotColor,
      title,
      subtitle,
      theme,
      embedded: t0,
      disableTap: t1,
      onPress
    } = props;
    const embedded = t0 === void 0 ? false : t0;
    const disableTap = t1 === void 0 ? false : t1;
    let t2;
    if ($[0] !== theme) {
      t2 = themeColors(theme);
      $[0] = theme;
      $[1] = t2;
    } else {
      t2 = $[1];
    }
    const colors = t2;
    let t3;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t3 = {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        width: "100%",
        minWidth: 0
      };
      $[2] = t3;
    } else {
      t3 = $[2];
    }
    let t4;
    if ($[3] !== dotColor) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: dotColor,
        flexShrink: 0
      } });
      $[3] = dotColor;
      $[4] = t4;
    } else {
      t4 = $[4];
    }
    let t5;
    if ($[5] !== colors.onSurfaceVariant) {
      t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: colors.onSurfaceVariant,
        opacity: 0.35,
        flexShrink: 0
      } });
      $[5] = colors.onSurfaceVariant;
      $[6] = t5;
    } else {
      t5 = $[6];
    }
    let t6;
    if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t6 = {
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        gap: 2
      };
      $[7] = t6;
    } else {
      t6 = $[7];
    }
    let t7;
    if ($[8] !== colors.onSurface) {
      t7 = {
        text: {
          color: colors.onSurface,
          fontSize: 15,
          fontWeight: 500
        }
      };
      $[8] = colors.onSurface;
      $[9] = t7;
    } else {
      t7 = $[9];
    }
    let t8;
    if ($[10] !== t7 || $[11] !== title) {
      t8 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t7, children: title });
      $[10] = t7;
      $[11] = title;
      $[12] = t8;
    } else {
      t8 = $[12];
    }
    let t9;
    if ($[13] !== colors.onSurfaceVariant || $[14] !== subtitle) {
      t9 = subtitle ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 13
        }
      }, children: subtitle }) : null;
      $[13] = colors.onSurfaceVariant;
      $[14] = subtitle;
      $[15] = t9;
    } else {
      t9 = $[15];
    }
    let t10;
    if ($[16] !== t8 || $[17] !== t9) {
      t10 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t6, children: [
        t8,
        t9
      ] });
      $[16] = t8;
      $[17] = t9;
      $[18] = t10;
    } else {
      t10 = $[18];
    }
    let t11;
    if ($[19] !== t10 || $[20] !== t4 || $[21] !== t5) {
      t11 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, children: [
        t4,
        t5,
        t10
      ] });
      $[19] = t10;
      $[20] = t4;
      $[21] = t5;
      $[22] = t11;
    } else {
      t11 = $[22];
    }
    const row = t11;
    if (embedded) {
      return row;
    }
    let t12;
    if ($[23] !== colors.surfaceContainer) {
      t12 = {
        width: "100%",
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.surfaceContainer
      };
      $[23] = colors.surfaceContainer;
      $[24] = t12;
    } else {
      t12 = $[24];
    }
    const t13 = disableTap ? void 0 : onPress;
    let t14;
    if ($[25] !== row || $[26] !== t12 || $[27] !== t13) {
      t14 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t12, capturesInput: true, onPress: t13, children: row });
      $[25] = row;
      $[26] = t12;
      $[27] = t13;
      $[28] = t14;
    } else {
      t14 = $[28];
    }
    return t14;
  }
  const DELETE_REVEAL = 72;
  function RecentSwipeRow(props) {
    const {
      title,
      subtitle,
      dotColor,
      theme,
      onConnect,
      onRemove
    } = props;
    const colors = themeColors(theme);
    const translateX = useSharedValue(0);
    const [open, setOpen] = reactExports.useState(false);
    const offsetRef = reactExports.useRef(0);
    const dragStart = reactExports.useRef({
      x: 0,
      y: 0
    });
    const startOffset = reactExports.useRef(0);
    const dragging = reactExports.useRef(false);
    const snapEnd = reactExports.useCallback(() => {
      dragging.current = false;
      const next = offsetRef.current < -DELETE_REVEAL / 2 ? -DELETE_REVEAL : 0;
      offsetRef.current = next;
      translateX.value = withTiming(next, 120);
      setOpen(next < 0);
    }, [translateX]);
    const onDragStart = reactExports.useCallback((e) => {
      dragging.current = true;
      dragStart.current = {
        x: e.x,
        y: e.y
      };
      startOffset.current = offsetRef.current;
    }, []);
    const onDragMove = reactExports.useCallback((e_0) => {
      if (!dragging.current) return;
      let next_0 = startOffset.current + e_0.x;
      if (next_0 > 0) next_0 = 0;
      if (next_0 < -DELETE_REVEAL) next_0 = -DELETE_REVEAL;
      offsetRef.current = next_0;
      translateX.value = next_0;
    }, [translateX]);
    const onForegroundPress = reactExports.useCallback(() => {
      if (offsetRef.current < -12) {
        offsetRef.current = 0;
        translateX.value = withTiming(0, 120);
        setOpen(false);
        return;
      }
      onConnect();
    }, [onConnect, translateX]);
    const onDeletePress = reactExports.useCallback(() => {
      offsetRef.current = 0;
      translateX.value = 0;
      setOpen(false);
      onRemove();
    }, [onRemove, translateX]);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 12,
      width: "100%"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: {
        transform: [{
          translateX
        }],
        backgroundColor: colors.surfaceContainer,
        borderRadius: 12,
        padding: 14,
        width: "100%",
        minWidth: 0,
        zIndex: 1
      }, capturesInput: true, onDragStart, onDragMove, onDragEnd: snapEnd, onPress: onForegroundPress, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ServerListRow, { embedded: true, dotColor, title, subtitle, theme, disableTap: true, onPress: () => {
      } }) }),
      open ? /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: DELETE_REVEAL,
        overflow: "hidden",
        backgroundColor: colors.error,
        alignItems: "center",
        justifyContent: "center",
        borderTopRightRadius: 12,
        borderBottomRightRadius: 12,
        zIndex: 2
      }, capturesInput: true, onPress: onDeletePress, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: 4294967295,
          fontSize: 13,
          fontWeight: 600
        }
      }, children: "Delete" }) }) : null
    ] });
  }
  function serverIdentityKey(entry) {
    const key = entry.appKey?.trim();
    if (key) return `key:${key}`;
    return `url:${entry.url.replace(/\/+$/, "")}`;
  }
  const MAX_RENDERED_ROWS = 24;
  function dotColorForReachability(st, palette) {
    switch (st) {
      case "matched":
        return palette.online;
      case "offline":
        return palette.offline;
      case "mismatch":
      case "stale":
        return palette.mismatch;
      default:
        return palette.checking;
    }
  }
  function CombinedServerList(props) {
    const $ = compilerRuntimeExports.c(37);
    const {
      theme,
      parseUrl,
      discoveredServers,
      recentEntries,
      recentReachability,
      openProject,
      setUrl,
      showIncompatibleModalForUrl,
      removeRecentItem
    } = props;
    let t0;
    if ($[0] !== theme) {
      t0 = themeColors(theme);
      $[0] = theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    const colors = t0;
    const online = colors.online;
    const offline = colors.offline;
    const mismatch = colors.mismatch;
    const checking = colors.checking;
    let m;
    if ($[2] !== parseUrl || $[3] !== recentEntries) {
      m = /* @__PURE__ */ new Map();
      for (const e of recentEntries) {
        const parsed = parseUrl(e.url);
        m.set(serverIdentityKey({
          url: parsed,
          appKey: e.appKey
        }), e);
        m.set(serverIdentityKey({
          url: parsed
        }), e);
      }
      $[2] = parseUrl;
      $[3] = recentEntries;
      $[4] = m;
    } else {
      m = $[4];
    }
    const recentByKey = m;
    let out;
    if ($[5] !== checking || $[6] !== discoveredServers || $[7] !== mismatch || $[8] !== offline || $[9] !== online || $[10] !== parseUrl || $[11] !== recentByKey || $[12] !== recentEntries || $[13] !== recentReachability) {
      out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const s of discoveredServers) {
        const parsed_0 = parseUrl(s.url);
        const key = serverIdentityKey({
          url: parsed_0,
          appKey: s.appKey
        });
        const urlKey = serverIdentityKey({
          url: parsed_0
        });
        if (seen.has(key) || seen.has(urlKey)) {
          continue;
        }
        seen.add(key);
        seen.add(urlKey);
        const saved = recentByKey.get(key) ?? recentByKey.get(urlKey);
        const compatible = s.compatible !== false;
        const title = saved?.label?.trim() ? saved.label : s.name || s.url;
        out.push({
          key,
          url: s.url,
          title,
          subtitle: title !== s.url ? s.url : void 0,
          compatible,
          dotColor: compatible ? online : offline,
          saved: !!saved,
          savedUrl: saved?.url
        });
      }
      for (const e_0 of recentEntries) {
        const parsed_1 = parseUrl(e_0.url);
        const key_0 = serverIdentityKey({
          url: parsed_1,
          appKey: e_0.appKey
        });
        const urlKey_0 = serverIdentityKey({
          url: parsed_1
        });
        if (seen.has(key_0) || seen.has(urlKey_0)) {
          continue;
        }
        seen.add(key_0);
        seen.add(urlKey_0);
        const st = recentReachability[e_0.url];
        out.push({
          key: key_0,
          url: e_0.url,
          title: e_0.label?.trim() ? e_0.label : e_0.url,
          subtitle: e_0.label?.trim() ? e_0.url : void 0,
          compatible: st !== "mismatch",
          dotColor: dotColorForReachability(st, {
            online,
            offline,
            mismatch,
            checking
          }),
          saved: true,
          savedUrl: e_0.url
        });
      }
      $[5] = checking;
      $[6] = discoveredServers;
      $[7] = mismatch;
      $[8] = offline;
      $[9] = online;
      $[10] = parseUrl;
      $[11] = recentByKey;
      $[12] = recentEntries;
      $[13] = recentReachability;
      $[14] = out;
    } else {
      out = $[14];
    }
    const merged = out;
    let t1;
    if ($[15] !== openProject || $[16] !== parseUrl || $[17] !== setUrl || $[18] !== showIncompatibleModalForUrl) {
      t1 = (rawUrl, compatible_0) => {
        const parsed_2 = parseUrl(rawUrl);
        if (!compatible_0) {
          showIncompatibleModalForUrl(parsed_2);
          return;
        }
        setUrl(parsed_2);
        openProject(rawUrl);
      };
      $[15] = openProject;
      $[16] = parseUrl;
      $[17] = setUrl;
      $[18] = showIncompatibleModalForUrl;
      $[19] = t1;
    } else {
      t1 = $[19];
    }
    const handleSelect = t1;
    if (merged.length === 0) {
      let t22;
      if ($[20] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t22 = {
          gap: 8,
          paddingTop: 8,
          paddingBottom: 24
        };
        $[20] = t22;
      } else {
        t22 = $[20];
      }
      let t32;
      if ($[21] !== colors.onSurfaceVariant) {
        t32 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t22, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 13
          }
        }, children: "Scanning for servers on your network…" }) });
        $[21] = colors.onSurfaceVariant;
        $[22] = t32;
      } else {
        t32 = $[22];
      }
      return t32;
    }
    let t2;
    if ($[23] !== merged) {
      t2 = merged.length > MAX_RENDERED_ROWS ? merged.slice(0, MAX_RENDERED_ROWS) : merged;
      $[23] = merged;
      $[24] = t2;
    } else {
      t2 = $[24];
    }
    const visibleMerged = t2;
    let t3;
    if ($[25] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t3 = {
        gap: 10,
        paddingTop: 4,
        paddingBottom: 24
      };
      $[25] = t3;
    } else {
      t3 = $[25];
    }
    let t4;
    if ($[26] !== handleSelect || $[27] !== removeRecentItem || $[28] !== theme || $[29] !== visibleMerged) {
      t4 = visibleMerged.map((m_0) => m_0.saved ? /* @__PURE__ */ jsxRuntimeExports.jsx(RecentSwipeRow, { title: m_0.title, subtitle: m_0.subtitle, dotColor: m_0.dotColor, theme, onConnect: () => handleSelect(m_0.url, m_0.compatible), onRemove: () => removeRecentItem(m_0.savedUrl ?? m_0.url) }, m_0.key) : /* @__PURE__ */ jsxRuntimeExports.jsx(ServerListRow, { dotColor: m_0.dotColor, title: m_0.title, subtitle: m_0.subtitle ?? m_0.url, theme, onPress: () => handleSelect(m_0.url, m_0.compatible) }, m_0.key));
      $[26] = handleSelect;
      $[27] = removeRecentItem;
      $[28] = theme;
      $[29] = visibleMerged;
      $[30] = t4;
    } else {
      t4 = $[30];
    }
    let t5;
    if ($[31] !== colors || $[32] !== merged.length) {
      t5 = merged.length > MAX_RENDERED_ROWS ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 12
        }
      }, children: [
        "Showing first ",
        MAX_RENDERED_ROWS,
        " servers. Type a URL to connect to another server."
      ] }) : null;
      $[31] = colors;
      $[32] = merged.length;
      $[33] = t5;
    } else {
      t5 = $[33];
    }
    let t6;
    if ($[34] !== t4 || $[35] !== t5) {
      t6 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, children: [
        t4,
        t5
      ] });
      $[34] = t4;
      $[35] = t5;
      $[36] = t6;
    } else {
      t6 = $[36];
    }
    return t6;
  }
  const PAGE_PADDING = 24;
  const SECTION_GAP = 28;
  const INPUT_HEIGHT = 48;
  const INPUT_RADIUS = 12;
  const CARD_RADIUS = 12;
  const pageStyle = {
    flexGrow: 1,
    padding: PAGE_PADDING,
    gap: SECTION_GAP
  };
  const sectionStyle = {
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
    width: "100%"
  };
  const inputStyle = {
    height: INPUT_HEIGHT,
    padding: 12,
    borderRadius: INPUT_RADIUS,
    width: "100%",
    minWidth: 0
  };
  const primaryButtonStyle = {
    width: "100%",
    padding: 14,
    borderRadius: INPUT_RADIUS,
    alignItems: "center"
  };
  const secondaryButtonStyle = {
    width: "100%",
    padding: 14,
    borderRadius: INPUT_RADIUS,
    alignItems: "center"
  };
  const modalOverlayStyle = {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: PAGE_PADDING,
    zIndex: 1e3
  };
  const modalStyle = {
    width: "100%",
    maxWidth: 400,
    borderRadius: CARD_RADIUS,
    padding: 20,
    gap: 12
  };
  const DEV_CLIENT_VERSION = "0.1.0";
  const TABS = [{
    id: "connect",
    label: "Connect",
    icon: "link"
  }, {
    id: "about",
    label: "About",
    icon: "info"
  }];
  function IncompatibleModal() {
    const $ = compilerRuntimeExports.c(38);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] !== launcher.theme) {
      t0 = themeColors(launcher.theme);
      $[0] = launcher.theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    const colors = t0;
    if (!launcher.incompatibleModalVisible) {
      return null;
    }
    let t1;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t1 = {
        ...modalOverlayStyle,
        backgroundColor: 2566914048
      };
      $[2] = t1;
    } else {
      t1 = $[2];
    }
    let t2;
    if ($[3] !== launcher) {
      t2 = () => launcher.setIncompatibleModalVisible(false);
      $[3] = launcher;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    let t3;
    if ($[5] !== colors.surfaceContainer) {
      t3 = {
        ...modalStyle,
        backgroundColor: colors.surfaceContainer
      };
      $[5] = colors.surfaceContainer;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    let t4;
    if ($[7] !== colors.onSurface) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurface,
          fontSize: 18,
          fontWeight: 600
        }
      }, children: "Incompatible server" });
      $[7] = colors.onSurface;
      $[8] = t4;
    } else {
      t4 = $[8];
    }
    let t5;
    if ($[9] !== colors.onSurface) {
      t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurface,
          fontSize: 14
        }
      }, children: "This app is missing native modules required by the project:" });
      $[9] = colors.onSurface;
      $[10] = t5;
    } else {
      t5 = $[10];
    }
    let t6;
    if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t6 = {
        gap: 6
      };
      $[11] = t6;
    } else {
      t6 = $[11];
    }
    let t7;
    if ($[12] !== colors.onSurface || $[13] !== launcher.incompatibleModules) {
      let t82;
      if ($[15] !== colors.onSurface) {
        t82 = (m) => /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 14
          }
        }, children: m.jsPackage ? `${m.name} (${m.jsPackage})` : m.name }, m.name);
        $[15] = colors.onSurface;
        $[16] = t82;
      } else {
        t82 = $[16];
      }
      t7 = launcher.incompatibleModules.map(t82);
      $[12] = colors.onSurface;
      $[13] = launcher.incompatibleModules;
      $[14] = t7;
    } else {
      t7 = $[14];
    }
    let t8;
    if ($[17] !== t7) {
      t8 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t6, children: t7 });
      $[17] = t7;
      $[18] = t8;
    } else {
      t8 = $[18];
    }
    let t9;
    if ($[19] !== colors.primary) {
      t9 = {
        ...primaryButtonStyle,
        backgroundColor: colors.primary,
        marginTop: 8
      };
      $[19] = colors.primary;
      $[20] = t9;
    } else {
      t9 = $[20];
    }
    let t10;
    if ($[21] !== launcher) {
      t10 = () => launcher.setIncompatibleModalVisible(false);
      $[21] = launcher;
      $[22] = t10;
    } else {
      t10 = $[22];
    }
    let t11;
    if ($[23] !== colors.onPrimary) {
      t11 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onPrimary,
          fontSize: 15,
          fontWeight: 600
        }
      }, children: "OK" });
      $[23] = colors.onPrimary;
      $[24] = t11;
    } else {
      t11 = $[24];
    }
    let t12;
    if ($[25] !== t10 || $[26] !== t11 || $[27] !== t9) {
      t12 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t9, onPress: t10, children: t11 });
      $[25] = t10;
      $[26] = t11;
      $[27] = t9;
      $[28] = t12;
    } else {
      t12 = $[28];
    }
    let t13;
    if ($[29] !== t12 || $[30] !== t3 || $[31] !== t4 || $[32] !== t5 || $[33] !== t8) {
      t13 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, onPress: _temp$2, children: [
        t4,
        t5,
        t8,
        t12
      ] });
      $[29] = t12;
      $[30] = t3;
      $[31] = t4;
      $[32] = t5;
      $[33] = t8;
      $[34] = t13;
    } else {
      t13 = $[34];
    }
    let t14;
    if ($[35] !== t13 || $[36] !== t2) {
      t14 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t1, onPress: t2, children: t13 });
      $[35] = t13;
      $[36] = t2;
      $[37] = t14;
    } else {
      t14 = $[37];
    }
    return t14;
  }
  function _temp$2() {
  }
  function ConnectPage() {
    const $ = compilerRuntimeExports.c(81);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] !== launcher.theme) {
      t0 = themeColors(launcher.theme);
      $[0] = launcher.theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    const colors = t0;
    const [input, setInput] = reactExports.useState(launcher.url);
    let t1;
    let t2;
    if ($[2] !== launcher.url) {
      t1 = () => {
        setInput(launcher.url);
      };
      t2 = [launcher.url];
      $[2] = launcher.url;
      $[3] = t1;
      $[4] = t2;
    } else {
      t1 = $[3];
      t2 = $[4];
    }
    reactExports.useEffect(t1, t2);
    let t3;
    if ($[5] !== colors.surface) {
      t3 = {
        ...pageStyle,
        backgroundColor: colors.surface,
        flexGrow: 1,
        gap: 0
      };
      $[5] = colors.surface;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    let t4;
    if ($[7] !== colors.onSurface) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurface,
          fontSize: 20,
          fontWeight: 600
        }
      }, children: "Connect to dev server" });
      $[7] = colors.onSurface;
      $[8] = t4;
    } else {
      t4 = $[8];
    }
    let t5;
    if ($[9] !== colors.onSurfaceVariant) {
      t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 14
        },
        marginTop: 4
      }, children: "Start a local dev server with `npx rayact dev`, then enter its URL below or pick it from the list." });
      $[9] = colors.onSurfaceVariant;
      $[10] = t5;
    } else {
      t5 = $[10];
    }
    let t6;
    if ($[11] !== launcher) {
      t6 = (v) => {
        setInput(v);
        launcher.setUrl(v);
      };
      $[11] = launcher;
      $[12] = t6;
    } else {
      t6 = $[12];
    }
    let t7;
    if ($[13] !== colors.onSurface || $[14] !== colors.surfaceContainer) {
      t7 = {
        ...inputStyle,
        marginTop: 8,
        backgroundColor: colors.surfaceContainer,
        color: colors.onSurface
      };
      $[13] = colors.onSurface;
      $[14] = colors.surfaceContainer;
      $[15] = t7;
    } else {
      t7 = $[15];
    }
    let t8;
    if ($[16] !== input || $[17] !== t6 || $[18] !== t7) {
      t8 = /* @__PURE__ */ jsxRuntimeExports.jsx(TextInput, { value: input, onChangeText: t6, placeholder: "192.168.1.50:8081", style: t7 });
      $[16] = input;
      $[17] = t6;
      $[18] = t7;
      $[19] = t8;
    } else {
      t8 = $[19];
    }
    let t9;
    if ($[20] !== colors.error || $[21] !== launcher.connectError) {
      t9 = launcher.connectError ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.error,
          fontSize: 14
        }
      }, children: launcher.connectError }) : null;
      $[20] = colors.error;
      $[21] = launcher.connectError;
      $[22] = t9;
    } else {
      t9 = $[22];
    }
    let t10;
    if ($[23] !== colors.onSurfaceVariant || $[24] !== launcher.connecting) {
      t10 = launcher.connecting ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 12
        }
      }, children: "Connecting…" }) : null;
      $[23] = colors.onSurfaceVariant;
      $[24] = launcher.connecting;
      $[25] = t10;
    } else {
      t10 = $[25];
    }
    let t11;
    if ($[26] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t11 = {
        gap: 12,
        marginTop: 8
      };
      $[26] = t11;
    } else {
      t11 = $[26];
    }
    let t12;
    if ($[27] !== input || $[28] !== launcher) {
      t12 = () => launcher.openProject(input);
      $[27] = input;
      $[28] = launcher;
      $[29] = t12;
    } else {
      t12 = $[29];
    }
    let t13;
    if ($[30] !== colors.primary) {
      t13 = {
        ...primaryButtonStyle,
        backgroundColor: colors.primary
      };
      $[30] = colors.primary;
      $[31] = t13;
    } else {
      t13 = $[31];
    }
    let t14;
    if ($[32] !== t12 || $[33] !== t13) {
      t14 = /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Connect", onPress: t12, style: t13 });
      $[32] = t12;
      $[33] = t13;
      $[34] = t14;
    } else {
      t14 = $[34];
    }
    let t15;
    if ($[35] !== colors.onSurfaceVariant) {
      t15 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 13,
          textAlign: "center"
        }
      }, children: "or" });
      $[35] = colors.onSurfaceVariant;
      $[36] = t15;
    } else {
      t15 = $[36];
    }
    let t16;
    if ($[37] !== colors.surfaceContainer) {
      t16 = {
        ...secondaryButtonStyle,
        backgroundColor: colors.surfaceContainer
      };
      $[37] = colors.surfaceContainer;
      $[38] = t16;
    } else {
      t16 = $[38];
    }
    let t17;
    if ($[39] !== colors.onSurface) {
      t17 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurface,
          fontSize: 15,
          fontWeight: 600
        }
      }, children: "Scan QR code" });
      $[39] = colors.onSurface;
      $[40] = t17;
    } else {
      t17 = $[40];
    }
    let t18;
    if ($[41] !== launcher.onScanQR || $[42] !== t16 || $[43] !== t17) {
      t18 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { onPress: launcher.onScanQR, style: t16, children: t17 });
      $[41] = launcher.onScanQR;
      $[42] = t16;
      $[43] = t17;
      $[44] = t18;
    } else {
      t18 = $[44];
    }
    let t19;
    if ($[45] !== t14 || $[46] !== t15 || $[47] !== t18) {
      t19 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t11, children: [
        t14,
        t15,
        t18
      ] });
      $[45] = t14;
      $[46] = t15;
      $[47] = t18;
      $[48] = t19;
    } else {
      t19 = $[48];
    }
    let t20;
    if ($[49] !== t10 || $[50] !== t19 || $[51] !== t4 || $[52] !== t5 || $[53] !== t8 || $[54] !== t9) {
      t20 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: sectionStyle, children: [
        t4,
        t5,
        t8,
        t9,
        t10,
        t19
      ] });
      $[49] = t10;
      $[50] = t19;
      $[51] = t4;
      $[52] = t5;
      $[53] = t8;
      $[54] = t9;
      $[55] = t20;
    } else {
      t20 = $[55];
    }
    let t21;
    if ($[56] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t21 = {
        ...sectionStyle,
        marginTop: 28,
        gap: 4
      };
      $[56] = t21;
    } else {
      t21 = $[56];
    }
    let t22;
    if ($[57] !== colors.onSurface) {
      t22 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurface,
          fontSize: 16,
          fontWeight: 600
        }
      }, children: "Servers" });
      $[57] = colors.onSurface;
      $[58] = t22;
    } else {
      t22 = $[58];
    }
    let t23;
    if ($[59] !== colors.onSurfaceVariant) {
      t23 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: colors.onSurfaceVariant,
          fontSize: 13
        }
      }, children: "Discovered on your network and saved servers. Swipe left on a saved row to delete it." });
      $[59] = colors.onSurfaceVariant;
      $[60] = t23;
    } else {
      t23 = $[60];
    }
    let t24;
    if ($[61] !== t22 || $[62] !== t23) {
      t24 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t21, children: [
        t22,
        t23
      ] });
      $[61] = t22;
      $[62] = t23;
      $[63] = t24;
    } else {
      t24 = $[63];
    }
    let t25;
    if ($[64] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t25 = {
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        width: "100%"
      };
      $[64] = t25;
    } else {
      t25 = $[64];
    }
    let t26;
    if ($[65] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t26 = {
        paddingBottom: 16,
        width: "100%"
      };
      $[65] = t26;
    } else {
      t26 = $[65];
    }
    let t27;
    if ($[66] !== launcher.discoveredServers || $[67] !== launcher.openProject || $[68] !== launcher.parseUrl || $[69] !== launcher.recentEntries || $[70] !== launcher.recentReachability || $[71] !== launcher.removeRecentItem || $[72] !== launcher.setUrl || $[73] !== launcher.showIncompatibleModalForUrl || $[74] !== launcher.theme) {
      t27 = /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: t25, children: /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t26, children: /* @__PURE__ */ jsxRuntimeExports.jsx(CombinedServerList, { theme: launcher.theme, parseUrl: launcher.parseUrl, discoveredServers: launcher.discoveredServers, recentEntries: launcher.recentEntries, recentReachability: launcher.recentReachability, openProject: launcher.openProject, setUrl: launcher.setUrl, showIncompatibleModalForUrl: launcher.showIncompatibleModalForUrl, removeRecentItem: launcher.removeRecentItem }) }) });
      $[66] = launcher.discoveredServers;
      $[67] = launcher.openProject;
      $[68] = launcher.parseUrl;
      $[69] = launcher.recentEntries;
      $[70] = launcher.recentReachability;
      $[71] = launcher.removeRecentItem;
      $[72] = launcher.setUrl;
      $[73] = launcher.showIncompatibleModalForUrl;
      $[74] = launcher.theme;
      $[75] = t27;
    } else {
      t27 = $[75];
    }
    let t28;
    if ($[76] !== t20 || $[77] !== t24 || $[78] !== t27 || $[79] !== t3) {
      t28 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, children: [
        t20,
        t24,
        t27
      ] });
      $[76] = t20;
      $[77] = t24;
      $[78] = t27;
      $[79] = t3;
      $[80] = t28;
    } else {
      t28 = $[80];
    }
    return t28;
  }
  function AboutPage() {
    const $ = compilerRuntimeExports.c(89);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] !== launcher.theme) {
      t0 = themeColors(launcher.theme);
      $[0] = launcher.theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    const colors = t0;
    const [bundleId, setBundleId] = reactExports.useState("—");
    const [nativeVersion, setNativeVersion] = reactExports.useState("—");
    const [rayactVersion, setRayactVersion] = reactExports.useState("—");
    let t1;
    let t2;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t1 = () => {
        getAppInfo().then((info) => {
          setBundleId(info.bundleId || "—");
          setNativeVersion(info.nativeAppVersion || "—");
          setRayactVersion(info.rayactVersion || "—");
        }).catch(_temp2$1);
      };
      t2 = [];
      $[2] = t1;
      $[3] = t2;
    } else {
      t1 = $[2];
      t2 = $[3];
    }
    reactExports.useEffect(t1, t2);
    const cardBorder = colors.isDark ? 452984831 : 335544320;
    let t3;
    if ($[4] !== bundleId || $[5] !== cardBorder || $[6] !== colors.onSurface || $[7] !== colors.onSurfaceVariant || $[8] !== colors.surface || $[9] !== colors.surfaceContainer || $[10] !== nativeVersion || $[11] !== rayactVersion) {
      const official = getOfficialApp();
      const bundledModules = getBundledModules();
      let t4;
      if ($[13] !== colors.surface) {
        t4 = {
          ...pageStyle,
          backgroundColor: colors.surface,
          flexGrow: 1
        };
        $[13] = colors.surface;
        $[14] = t4;
      } else {
        t4 = $[14];
      }
      let t5;
      if ($[15] !== colors.onSurface) {
        t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 16
          }
        }, children: "About" });
        $[15] = colors.onSurface;
        $[16] = t5;
      } else {
        t5 = $[16];
      }
      let t6;
      if ($[17] !== cardBorder || $[18] !== colors.surfaceContainer) {
        t6 = {
          ...sectionStyle,
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: cardBorder,
          marginBottom: 16
        };
        $[17] = cardBorder;
        $[18] = colors.surfaceContainer;
        $[19] = t6;
      } else {
        t6 = $[19];
      }
      let t7;
      if ($[20] !== colors.onSurfaceVariant) {
        t7 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4
          }
        }, children: "PACKAGE" });
        $[20] = colors.onSurfaceVariant;
        $[21] = t7;
      } else {
        t7 = $[21];
      }
      let t8;
      if ($[22] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t8 = {
          gap: 6,
          marginTop: 12
        };
        $[22] = t8;
      } else {
        t8 = $[22];
      }
      let t9;
      if ($[23] !== colors.onSurface) {
        t9 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 14
          }
        }, children: "Dev client (npm)" });
        $[23] = colors.onSurface;
        $[24] = t9;
      } else {
        t9 = $[24];
      }
      let t10;
      if ($[25] !== colors.onSurface) {
        t10 = {
          text: {
            color: colors.onSurface,
            fontSize: 15,
            fontWeight: 500
          }
        };
        $[25] = colors.onSurface;
        $[26] = t10;
      } else {
        t10 = $[26];
      }
      const t11 = nativeVersion !== "—" ? nativeVersion : DEV_CLIENT_VERSION;
      let t12;
      if ($[27] !== t10 || $[28] !== t11) {
        t12 = /* @__PURE__ */ jsxRuntimeExports.jsxs(Text, { style: t10, children: [
          "Version ",
          t11
        ] });
        $[27] = t10;
        $[28] = t11;
        $[29] = t12;
      } else {
        t12 = $[29];
      }
      let t13;
      if ($[30] !== t12 || $[31] !== t9) {
        t13 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t8, children: [
          t9,
          t12
        ] });
        $[30] = t12;
        $[31] = t9;
        $[32] = t13;
      } else {
        t13 = $[32];
      }
      let t14;
      if ($[33] !== t13 || $[34] !== t6 || $[35] !== t7) {
        t14 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t6, children: [
          t7,
          t13
        ] });
        $[33] = t13;
        $[34] = t6;
        $[35] = t7;
        $[36] = t14;
      } else {
        t14 = $[36];
      }
      let t15;
      if ($[37] !== cardBorder || $[38] !== colors.surfaceContainer) {
        t15 = {
          ...sectionStyle,
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: cardBorder,
          marginBottom: 16
        };
        $[37] = cardBorder;
        $[38] = colors.surfaceContainer;
        $[39] = t15;
      } else {
        t15 = $[39];
      }
      let t16;
      if ($[40] !== colors.onSurfaceVariant) {
        t16 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4
          }
        }, children: "NATIVE APP" });
        $[40] = colors.onSurfaceVariant;
        $[41] = t16;
      } else {
        t16 = $[41];
      }
      let t17;
      if ($[42] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t17 = {
          gap: 6,
          marginTop: 12
        };
        $[42] = t17;
      } else {
        t17 = $[42];
      }
      let t18;
      if ($[43] !== colors.onSurface) {
        t18 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 14
          }
        }, children: "Identifier" });
        $[43] = colors.onSurface;
        $[44] = t18;
      } else {
        t18 = $[44];
      }
      let t19;
      if ($[45] !== colors.onSurface) {
        t19 = {
          text: {
            color: colors.onSurface,
            fontSize: 15,
            fontWeight: 500
          }
        };
        $[45] = colors.onSurface;
        $[46] = t19;
      } else {
        t19 = $[46];
      }
      let t20;
      if ($[47] !== bundleId || $[48] !== t19) {
        t20 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t19, children: bundleId });
        $[47] = bundleId;
        $[48] = t19;
        $[49] = t20;
      } else {
        t20 = $[49];
      }
      let t21;
      if ($[50] !== t18 || $[51] !== t20) {
        t21 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t17, children: [
          t18,
          t20
        ] });
        $[50] = t18;
        $[51] = t20;
        $[52] = t21;
      } else {
        t21 = $[52];
      }
      let t22;
      if ($[53] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t22 = {
          gap: 6,
          marginTop: 14
        };
        $[53] = t22;
      } else {
        t22 = $[53];
      }
      let t23;
      if ($[54] !== colors.onSurface) {
        t23 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 14
          }
        }, children: "Version" });
        $[54] = colors.onSurface;
        $[55] = t23;
      } else {
        t23 = $[55];
      }
      let t24;
      if ($[56] !== colors.onSurfaceVariant) {
        t24 = {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 15,
            fontWeight: 500
          }
        };
        $[56] = colors.onSurfaceVariant;
        $[57] = t24;
      } else {
        t24 = $[57];
      }
      let t25;
      if ($[58] !== nativeVersion || $[59] !== t24) {
        t25 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t24, children: nativeVersion });
        $[58] = nativeVersion;
        $[59] = t24;
        $[60] = t25;
      } else {
        t25 = $[60];
      }
      let t26;
      if ($[61] !== t23 || $[62] !== t25) {
        t26 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t22, children: [
          t23,
          t25
        ] });
        $[61] = t23;
        $[62] = t25;
        $[63] = t26;
      } else {
        t26 = $[63];
      }
      let t27;
      if ($[64] !== t15 || $[65] !== t16 || $[66] !== t21 || $[67] !== t26) {
        t27 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t15, children: [
          t16,
          t21,
          t26
        ] });
        $[64] = t15;
        $[65] = t16;
        $[66] = t21;
        $[67] = t26;
        $[68] = t27;
      } else {
        t27 = $[68];
      }
      let t28;
      if ($[69] !== cardBorder || $[70] !== colors.surfaceContainer) {
        t28 = {
          ...sectionStyle,
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: cardBorder
        };
        $[69] = cardBorder;
        $[70] = colors.surfaceContainer;
        $[71] = t28;
      } else {
        t28 = $[71];
      }
      let t29;
      if ($[72] !== colors.onSurfaceVariant) {
        t29 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4
          }
        }, children: "RAYACT" });
        $[72] = colors.onSurfaceVariant;
        $[73] = t29;
      } else {
        t29 = $[73];
      }
      let t30;
      if ($[74] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t30 = {
          gap: 6,
          marginTop: 12
        };
        $[74] = t30;
      } else {
        t30 = $[74];
      }
      let t31;
      if ($[75] !== colors.onSurface) {
        t31 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
          text: {
            color: colors.onSurface,
            fontSize: 14
          }
        }, children: "Runtime" });
        $[75] = colors.onSurface;
        $[76] = t31;
      } else {
        t31 = $[76];
      }
      let t32;
      if ($[77] !== colors.onSurfaceVariant) {
        t32 = {
          text: {
            color: colors.onSurfaceVariant,
            fontSize: 15,
            fontWeight: 500
          }
        };
        $[77] = colors.onSurfaceVariant;
        $[78] = t32;
      } else {
        t32 = $[78];
      }
      let t33;
      if ($[79] !== rayactVersion || $[80] !== t32) {
        t33 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t32, children: rayactVersion });
        $[79] = rayactVersion;
        $[80] = t32;
        $[81] = t33;
      } else {
        t33 = $[81];
      }
      let t34;
      if ($[82] !== t31 || $[83] !== t33) {
        t34 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t30, children: [
          t31,
          t33
        ] });
        $[82] = t31;
        $[83] = t33;
        $[84] = t34;
      } else {
        t34 = $[84];
      }
      let t35;
      if ($[85] !== t28 || $[86] !== t29 || $[87] !== t34) {
        t35 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t28, children: [
          t29,
          t34
        ] });
        $[85] = t28;
        $[86] = t29;
        $[87] = t34;
        $[88] = t35;
      } else {
        t35 = $[88];
      }
      t3 = /* @__PURE__ */ jsxRuntimeExports.jsxs(ScrollView, { style: t4, children: [
        t5,
        official.displayName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
          ...sectionStyle,
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: cardBorder,
          marginBottom: 16
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
            text: {
              color: colors.onSurface,
              fontSize: 17,
              fontWeight: 600
            }
          }, children: official.displayName }),
          official.creditTitle ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
            text: {
              color: colors.onSurfaceVariant,
              fontSize: 13,
              marginTop: 4
            }
          }, children: official.creditTitle }) : null,
          (official.links ?? []).map((link) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Text, { style: {
            text: {
              color: colors.onSurfaceVariant,
              fontSize: 13,
              marginTop: 8
            }
          }, children: [
            link.label,
            ": ",
            link.url
          ] }, link.id))
        ] }) : null,
        t14,
        t27,
        t35,
        bundledModules.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: {
          ...sectionStyle,
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: cardBorder,
          marginTop: 16
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
            text: {
              color: colors.onSurfaceVariant,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.4
            }
          }, children: "BUNDLED NATIVE MODULES" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: {
            gap: 6,
            marginTop: 12
          }, children: bundledModules.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
            text: {
              color: colors.onSurface,
              fontSize: 14
            }
          }, children: m.jsPackage ? `${m.name} · ${m.jsPackage}` : m.name }, m.name)) })
        ] }) : null
      ] });
      $[4] = bundleId;
      $[5] = cardBorder;
      $[6] = colors.onSurface;
      $[7] = colors.onSurfaceVariant;
      $[8] = colors.surface;
      $[9] = colors.surfaceContainer;
      $[10] = nativeVersion;
      $[11] = rayactVersion;
      $[12] = t3;
    } else {
      t3 = $[12];
    }
    return t3;
  }
  function _temp2$1() {
  }
  function DevLauncherNavBar(t0) {
    const $ = compilerRuntimeExports.c(9);
    const {
      tab,
      onTabChange
    } = t0;
    const launcher = useDevLauncher();
    let t1;
    if ($[0] !== launcher.theme) {
      t1 = themeColors(launcher.theme);
      $[0] = launcher.theme;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    const colors = t1;
    let t2;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t2 = {
        flexShrink: 0
      };
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    let t3;
    if ($[3] !== colors || $[4] !== onTabChange || $[5] !== tab) {
      t3 = TABS.map((item) => {
        const selected = tab === item.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(NavigationBarItem, { label: item.label, selected, className: "dev-launcher-nav-item", onPress: () => onTabChange(item.id), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { name: item.icon, size: 24, color: selected ? colors.primary : colors.onSurfaceVariant, filled: selected }) }, item.id);
      });
      $[3] = colors;
      $[4] = onTabChange;
      $[5] = tab;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    let t4;
    if ($[7] !== t3) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(NavigationBar, { ignoreSafeAreaView: true, style: t2, children: t3 });
      $[7] = t3;
      $[8] = t4;
    } else {
      t4 = $[8];
    }
    return t4;
  }
  function DevLauncherUI() {
    const $ = compilerRuntimeExports.c(20);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] !== launcher.theme) {
      t0 = themeColors(launcher.theme);
      $[0] = launcher.theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    const colors = t0;
    const insets = useSafeAreaInsets();
    const [tab, setTab] = reactExports.useState("connect");
    let t1;
    if ($[2] !== colors.surface) {
      t1 = {
        flexGrow: 1,
        backgroundColor: colors.surface
      };
      $[2] = colors.surface;
      $[3] = t1;
    } else {
      t1 = $[3];
    }
    let t2;
    if ($[4] !== insets.left || $[5] !== insets.right || $[6] !== insets.top) {
      t2 = {
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right
      };
      $[4] = insets.left;
      $[5] = insets.right;
      $[6] = insets.top;
      $[7] = t2;
    } else {
      t2 = $[7];
    }
    let t3;
    if ($[8] !== tab) {
      t3 = tab === "connect" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ConnectPage, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(AboutPage, {});
      $[8] = tab;
      $[9] = t3;
    } else {
      t3 = $[9];
    }
    let t4;
    if ($[10] !== t2 || $[11] !== t3) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t2, children: t3 });
      $[10] = t2;
      $[11] = t3;
      $[12] = t4;
    } else {
      t4 = $[12];
    }
    let t5;
    if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(IncompatibleModal, {});
      $[13] = t5;
    } else {
      t5 = $[13];
    }
    let t6;
    if ($[14] !== tab) {
      t6 = /* @__PURE__ */ jsxRuntimeExports.jsx(DevLauncherNavBar, { tab, onTabChange: setTab });
      $[14] = tab;
      $[15] = t6;
    } else {
      t6 = $[15];
    }
    let t7;
    if ($[16] !== t1 || $[17] !== t4 || $[18] !== t6) {
      t7 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t1, children: [
        t4,
        t5,
        t6
      ] });
      $[16] = t1;
      $[17] = t4;
      $[18] = t6;
      $[19] = t7;
    } else {
      t7 = $[19];
    }
    return t7;
  }
  function DevMenu() {
    const $ = compilerRuntimeExports.c(16);
    const launcher = useDevLauncher();
    if (!launcher.devMenuOpen) {
      return null;
    }
    let t0;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t0 = {
        position: "absolute",
        bottom: 24,
        right: 24,
        backgroundColor: 1022707506943,
        padding: 16,
        gap: 8,
        minWidth: 200
      };
      $[0] = t0;
    } else {
      t0 = $[0];
    }
    let t1;
    if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t1 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: 4294967295,
          fontSize: 16
        }
      }, children: "Dev Menu" });
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    let t2;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t2 = {
        text: {
          color: 1098181030143,
          fontSize: 11
        }
      };
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    const t3 = `Server: ${launcher.url}`;
    let t4;
    if ($[3] !== t3) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t2, children: t3 });
      $[3] = t3;
      $[4] = t4;
    } else {
      t4 = $[4];
    }
    let t5;
    if ($[5] !== launcher.reload) {
      t5 = /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Reload", onPress: launcher.reload });
      $[5] = launcher.reload;
      $[6] = t5;
    } else {
      t5 = $[6];
    }
    let t6;
    if ($[7] !== launcher) {
      t6 = /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Inspector", onPress: () => launcher.setInspectorOpen(!launcher.inspectorOpen) });
      $[7] = launcher;
      $[8] = t6;
    } else {
      t6 = $[8];
    }
    let t7;
    if ($[9] !== launcher) {
      t7 = /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { label: "Close", onPress: () => launcher.setDevMenuOpen(false) });
      $[9] = launcher;
      $[10] = t7;
    } else {
      t7 = $[10];
    }
    let t8;
    if ($[11] !== t4 || $[12] !== t5 || $[13] !== t6 || $[14] !== t7) {
      t8 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t0, children: [
        t1,
        t4,
        t5,
        t6,
        t7
      ] });
      $[11] = t4;
      $[12] = t5;
      $[13] = t6;
      $[14] = t7;
      $[15] = t8;
    } else {
      t8 = $[15];
    }
    return t8;
  }
  function parseTree(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  function TreeRow(t0) {
    const $ = compilerRuntimeExports.c(20);
    const {
      node,
      depth
    } = t0;
    const [open, setOpen] = reactExports.useState(depth < 2);
    const label = node.name || node.text || node.type;
    const hasChildren = (node.children?.length ?? 0) > 0;
    let t1;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t1 = {
        gap: 2
      };
      $[0] = t1;
    } else {
      t1 = $[0];
    }
    const t2 = depth * 12;
    let t3;
    if ($[1] !== t2) {
      t3 = {
        paddingLeft: t2,
        paddingVertical: 4
      };
      $[1] = t2;
      $[2] = t3;
    } else {
      t3 = $[2];
    }
    let t4;
    if ($[3] !== hasChildren || $[4] !== node.id) {
      t4 = () => {
        if (hasChildren) {
          setOpen(_temp$1);
        }
        if (typeof setInspectorHighlight === "function") {
          setInspectorHighlight(node.id);
        }
      };
      $[3] = hasChildren;
      $[4] = node.id;
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    let t5;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t5 = {
        text: {
          color: 1098989494527,
          fontSize: 12
        }
      };
      $[6] = t5;
    } else {
      t5 = $[6];
    }
    const t6 = `${hasChildren ? open ? "▼ " : "▶ " : "  "}${node.type} #${node.id} ${label}`;
    let t7;
    if ($[7] !== t6) {
      t7 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t5, children: t6 });
      $[7] = t6;
      $[8] = t7;
    } else {
      t7 = $[8];
    }
    let t8;
    if ($[9] !== t3 || $[10] !== t4 || $[11] !== t7) {
      t8 = /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: t3, onPress: t4, children: t7 });
      $[9] = t3;
      $[10] = t4;
      $[11] = t7;
      $[12] = t8;
    } else {
      t8 = $[12];
    }
    let t9;
    if ($[13] !== depth || $[14] !== node.children || $[15] !== open) {
      t9 = open && node.children?.map((child) => /* @__PURE__ */ jsxRuntimeExports.jsx(TreeRow, { node: child, depth: depth + 1 }, child.id));
      $[13] = depth;
      $[14] = node.children;
      $[15] = open;
      $[16] = t9;
    } else {
      t9 = $[16];
    }
    let t10;
    if ($[17] !== t8 || $[18] !== t9) {
      t10 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t1, children: [
        t8,
        t9
      ] });
      $[17] = t8;
      $[18] = t9;
      $[19] = t10;
    } else {
      t10 = $[19];
    }
    return t10;
  }
  function _temp$1(v) {
    return !v;
  }
  function InspectorPanel() {
    const $ = compilerRuntimeExports.c(17);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t0 = [];
      $[0] = t0;
    } else {
      t0 = $[0];
    }
    const [tree, setTree] = reactExports.useState(t0);
    let t1;
    let t2;
    if ($[1] !== launcher.inspectorOpen) {
      t1 = () => {
        if (!launcher.inspectorOpen) {
          return;
        }
        const tick = () => {
          if (typeof getNodeTree === "function") {
            setTree(parseTree(getNodeTree()));
          }
        };
        tick();
        const timer = setInterval(tick, 500);
        return () => clearInterval(timer);
      };
      t2 = [launcher.inspectorOpen];
      $[1] = launcher.inspectorOpen;
      $[2] = t1;
      $[3] = t2;
    } else {
      t1 = $[2];
      t2 = $[3];
    }
    reactExports.useEffect(t1, t2);
    if (!launcher.inspectorOpen) {
      return null;
    }
    let t3;
    if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t3 = {
        position: "absolute",
        top: 24,
        left: 24,
        bottom: 120,
        width: 280,
        backgroundColor: 1022640134911,
        padding: 12,
        gap: 8
      };
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    let t4;
    if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: 4294967295,
          fontSize: 14
        }
      }, children: "Element Inspector" });
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    let t5;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t5 = {
        flexGrow: 1
      };
      $[6] = t5;
    } else {
      t5 = $[6];
    }
    let t6;
    if ($[7] !== tree) {
      t6 = tree.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: 1097507309823,
          fontSize: 12
        }
      }, children: "No nodes" }) : tree.map(_temp2);
      $[7] = tree;
      $[8] = t6;
    } else {
      t6 = $[8];
    }
    let t7;
    if ($[9] !== t6) {
      t7 = /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: t5, children: t6 });
      $[9] = t6;
      $[10] = t7;
    } else {
      t7 = $[10];
    }
    let t8;
    if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t8 = {
        text: {
          color: 1097377498367,
          fontSize: 12
        }
      };
      $[11] = t8;
    } else {
      t8 = $[11];
    }
    let t9;
    if ($[12] !== launcher) {
      t9 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: t8, onPress: () => launcher.setInspectorOpen(false), children: "Close" });
      $[12] = launcher;
      $[13] = t9;
    } else {
      t9 = $[13];
    }
    let t10;
    if ($[14] !== t7 || $[15] !== t9) {
      t10 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, children: [
        t4,
        t7,
        t9
      ] });
      $[14] = t7;
      $[15] = t9;
      $[16] = t10;
    } else {
      t10 = $[16];
    }
    return t10;
  }
  function _temp2(node) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(TreeRow, { node, depth: 0 }, node.id);
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
    const $ = compilerRuntimeExports.c(11);
    const launcher = useDevLauncher();
    let t0;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t0 = [];
      $[0] = t0;
    } else {
      t0 = $[0];
    }
    const [lines, setLines] = reactExports.useState(t0);
    let t1;
    let t2;
    if ($[1] !== launcher.devMenuOpen) {
      t1 = () => {
        if (!launcher.devMenuOpen) {
          return;
        }
        const timer = setInterval(() => setLines([...logBuffer]), 300);
        return () => clearInterval(timer);
      };
      t2 = [launcher.devMenuOpen];
      $[1] = launcher.devMenuOpen;
      $[2] = t1;
      $[3] = t2;
    } else {
      t1 = $[2];
      t2 = $[3];
    }
    reactExports.useEffect(t1, t2);
    if (!launcher.devMenuOpen) {
      return null;
    }
    let t3;
    if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t3 = {
        position: "absolute",
        left: 24,
        right: 24,
        bottom: 100,
        maxHeight: 160,
        backgroundColor: 3422552064,
        padding: 8,
        gap: 4
      };
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    let t4;
    if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t4 = /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
        text: {
          color: 4294967295,
          fontSize: 12
        }
      }, children: "Console" });
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    let t5;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t5 = {
        flexGrow: 1
      };
      $[6] = t5;
    } else {
      t5 = $[6];
    }
    let t6;
    if ($[7] !== lines) {
      t6 = lines.slice(-40).map(_temp);
      $[7] = lines;
      $[8] = t6;
    } else {
      t6 = $[8];
    }
    let t7;
    if ($[9] !== t6) {
      t7 = /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: t3, children: [
        t4,
        /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollView, { style: t5, children: t6 })
      ] });
      $[9] = t6;
      $[10] = t7;
    } else {
      t7 = $[10];
    }
    return t7;
  }
  function _temp(line) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: {
      text: {
        color: line.level === "error" ? 1099501890559 : 1098989494527,
        fontSize: 10
      }
    }, children: `[${line.level}] ${line.text}` }, line.id);
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
