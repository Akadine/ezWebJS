
/*  ezWeb.js  (BASE LOADER) version 0.0.9
	Old-school IIFE. This file evaluates to a callable ezWeb function object.

	Framework modules (dom/net/bind/ui/uix):
		- Each module file is an expression that evaluates to start(system):
			(function(){ "use strict"; return function start(system){ ... }; })();

	Asset loader:
		- CSS: load once
		- JS: load once via script tag; modules register start() into window.__ezWebMods.
		- Framework module loader uses system.base.assets.loadMod()

	Logging (first-class API):
		system.log.warn("message")
		system.log("message", system.log.WARN)

	Levels:
		0=NONE, 1=INFO, 2=WARN, 3=DEBUG, 4=ERROR(non-fatal), 5=FATAL(fatal)

	Rules:
		- Print if level <= system.options.verbosity
		- FATAL always prints then throws
		- Logger keeps an internal history buffer (private)
		- history() returns a COPY of log entries array (no direct pointer)
		- history is capped by system.options.logMax (default set in LOADER_DEFAULTS)

	Logger scoping:
		const log = system.log.scope("net").scope("fetch");
		log.warn("thing");
		- scope is stored on each history entry
		- printed line also includes [scope]: [time] [logPrefix] [net.fetch] thing 

	Options:
		- Loader owns root system.options; applies loader defaults first.
		- App Developer options are merged early into root (verbosity affects loader + modules).
		- Each module may define start.defaults; merged into system.options[moduleName]
		- Then App Developer module overrides (options[moduleName]) merged in.
		- so options.logPrefix set's the logPrefix. (default: "ezWeb")

	Contract enforcement:
		- Loader seeds system.log and system.base with core runtime primitives and locks them:
			writable:false, configurable:false
		- system.base is primarily for modules (shared primitives/helpers).
			It's still accessible for power-users (system.base.*), but not the main dev surface.
*/
const ezWeb = (function () {
	"use strict";

    /********************************************************************
	 * Framework module ladder + files (hardcoded)
	 ********************************************************************/
	const TREE = ["dom", "net", "bind", "ui", "uix"];

	// FILE names are prefixed with 'ez' (branding).
	const MODULE_FILES = {
		dom:  "ezDOM.js",
		net:  "ezNET.js",
		bind: "ezBIND.js",
		ui:   "ezUI.js",
		uix:  "ezUIX.js"
	};

	/********************************************************************
	 * Loader defaults (root options)
	 ********************************************************************/
	const LOADER_DEFAULTS = {
		verbosity: 1,            // End User safe default: INFO only
		modulesPath: "modules/", // relative to ezWeb.js folder by default
		cache: "no-cache",

		// reserved for UIX apps later (asset base)
		appRoot: "",

		// log options (optional polish hooks)
		appPrefix: "",            // optional, developer-facing (e.g. "myApp")
		logTimestamps: false,

		// PATCH: prevent logger history from growing forever
		// Set to 0 to disable history entirely (still prints). Default keeps it useful.
		logMax: 2000
	};

	/********************************************************************
	 * Private loader state
	 ********************************************************************/
	const startedMounts = new WeakSet();           // prevent double-start per mount
	const moduleStartCache = Object.create(null);  // moduleName -> Promise<startFn>

	/********************************************************************
	 * Pin ezWeb.js folder once
	 ********************************************************************/
	const EZWEB_BASE_URL = (function () {
		const cur = document.currentScript;
		if (!cur || !cur.src) return "";
		return cur.src.substring(0, cur.src.lastIndexOf("/") + 1);
	})();

	/********************************************************************
	 * Locked property helper
	 * -Contract: published APIs are immutable once attached to system.
	 * @param {object} the object to attach to
	 * @param {string} the key to attach under
	 * @param {object} the object to attach
	 ********************************************************************/
	function defineLocked(obj, key, value) {
		Object.defineProperty(obj, key, {
			value: value,
			writable: false,
			configurable: false,
			enumerable: true
		});
	}

	/*******************************************************************
	 * Logger core (seeded by loader, locked at system.log)
	 * - First-class API (dev-facing)
	 * - Keeps internal history buffer (private, capped)
	 * - history() returns a COPY
	 * - since() / drain() support long-running external logging
	 * @param object the system object to attach to
	 *******************************************************************/
	function makeLoggerCore(system) {

		// private history buffer (not exposed)
		const _hist = [];
		let _seq = 0; // monotonic tie-breaker (same-ms logs)
		
		/*******************************************************************
		 * private _cloneEntry
		 * @param {object} the entry to cloneEntry
		 * @returns {object} the clone
		 *******************************************************************/
		function _cloneEntry(e) {
			return {
				ts: e.ts,
				seq: e.seq,
				lvl: e.lvl,
				msg: e.msg,
				scope: e.scope,
				obj: e.obj
			};
		}

		/*******************************************************************
		 * @private _getLogMax
		 * @returns {number} the max number of logs allowed
		 *******************************************************************/
		function _getLogMax() {
			try {
				const opts = system && system.options;
				const m = opts && opts.logMax;
				if (typeof m !== "number") return 2000;
				if (m < 0) return 0;
				return m;
			} catch (_) {
				return 2000;
			}
		}
		
		/*******************************************************************
		 * @private _trimHistory
		 * - trims the history to the max number allowed by logMax
		 *******************************************************************/
		function _trimHistory() {
			const max = _getLogMax();
			if (max <= 0) {
				_hist.length = 0;
				return;
			}
			while (_hist.length > max) _hist.shift();
		}

		/*******************************************************************
		 * @private _pushHistory
		 * -pushes a log entry onto the history stack
		 * @param {Date} the timestamp
		 * @param {number} the severity level
		 * @param {string} the message
		 * @param {string} the dot separated scope 
		 * -what module and what function did it come from
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		function _pushHistory(ts, lvl, msg, scope, obj) {
			const max = _getLogMax();
			if (max <= 0) return;

			_hist.push({
				ts: ts,
				seq: ++_seq,
				lvl: lvl,
				msg: msg,
				scope: scope || "",
				obj: obj
			});

			_trimHistory();
		}
		
		/*******************************************************************
		 * @private _print
		 * -prints an entry to the console 
		 * @param {Date} the timestamp
		 * @param {number} the severity level
		 * @param {string} the message
		 * @param {string} the dot separated scope 
		 * -what module and what function did it come from
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		function _print(ts, level, msg, scope, obj) {
			try {
				const opts = system && system.options ? system.options : {};
				const verbosity = (typeof opts.verbosity === "number") ? opts.verbosity : log.INFO;

				if (level !== log.FATAL) {
					if (verbosity <= log.NONE) return;
					if (level > verbosity) return;
				}

				const appPrefix = (typeof opts.appPrefix === "string") ? opts.appPrefix : "";
				const prefix = (appPrefix === "") ? "" : "[" + appPrefix + "]\t" 
								
				const stamp = opts.logTimestamps === true ? ("[Time: " + new Date(ts).toISOString() + "]\t") : "";

				const scoped = scope ? ("[" + scope + "] ") : "";
				
				const lvlName = log.levels[level] || "UNKNOWN";
				const line = stamp + "[Log level: " + lvlName + "] " + "\t" + prefix + scoped + msg;

				if (level === log.WARN) {
					obj !== undefined ? console.warn(line, obj) : console.warn(line);
					return;
				}

				if (level === log.ERROR || level === log.FATAL) {
					obj !== undefined ? console.error(line, obj) : console.error(line);
					return;
				}

				obj !== undefined ? console.log(line, obj) : console.log(line);
			} catch (_) {
				// logging must never throw
			}
		}

		/*******************************************************************
		 * public logger
		 * @param {string} the message to log
		 * @param {number} the severity level
		 * @param {any} the object in question, a string, a function, or an error object.
		 *******************************************************************/
		function log(msg, lvl, obj) {
			try {
				const level = (typeof lvl === "number") ? lvl : log.INFO;
				const ts = Date.now();
				const text = String(msg);

				_pushHistory(ts, level, text, "", obj);
				_print(ts, level, text, "", obj);
			} catch (_) {}
		}
		
		// Levels
		log.NONE  = 0;
		log.INFO  = 1;
		log.WARN  = 2;
		log.DEBUG = 3;
		log.ERROR = 4;
		log.FATAL = 5;
		
		// Console formated names
		log.levels = ["    NONE","    INFO","    WARN","DEBUG","ERROR","FATAL"];

		/*******************************************************************
		 * public info logger
		 * @param {string} the message to log
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		log.info  = (m,o)=>log(m,log.INFO,o);
		
		/*******************************************************************
		 * public warn logger
		 * @param {string} the message to log
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		log.warn  = (m,o)=>log(m,log.WARN,o);
		
		/*******************************************************************
		 * public debug logger
		 * @param {string} the message to log
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		log.debug = (m,o)=>log(m,log.DEBUG,o);
		
		/*******************************************************************
		 * public error logger
		 * @param {string} the message to log
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		log.error = (m,o)=>log(m,log.ERROR,o);
		
		/*******************************************************************
		 * public fatal logger
		 * @param {string} the message to log
		 * @param {object} the object in question or an error object.
		 *******************************************************************/
		log.fatal = function (msg, obj) {
			log(msg, log.FATAL, obj);
			throw (obj instanceof Error) ? obj : new Error(String(msg));
		};

		/*******************************************************************
		 * public full history snapshot (copy)
		 * @param {Date} how far back to go
		 * @param {number} the minimum level to filter
		 * @param {string} the scope to filter
		 *******************************************************************/
		log.history = function history(sinceTs, minLevel, scopePrefix) {
			const st = (typeof sinceTs === "number") ? sinceTs : 0;
			const ml = (typeof minLevel === "number") ? minLevel : log.NONE;
			const sp = (scopePrefix != null) ? String(scopePrefix) : null;

			const out = [];
			for (let i = 0; i < _hist.length; i++) {
				const e = _hist[i];
				if (e.ts < st) continue;
				if (e.lvl < ml) continue;
				if (sp && e.scope.indexOf(sp) !== 0) continue;
				out.push(_cloneEntry(e));
			}
			return out;
		};

		/*******************************************************************
		 * public cursor
		 * -gets history cursor for incremental draining
		 * @returns {object} contains the last time stamp "ts" and sequence index "seq"
		 *******************************************************************/
		log.cursor = function cursor() {
			if (_hist.length === 0) return { ts: 0, seq: 0 };
			const e = _hist[_hist.length - 1];
			return { ts: e.ts, seq: e.seq };
		};

		/*******************************************************************
		 * public since
		 * -get all entries since the cursor was last set (non-destructive)
		 * @returns {object} contains the last time stamp "ts" and sequence index "seq"
		 *******************************************************************/
		log.since = function since(cur, minLevel, scopePrefix) {
			const st = cur && typeof cur.ts === "number" ? cur.ts : 0;
			const sq = cur && typeof cur.seq === "number" ? cur.seq : 0;
			const ml = (typeof minLevel === "number") ? minLevel : log.NONE;
			const sp = (scopePrefix != null) ? String(scopePrefix) : null;

			const out = [];
			for (let i = 0; i < _hist.length; i++) {
				const e = _hist[i];
				if (e.ts < st) continue;
				if (e.ts === st && e.seq <= sq) continue;
				if (e.lvl < ml) continue;
				if (sp && e.scope.indexOf(sp) !== 0) continue;
				out.push(_cloneEntry(e));
			}
			return out;
		};

		
		/*******************************************************************
		 * public drain
		 * -gets and drains all entries since the cursor was last set, sets new cursor
		 * @returns {object} contains the cursor set and entries drained
		 *******************************************************************/
		log.drain = function drain(cur, minLevel, scopePrefix) {
			const entries = log.since(cur, minLevel, scopePrefix);
			const next = log.cursor();
			return { cursor: next, entries: entries };
		};

		/*******************************************************************
		 * public scope
		 * -set a scope containing log current scope + new scopeName
		 * @param {string} the scopeName
		 * @returns {object} a new logger with full scope set.
		 *******************************************************************/
		log.scope = function scope(scopeName) {
			const s = scopeName != null ? String(scopeName) : "";

			const scoped = function (msg, lvl, obj) {
				try {
					const level = (typeof lvl === "number") ? lvl : log.INFO;
					const ts = Date.now();
					const text = String(msg);

					_pushHistory(ts, level, text, s, obj);
					_print(ts, level, text, s, obj);
				} catch (_) {}
			};

			scoped.NONE  = log.NONE;
			scoped.INFO  = log.INFO;
			scoped.WARN  = log.WARN;
			scoped.DEBUG = log.DEBUG;
			scoped.ERROR = log.ERROR;
			scoped.FATAL = log.FATAL;

			scoped.info  = (m,o)=>scoped(m,scoped.INFO,o);
			scoped.warn  = (m,o)=>scoped(m,scoped.WARN,o);
			scoped.debug = (m,o)=>scoped(m,scoped.DEBUG,o);
			scoped.error = (m,o)=>scoped(m,scoped.ERROR,o);

			scoped.fatal = function (msg, obj) {
				scoped(msg, scoped.FATAL, obj);
				throw (obj instanceof Error) ? obj : new Error("[" + s + "] " + String(msg));
			};

			scoped.scope = function (sub) {
				const next = sub != null ? String(sub) : "";
				return log.scope(s ? (s + "." + next) : next);
			};

			scoped.history = function (sinceTs, minLevel, scopePrefix) {
				return log.history(
					sinceTs,
					minLevel,
					scopePrefix != null ? scopePrefix : s
				);
			};

			return scoped;
		};

		return log;
	}

	/******************************************************************
	 * Base core API: shared helpers for modules (seeded by loader, locked)
	 * - Primarily "module primitives", not necessarily app-facing sugar.
	 * @param {object} the object to attach the base core to
	 ********************************************************************/
	function makeBaseCore(system) {
		//create base core
		const base = Object.create(null);
		
		/******************************************************************
		 * base toNumber
		 * -coerce a string like "123px" into a number
		 * @param {any} v
		 * @returns {number}
		 ******************************************************************/
		defineLocked(base, "toNumber", function toNumber(v) {
			const n = parseFloat(v);
			return isNaN(n) ? 0 : n;
		});
		
		/*******************************************************************
		 * base isObj
		 * @param {object} the object to test
		 * @returns {boolean} if the object is truly an object.
		 *******************************************************************/
		defineLocked(base, "isObj", function isObj(v) {
			return !!v && typeof v === "object" && !Array.isArray(v);
		});
		
		/******************************************************************
		 * base cloneShallow(obj)
		 * -clones an object
		 * @param {object} the obj to clone
		 * @returns {object} the clone
		 ******************************************************************/
		defineLocked(base, "cloneShallow", function cloneShallow(obj) {
			const out = Object.create(null);
			if (!obj || typeof obj !== "object") return out;
			for (const k in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
			}
			return out;
		});
		
		/*******************************************************************
		 * base mergeDeep
		 * -merges a source object into a target object
		 * @param {object} the target object to merge into
		 * @param {object} the source object to merge from
		 * @returns {object} the merged object
		 *******************************************************************/
		defineLocked(base, "mergeDeep", function mergeDeep(target, src) {
			if (!base.isObj(target) || !base.isObj(src)) return target;

			Object.keys(src).forEach((k) => {
				const sv = src[k];
				const tv = target[k];
				if (base.isObj(sv) && base.isObj(tv)) { mergeDeep(tv, sv); }
				else { target[k] = sv; }
			});

			return target;
		});
		
		/*******************************************************************
		 * base mergeDefaultsDeep
		 * - merges defaults into a target WITHOUT overwriting existing keys
		 * - deep: if both sides are objects, recurses
		 * @param {object} the target object to merge into
		 * @param {object} the defaults object to merge from
		 * @returns {object} the merged object
		 *******************************************************************/
		defineLocked(base, "mergeDefaultsDeep", function mergeDefaultsDeep(target, defs) {
			if (!base.isObj(target) || !base.isObj(defs)) return target;

			Object.keys(defs).forEach((k) => {
				const dv = defs[k];
				const tv = target[k];

				// only fill if missing
				if (tv === undefined) {

					// avoid sharing object refs across instances
					if (base.isObj(dv)) {
						const clone = {};
						base.mergeDefaultsDeep(clone, dv);
						target[k] = clone;
					}
					else if (Array.isArray(dv)) {
						target[k] = dv.slice();
					}
					else {
						target[k] = dv;
					}

					return;
				}

				// if both are objects, fill deeper gaps
				if (base.isObj(tv) && base.isObj(dv)) {
					base.mergeDefaultsDeep(tv, dv);
				}
			});

			return target;
		});

		/*******************************************************************
		 * base ensureObj
		 * -ensure an embedded object exists, creates if not
		 * @param {object} the parent object
		 * @param {string} the key to the child object
		 * @returns {object} null if parent does not exist, or the obj
		 *******************************************************************/
		defineLocked(base, "ensureObj", function ensureObj(parent, key) {
			if (!base.isObj(parent)) return null;
			if (!base.isObj(parent[key])) parent[key] = {};
			return parent[key];
		});

		/*******************************************************************
		 * base mergeAPI
		 * -merges a source object into a target object
		 * @param {object} the target object to merge into
		 * @param {object} the source object to merge from
		 * @returns {object} the merged object
		 *******************************************************************/
		defineLocked(base, "mergeApi", function mergeApi(into, from) {
			if (!base.isObj(into) || !base.isObj(from)) return into;
			Object.keys(from).forEach((k) => {
				if (into[k] === undefined) into[k] = from[k];
			});
			return into;
		});
		
		/*******************************************************************
		 * base assert
		 * -assert a condition
		 * @param {boolean} condition to evaluate
		 * @param {string} the message to log if false
		 *******************************************************************/
		defineLocked(base, "assert", function assert(cond, msg) {
			if (!cond) system.log.fatal(msg || "Assertion failed");
		});
		
		/*******************************************************************
		 * base ensureSlash
		 * -ensures a path end with a '/'
		 * @param {string} the path
		 * @param {string} the normalized path
		 *******************************************************************/
		defineLocked(base, "ensureSlash", function ensureSlash(p) {
			if (!p) return "";
			return p.endsWith("/") ? p : (p + "/");
		});
		
		/*******************************************************************
		 * base joinUrl
		 * -joins two paths with a slash
		 * @param {string} the first path
		 * @param {string} the second path
		 * @returns {string} the combined path
		 *******************************************************************/
		defineLocked(base, "joinUrl", function joinUrl(a, b) {
			if (!a) return b || "";
			if (!b) return a || "";
			if (a.endsWith("/") && b.startsWith("/")) return a + b.substring(1);
			if (!a.endsWith("/") && !b.startsWith("/")) return a + "/" + b;
			return a + b;
		});

		/*******************************************************************
		 * base toAbsUrl
		 * -joins a paths to the root path
		 * @param {string} the path
		 * @param {string} the base (optional, to override the default)
		 * @returns {string} the combined path
		 *******************************************************************/
		defineLocked(base, "toAbsUrl", function toAbsUrl(url, baseOverride) {
			if (!url) return "";
			if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
			const root = baseOverride || EZWEB_BASE_URL || "";
			return base.joinUrl(root, url);
		});
		
		//this just attaches defineLocked to base	
		defineLocked(base, "defineLocked", defineLocked);
		
		//return base
		return base;
	}

	/********************************************************************
	 * Asset loader (CSS + JS )
	 * - Seeded by loader and locked at system.base.assets
	 * @param {object} the object to attach the asset loader to
	 ********************************************************************/
	function addAssetLoaderToBase(system) {
		//imports for this function
		const base = system.base;
		const log = system.log.scope("ezWeb").scope("loader").scope("assets");
		function isArray(v) { return Array.isArray(v); }

		//objects to keep track so we only load stuff once. 
		const cssLoaded = Object.create(null); // absUrl -> true
		const jsPromise = Object.create(null); // absUrl -> Promise<any>
		
		/********************************************************************
		 * @private _fetchText
		 * - gets text from a resource
		 * @param {string} the absolute url or path of the resource
		 * @returns {string} the text from the resource 
		 ********************************************************************/
		async function _fetchText(absUrl) {
			const textLog = log.scope("fetchText");
			const res = await fetch(absUrl, { cache: system.options.cache || "no-cache" });
			if (!res.ok) {
				const err = new Error("Fetch failed: " + absUrl + " (" + res.status + ")");
				textLog.error("Fetch failed: " + absUrl + " (" + res.status + ")", err);
				return ""; //soft err, just continue
			}
			return await res.text();
		}		

		/********************************************************************
		 * @private _loadCssOnce
		 * -loads a css file into the page
		 * @param {string} the url or path of the resource
		 * @param {string} the base (optional, to override the default)
		 ********************************************************************/
		async function _loadCssOnce(url, baseUrlOverride) {
			const cssLog = log.scope("loadCssOnce");
			const abs = base.toAbsUrl(url, baseUrlOverride);
			if (!abs) {
				cssLog.warn("CSS url was empty/invalid", url);
				return false;
			}

			if (cssLoaded[abs]) return true;

			const existing = document.querySelector('link[rel="stylesheet"][href="' + abs.replace(/"/g, '\\"') + '"]');
			if (existing) {
				cssLoaded[abs] = true;
				return true;
			}

			cssLoaded[abs] = true;

			return await new Promise((resolve) => {
				const link = document.createElement("link");
				link.rel = "stylesheet";
				link.href = abs;
				link.onload = () => {
					cssLog.debug("CSS loaded: " + abs);
					resolve(true);
				};
				link.onerror = () => {
					const err = new Error("CSS failed: " + abs);
					cssLog.error("CSS failed: " + abs, err);
					resolve(false);
				};
				document.head.appendChild(link);
			});
		}

		/********************************************************************
		 * @private _loadMod
		 * -loads a js file into the page
		 * @param {string} the url or path of the resource
		 * @param {string} the base (optional, to override the default)
		 ********************************************************************/
		async function _loadMod(url, baseUrlOverride) {
			const mLog = log.scope("loadMod"); 
			
			const LOADER_URL = new URL(import.meta.url);
			const BASE_URL   = new URL(".", LOADER_URL);  // folder containing ezWeb.mjs

			function modUrl(rel) {
				return new URL(rel, BASE_URL).href;
			}						
			const abs = modUrl(url);
			if (!abs) {
				const err = new Error("JS url was empty/invalid");
				mLog.error("The JS url was empty/invalid", {error:err,url:url,abs:abs});
				return false;
			}
			
			const mod = await import(abs);
			mLog.debug("JS " + abs + " Loaded");
			return ok;
		}

		//create assets core
		const assets = Object.create(null);
		
		/********************************************************************
		 * assets loadCss
		 * -loads a css file into the page
		 * @param {string} the url or path of the resource
		 * @param {Promise<string>} the base (optional, to override the default)
		 ********************************************************************/
		base.defineLocked(assets, "loadCss", async function loadCss(urlOrUrls, baseUrlOverride) {
			const urls = isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
			const results = [];
			for (let i = 0; i < urls.length; i++) {
				results.push(await _loadCssOnce(urls[i], baseUrlOverride));
			}
			return results;
		});
		
		/********************************************************************
		 * assets loadMod
		 * -loads a js file into the page
		 * @param {string} the url or path of the resource
		 * @param {string} the base (optional, to override the default)
		 ********************************************************************/
		base.defineLocked(assets, "loadMod", async function loadMod(urlOrUrls, baseUrlOverride) {
			const urls = isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
			const results = [];
			for (let i = 0; i < urls.length; i++) {
				results.push(await _loadMod(urls[i], baseUrlOverride));
			}
			return isArray(urlOrUrls) ? results : results[0];
		});
		
		/********************************************************************
		 * assets loadText
		 * -loads text from a resource
		 * @param {string} the url or path of the resource
		 * @param {string} the base (optional, to override the default)
		 * @returns {string} the text from the resource
		 ********************************************************************/
		base.defineLocked(assets, "loadText", async function loadText(url, baseUrlOverride) {
			const absURL = base.toAbsUrl(url, baseUrlOverride);
			return _fetchText(absURL);
		});

		base.defineLocked(base, "assets", assets);
	}

	/********************************************************************
	 * Options pipeline: module defaults + App Developer module overrides
	 ********************************************************************/
	 
	/********************************************************************
	 * loader @private _ensureModuleOptions
	 * -ensure module options exists, creates if not
	 * @param {object} the object to attach the options to
	 * @param {string} the name of the options category
	 * @returns {object} null if parent does not exist, or the obj
	 ********************************************************************/
	function _ensureModuleOptions(system, modName) {
		return system.base.ensureObj(system.options, modName);
	}

	/********************************************************************
	 * loader @private _applyModuleOptions
	 * -ensure merge user provided options into the defaults
	 * @param {object} the system object
	 * @param {string} the name of the options category
	 * @param {object} the default options
	 * @param {object} the user provided option
	 * @returns {object} the merged options object
	 ********************************************************************/
	function _applyModuleOptions(system, modName, moduleDefaults, appOptions) {
		const base = system.base;
		const modOptions = _ensureModuleOptions(system, modName);

		// defaults fill gaps only (do NOT overwrite user)
		if (base.isObj(moduleDefaults)) base.mergeDefaultsDeep(modOptions, moduleDefaults);

		// user overrides always win
		if (base.isObj(appOptions) && base.isObj(appOptions[modName])) {
			base.mergeDeep(modOptions, appOptions[modName]);
		}

		return modOptions;
	}

	/********************************************************************
	 * loader @private _resolveModuleRelUrl
	 * -takes module name and builds its path from the module base path 
	 * @param {object} the system object
	 * @param {string} the name of module
	 * @returns {string} path of the module file
	 ********************************************************************/
	function _resolveModuleRelUrl(system, name) {
		const file = MODULE_FILES[name];
		if (!file) return null;
		const mp = system.base.ensureSlash(system.options.modulesPath);
		return system.base.joinUrl(mp, file);
	}

	/********************************************************************
	 * loader @private _loadModuleStart
	 * -takes module name and returns it's start function
	 * @param {object} the system object
	 * @param {string} the name of module
	 * @returns {function} the start function
	 ********************************************************************/
	async function _loadModuleStart(system, name) {
		if (moduleStartCache[name]) return await moduleStartCache[name];

		const log = system.log.scope("ezWeb").scope("loader").scope("loadModuleStart");
		const relUrl = _resolveModuleRelUrl(system, name);

		if (!relUrl) {
			system.log.fatal("No module file configured for: " + name);
		}

		moduleStartCache[name] = (async () => {
			log.debug("Loading module: " + name);

			let startFn;
			try {
				await system.base.assets.loadMod(relUrl, EZWEB_BASE_URL);
				startFn = (window.__ezWebMods && window.__ezWebMods[name]) ? window.__ezWebMods[name] : null;

				if (typeof startFn !== "function") {
					system.log.fatal("Module did not register start(system): " + name);
				}
			} catch (e) {
				system.log.fatal("Failed to load module script: " + name + " (" + relUrl + ")", e);
			}

			if (typeof startFn !== "function") {
				system.log.fatal("Module did not return start(system): " + name);
			}

			return startFn;
		})();

		return await moduleStartCache[name];
	}

	/********************************************************************
	 * loader @private _parseArgs
	 * -parses the ezWeb start function arguments for overloading
	 * -("myEL,"dom",function) gets expanded to
	 * -("myEL,"dom",null,null,function)
	 * @param {string} the app element ID
	 * @param {string} the name of the top module in the tree to load
	 * -everything under it loads, you specify the head of the totem pole
	 * @param {object} optional initial data
	 * @param {object} optional initial options
	 * @param {function} optional init function
	 * @returns {object} normalized argument string  with nulls inserted
	 ********************************************************************/
	function _parseArgs(appElementId, topModule, a3, a4, a5) {
		// ezWeb(appElId, topMod, appData?, appOptions?, appInit?)
		let appData = {};
		let appOptions = {};
		let appInit = null;

		if (typeof a3 === "function") {
			appInit = a3;
			return { appElementId, topModule, appData, appOptions, appInit };
		}
		
		if (typeof a4 === "function") {
			appData = a3 || {};
			appInit = a4;
			return { appElementId, topModule, appData, appOptions, appInit };
		}

		if (typeof a5 === "function") {
			appData = a3 || {};
			appOptions = a4 || {};
			appInit = a5;
			return { appElementId, topModule, appData, appOptions, appInit };
		}

		appData = a3 || {};
		appOptions = a4 || {};
		appInit = (typeof a5 === "function") ? a5 : null;

		return { appElementId, topModule, appData, appOptions, appInit };
	}

	/********************************************************************
	 * loader @private _resolveChain
	 * -resolve module chain, uses logger defaulting to lowest module on unknown
	 * @param {object} the system object
	 * @param {string} the name of the top module in the tree to load
	 * @returns {string[]} the module chain from lowest to specified top module
	 ********************************************************************/
	function _resolveChain(system, topModule) {
		const log = system.log.scope("ezWeb").scope("loader").scope("resolveChain");

		if (!topModule) return ["dom"];

		const idx = TREE.indexOf(topModule);
		if (idx === -1) {
			log.warn("Unknown top module '" + topModule + "'. Falling back to 'dom'.");
			return ["dom"];
		}

		return TREE.slice(0, idx + 1);
	}

	function makePid() {
		return Date.now().toString(36) + Math.floor(Math.random() * 0xffffff).toString(36);
	}

	/********************************************************************
	 * Public callable (App Developer entrypoint)
	 * -starts the modules, runs the appInit function
	 * @param {string} the app element ID
	 * @param {string} the name of the top module in the tree to load
	 * -everything under it loads, you specify the head of the totem pole
	 * @param {object} optional initial data
	 * @param {object} optional initial options
	 * @param {function} optional init function
	 * @returns {string} the PID of this app in this element mount.
	 ********************************************************************/
	async function ezWeb(appElementId, topModule, a3, a4, a5) {
		const args = _parseArgs(appElementId, topModule, a3, a4, a5);

		// System bag (internal). We create it EARLY so we can log everything.
		const system = Object.create(null);

		// Root options exists immediately so logger can read it
		system.options = {};

		// Seed locked logger FIRST (first-class API)
		defineLocked(system, "log", makeLoggerCore(system));

		// Seed locked base runtime primitives (module helpers)
		defineLocked(system, "base", makeBaseCore(system));

		// Root options: loader defaults then App Developer overrides
		system.base.mergeDeep(system.options, LOADER_DEFAULTS);
		if (system.base.isObj(args.appOptions)) system.base.mergeDeep(system.options, args.appOptions);

		// Seed locked asset loader BEFORE any framework modules load
		addAssetLoaderToBase(system);

		const log = system.log.scope("ezWeb").scope("loader");
		
		log.info("Started ezWeb kernel");

		// Validate mount element (App Developer mistake)
		const appEl = document.getElementById(args.appElementId);
		if (!appEl) {
			log.fatal("App element not found: " + args.appElementId);
		}

		// Prevent double-start on same element (App Developer mistake)
		if (startedMounts.has(appEl)) {
			log.fatal("App already started on this element: " + args.appElementId);
		}
		startedMounts.add(appEl);

		const pid = makePid();
		const chain = _resolveChain(system, args.topModule);

		// Attach mount + pid (non-enumerable where possible)
		try {
			Object.defineProperty(system, "pid", { value: pid, writable: false, enumerable: false });
			Object.defineProperty(system, "appEl", { value: appEl, writable: false, enumerable: false });
		} catch (_) {
			system.pid = pid;
			system.appEl = appEl;
		}

		// Data starts as vanilla; bind module will typically proxy-wrap it
		system.data = args.appData || {};

		// Framework module API slots (filled as modules start)
		system.dom  = null;
		system.net  = null;
		system.bind = null;
		system.ui   = null;
		system.uix  = null;

		// Load + start framework modules in order
		for (let i = 0; i < chain.length; i++) {
			const name = chain[i];

			const startFn = await _loadModuleStart(system, name);

			// Merge module defaults + App Developer module overrides before start runs
			const moduleDefaults = system.base.isObj(startFn.defaults) ? startFn.defaults : null;
			_applyModuleOptions(system, name, moduleDefaults, args.appOptions);

			// Start module (it should set system[name] itself OR return its API object)
			try {
				const maybeApi = startFn(system);
				if (maybeApi && system.base.isObj(maybeApi) && system[name] == null) system.base.defineLocked(system, name, maybeApi);
				log.debug("Started module: " + name);
			} catch (e) {
				system.log.fatal("Framework module crashed during start(): " + name, e);
			}
		}

		// App Developer init function receives system bag (not returned globally)
		if (typeof args.appInit === "function") {
			try {
				log.info("Running App init (pid=" + system.pid + ")");
				args.appInit(system);
			} catch (e) {
				log.fatal("App init function threw", e);
			}
		} else if (args.appInit != null) {
			log.warn("App init was provided but is not a function");
		}

		// Return only pid
		return pid;
	}

	// Expose config on ezWeb function object (no global variables)
	ezWeb.config = {
		defaults: LOADER_DEFAULTS,
		files: MODULE_FILES
	};

	return ezWeb;

})();