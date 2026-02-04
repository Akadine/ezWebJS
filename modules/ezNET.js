
/* ezNET.js
 * ezWeb Framework Module
 * Version: 0.0.3
 *
 * Contract:
 * - File evaluates to a FUNCTION: start(system)
 * - Loader calls start(system) exactly once per app mount
 * - Module may:
 *     - Attach API to system.net
 *     - OR return an API object (loader assigns it if system slot is empty)
 * - Optional: start.defaults for module-scoped options
 */

const start = (function () {
	"use strict";

	const modName = "net";

	/********************************************************************
	 * Optional module defaults
	 * Merged into system.options.<moduleName> BEFORE start() runs
	 ********************************************************************/
	function defaults() {
		return {
			debug: false,
			ajaxSettings: {
				method: "GET",
				timeout: 0,
				cache: true,
				withCredentials: false,
				responseType: "text",
				headers: Object.create(null),
				async: true
			}
		};
	}

	/******************************************************************
	 * dom start
	 * Module entrypoint, attaches API to system bag
	 * @param {object} the system bag
	 ******************************************************************/
	return function start(system) {
		//import base
		const base = system.base;
		
		//import dom
		const dom = system.dom;
		
		//import defineLocked
		const defineLocked = system.base.defineLocked

		// Scoped logger for this module
		const log = system.log.scope("ezWeb").scope(modName);

		// Module options (already merged by loader)
		const options = system.options[modName] || {};

		if (options.debug) log.debug("Starting " + modName + " module", options);

		/******************************************************************
		 * Internal helpers (private to module)
		 ******************************************************************/
		
		/******************************************************************
		 * net @private _snapshotAjaxSettings()
		 * -snapshot of current settings (including headers)
		 * @param {object} copy of current settings
		 ******************************************************************/
		function _setupAjaxSettings(patch) {
			if (!patch || typeof patch !== "object") return _snapshotAjaxSettings();

			// ensure the settings object exists
			if (!options.ajaxSettings || typeof options.ajaxSettings !== "object") options.ajaxSettings = Object.create(null);

			// merge patch into settings
			options.ajaxSettings = base.mergeDeep(options.ajaxSettings, patch);

			// ensure headers bag exists and is plain
			if (!options.ajaxSettings.headers || typeof options.ajaxSettings.headers !== "object") options.ajaxSettings.headers = Object.create(null);
			
			//app base url
			if (options.ajaxSettings.appBaseUrl == null && options.appBaseUrl != null)
				options.ajaxSettings.appBaseUrl = options.appBaseUrl;

			//framework base url
			if (options.ajaxSettings.frameworkBaseUrl == null && options.frameworkBaseUrl != null)
				options.ajaxSettings.frameworkBaseUrl = options.frameworkBaseUrl;

			return _snapshotAjaxSettings();
		}
		
		/******************************************************************
		 * net @private _setupAjaxSettings(patch)
		 * -deep merge into options.ajaxSettings (auditable, explicit)
		 * @param {object} settings to add
		 * @param {object} copy of current settings
		 ******************************************************************/
		function _setupAjaxSettings(patch) {
			if (!patch || typeof patch !== "object") return _snapshotAjaxSettings();

			// ensure the settings object exists
			if (!options.ajaxSettings || typeof options.ajaxSettings !== "object") options.ajaxSettings = Object.create(null);

			// merge patch into settings
			options.ajaxSettings = base.mergeDeep(options.ajaxSettings, patch);

			// ensure headers bag exists and is plain
			if (!options.ajaxSettings.headers || typeof options.ajaxSettings.headers !== "object") options.ajaxSettings.headers = Object.create(null);
			
			//app base url
			if (options.ajaxSettings.appBaseUrl == null && options.appBaseUrl != null)
				options.ajaxSettings.appBaseUrl = options.appBaseUrl;

			//framework base url
			if (options.ajaxSettings.frameworkBaseUrl == null && options.frameworkBaseUrl != null)
				options.ajaxSettings.frameworkBaseUrl = options.frameworkBaseUrl;

			return _snapshotAjaxSettings();
		}
		
		/******************************************************************
		 * net @private _normHeaderName(name)
		 * -normalizes the name
		 * @param {string} the name to normalize
		 * @returns {string} the normalized name
		 ******************************************************************/
		function _normHeaderName(name) { return String(name || "").trim().toLowerCase(); }
		
		/******************************************************************
		 * net @private _setHeader(headers, name, value)
		 * -sets the header
		 * @param {object} the header object
		 * @param {string} the name
		 * @param {string} the value
		 ******************************************************************/
		function _setHeader(headers, name, value) {
			const k = _normHeaderName(name);
			if (!k) return;
			headers[k] = String(value);
		}
		
		/******************************************************************
		 * net @private _getHeader(headers, name)
		 * -gets the header
		 * @param {object} the header object
		 * @param {string} the name
		 * @returns {object} the header
		 ******************************************************************/
		function _getHeader(headers, name) {
			const k = _normHeaderName(name);
			if (!k || !headers) return null;
			return headers[k] !== undefined ? headers[k] : null;
		}
		
		/******************************************************************
		 * net @private _hasHeader(headers, name)
		 * -do we have a header?
		 * @param {object} the header object
		 * @param {string} the name
		 * @returns {boolean} do we have a header?
		 ******************************************************************/
		function _hasHeader(headers, name) {
			const k = _normHeaderName(name);
			return !!(headers && typeof headers === "object" && headers[k] !== undefined);
		}

		/******************************************************************
		 * net @private _mergeHeader(destination, source)
		 * -merges two headers
		 * @param {object} the destination header object
		 * @param {object} the source header object
		 * @returns {object} the merged header
		 ******************************************************************/
		function _mergeHeaders(dst, src) {
			if (!src || typeof src !== "object") return;
			for (const k in src) {
				if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
				_setHeader(dst, k, src[k]);
			}
		}

		/******************************************************************
		 * net @private _headersToFetchObject(headers)
		 * -build the headers ti fetch object
		 * @param {object} the header object
		 * @returns {object} the headers to fetch object
		 ******************************************************************/
		function _headersToFetchObject(headers) {
			// fetch accepts lower-case keys fine; keep it plain and visible
			const out = Object.create(null);
			if (!headers || typeof headers !== "object") return out;

			for (const k in headers) {
				if (!Object.prototype.hasOwnProperty.call(headers, k)) continue;
				out[k] = String(headers[k]);
			}
			return out;
		}
		
		/******************************************************************
		 * net @private _isFormData(v)
		 * -is the object FormData?
		 * @param {object} the value to test
		 * @returns {boolean} is the object FormData?
		 ******************************************************************/
		function _isFormData(v){ return (typeof FormData !== "undefined") && (v instanceof FormData); }
		
		/******************************************************************
		 * net @private _isUrlSearchParams(v)
		 * -is the object Url Search Params?
		 * @param {object} the value to test
		 * @returns {boolean} is the object Url Search Params?
		 ******************************************************************/
		function _isUrlSearchParams(v){ return (typeof URLSearchParams !== "undefined") && (v instanceof URLSearchParams); }
		
		/******************************************************************
		 * net @private _isBlob(v)
		 * -is the object a Blob?
		 * @param {object} the value to test
		 * @returns {boolean} is the object a Blob?
		 ******************************************************************/
		function _isBlob(v){ return (typeof Blob !== "undefined") && (v instanceof Blob); }
		
		/******************************************************************
		 * net @private _isArrayBuffer(v)
		 * -is the object an Array Buffer?
		 * @param {object} the value to test
		 * @returns {boolean} is the object an Array Buffer?
		 ******************************************************************/
		function _isArrayBuffer(v){ return (typeof ArrayBuffer !== "undefined") && (v instanceof ArrayBuffer); }
		
		/******************************************************************
		 * net @private _isRawBody(v)
		 * -is the object a Raw Body?
		 * @param {object} the value to test
		 * @returns {boolean} is the object an Raw Body?
		 ******************************************************************/
		function _isRawBody(v) { return _isFormData(v) || _isUrlSearchParams(v) || _isBlob(v) || _isArrayBuffer(v); }
		
		/******************************************************************
		 * net @private _normalizeArgs(url, data, success, dataType)
		 * -normalize args for conveinece functions
		 * @param {string} url
		 * @param {object} data
		 * @param {function} success function 
		 * @param {string} the dataType
		 * @returns {object} the normalized arguments
		 ******************************************************************/
		function _normalizeArgs(url, data, success, dataType) {
			const opts = { url: url };

			if (typeof data === "function") {
				success = data;
				data = undefined;
				dataType = undefined;
			}

			if (data !== undefined) opts.data = data;
			if (typeof success === "function") opts.success = success;
			if (typeof dataType === "string") opts.responseType = dataType;

			return opts;
		}
		
		/******************************************************************
		 * Public API
		 ******************************************************************/
		const net = Object.create(null);
		
		/******************************************************************
		 * net get(url, data, success, dataType)
		 * -convienience helper
		 * @param {string} url
		 * @param {object} data
		 * @param {function} success function 
		 * @param {object} the ajax function set up
		 ******************************************************************/
		function get(url, data, success, dataType) {
			const opts = _normalizeArgs(url, data, success, dataType);
			opts.method = "GET";
			return ajax(opts);
		}
		
		/******************************************************************
		 * net post(url, data, success, dataType)
		 * -convienience helper
		 * @param {string} url
		 * @param {object} data
		 * @param {function} success function 
		 * @param {object} the ajax function set up
		 ******************************************************************/
		function post(url, data, success, dataType) {
			const opts = _normalizeArgs(url, data, success, dataType);
			opts.method = "POST";
			return ajax(opts);			
		}
		
		/******************************************************************
		 * net getJSON(url, data, success, dataType)
		 * -convienience helper
		 * @param {string} url
		 * @param {object} data
		 * @param {function} success function 
		 * @param {object} the ajax function set up
		 ******************************************************************/
		function getJSON(url, data, success) {
			const opts = _normalizeArgs(url, data, success, "json");
			opts.method = "GET";
			opts.responseType = "json";
			return ajax(opts);
		}
		
		/******************************************************************
		 * net postJSON(url, data, success, dataType)
		 * -convienience helper
		 * @param {string} url
		 * @param {object} data
		 * @param {function} success function 
		 * @param {object} the ajax function set up
		 ******************************************************************/
		function postJSON(url, data, success) {
			const opts = _normalizeArgs(url, data, success, "json");
			opts.method = "POST";
			opts.json = true;              // explicit JSON body
			opts.responseType = "json";    // explicit JSON response
			return ajax(opts);
		}
		
		/******************************************************************
		 * net param(obj, opts?)		 
		 * Serialize data for network transmission.
		 * DEFAULT (form encoding, jQuery-compatible):
		 * - application/x-www-form-urlencoded semantics
		 * - bracket notation for nested objects
		 * - arrays => a[]=1&a[]=2
		 * - spaces encoded as '+'
		 * EXPLICIT JSON MODE (opt-in only):
		 * - opts.json === true
		 * - returns JSON.stringify(obj)
		 * - NO guessing, NO auto-switching
		 * @param {object|array} obj
		 * @param {object} [options]
		 * @param {boolean} [options.traditional=false]
		 *        If true, disables bracket notation for arrays (a=1&a=2)
		 * @param {boolean} [options.json=false]
		 *        If true, returns JSON string instead of form encoding
		 * @returns {string}
		 ******************************************************************/
		function param(obj, opts) {
			const pLog = log.scope("param");
			
			opts = opts || {};

			//If json === true, we bypass ALL form logic and return JSON.
			//This is deliberate, visible, and auditable.
			if (opts.json === true) {
				// null/undefined handled explicitly
				if (obj == null) return "null";
				const out = JSON.stringify(obj);
				
				if(options.debug) pLog.debug("JSON requested, returning: ", out);					
				return out;
			}

			//FORM-ENCODED PATH (DEFAULT)
			const traditional = opts.traditional === true;
			const parts = [];			

			//if a value is a function, invoke it
			function valueOf(v) { return (typeof v === "function") ? v() : v; }

			//Encode for application/x-www-form-urlencoded
			//- encodeURIComponent
			//- spaces converted to '+'
			function encode(v) { return encodeURIComponent(String(v)).replace(/%20/g, "+"); }

			//Append a key=value pair
			//- undefined => skipped
			//- null => empty string
			function add(key, value) {
				if (value === undefined) return;
				if (value === null) value = "";
				parts.push(encode(key) + "=" + encode(value));
			}

			//Recursive serializer
			function build(prefix, value) {
				value = valueOf(value);

				// Array handling
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						const v = valueOf(value[i]);

						if (traditional === true) add(prefix, v); // a=1&a=2
						else if (base.isObj(v)) build(prefix + "[" + i + "]", v); // a[0][x]=y
						else add(prefix + "[]", v); // a[]=1&a[]=2
					}
					return;
				}

				// Nested object handling
				if (base.isObj(value)) {
					for (const name in value) {
						if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
						build(prefix ? (prefix + "[" + name + "]") : name, value[name]);
					}
					return;
				}

				// Primitive value
				add(prefix, value);
			}

			//ENTRY POINTS
			
			// null / undefined => empty string
			if (obj == null) return "";

			//Support form-style arrays: [{name:"a",value:1},{name:"b",value:2}]
			if (Array.isArray(obj)) {
				for (let i = 0; i < obj.length; i++) {
					const it = obj[i];
					if (!it || typeof it !== "object" || it.name == null) continue;
					add(it.name, valueOf(it.value));
				}
			}

			// Normal object serialization
			// (guard: arrays are objects in JS, so we only do this when NOT an array)
			else if (typeof obj === "object") {
				for (const key in obj) {
					if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
					build(key, obj[key]);
				}
			}
			
			const out = parts.join("&");
			if(options.debug) pLog.debug("Returning: ", out);

			return out;
		}
		
		/**
		 * net.ajax(opts)
		 * Core AJAX entry point (jqXHR-lite).
		 *
		 * DESIGN GOALS:
		 * - jQuery-compatible surface (muscle memory)
		 * - Modern internals (Promise + AbortController later)
		 * - Explicit behavior (no guessing, no auto JSON)
		 * - Inspectable, abortable request object
		 *
		 * RETURNS:
		 * - jqXHR-lite object (NOT a bare Promise)
		 *
		 * NOTE:
		 * - This is a SKELETON.
		 * - Transport (fetch / XHR) is wired later.
		 */
		function ajax(opts) {
			const aLog = log.scope("ajax");

			opts = opts || {};
			
			// --- defaults ---
			const ajaxSettings = options.ajaxSettings || {};
			
			// Resolve URL early (required)
			const urlIn = String(opts.url || ajaxSettings.url || "").trim();
			if (!urlIn) aLog.fatal("ajax(): url is required");

			// Resolve method/type (jQuery supports both)
			const method = String(opts.method || opts.type || ajaxSettings.method || "GET").toUpperCase();

			// Resolve data (raw)
			const data = opts.data;

			// Resolve async flag (kept for compatibility; fetch ignores this)
			const async = (opts.async === undefined) ? true : (opts.async !== false);

			// Resolve timeout (ms, 0 = none)
			const timeout = (typeof opts.timeout === "number") ? opts.timeout : (ajaxSettings.timeout || 0);

			// Resolve responseType hint
			// Support jQuery-ish alias: dataType
			const responseType = String(
				opts.responseType || opts.dataType || ajaxSettings.responseType || "text"
			).toLowerCase();

			// Resolve cache (GET/HEAD only); default true
			const cache = (opts.cache === undefined) ? (ajaxSettings.cache !== false) : (opts.cache === true);

			// Resolve withCredentials (fetch credentials)
			const withCredentials = (opts.withCredentials === undefined) ? (ajaxSettings.withCredentials === true) : (opts.withCredentials === true);
			
			// Resolve processData
			const processData = (opts.processData === undefined) ? true : (opts.processData === true);

			// Resolve Callbacks (jQuery surface)
			const beforeSend = (typeof opts.beforeSend === "function") ? opts.beforeSend : null;
			const successCb  = (typeof opts.success === "function") ? opts.success : null;
			const errorCb    = (typeof opts.error === "function") ? opts.error : null;
			const completeCb = (typeof opts.complete === "function") ? opts.complete : null;
			const statusCode = (opts.statusCode && typeof opts.statusCode === "object") ? opts.statusCode : null;
			
			// Resolve Data Filter
			const dataFilter = (typeof opts.dataFilter === "function") ? opts.dataFilter : null;
			
			// Resolve Context
			const ctx = (opts.context !== undefined) ? opts.context : opts;

			// Resolve headers (shallow merge: defaults → opts)
			const headers = Object.create(null);			

			_mergeHeaders(headers, ajaxSettings.headers);
			_mergeHeaders(headers, opts.headers);
			
			let requestLocked = false;

			// Helper: append query string to URL safely
			function appendQuery(url, qs) {
				if (!qs) return url;
				return url + (url.indexOf("?") !== -1 ? "&" : "?") + qs;
			}

			// cache busting (jQuery uses _=timestamp)
			function cacheBust(url) {
				return appendQuery(url, "_=" + Date.now());
			}

			// Build final URL + body
			const baseOverride = (typeof opts.baseUrl === "string") ? opts.baseUrl : (system.options.appBaseUrl || "");
			let finalUrl = base.toAbsUrl(urlIn, baseOverride);
			let body = undefined;

			const hasData = (data !== undefined);

			if (method === "GET" || method === "HEAD") {
				if (hasData) {
				let qs;

				// Respect URLSearchParams
				if (_isUrlSearchParams(data)) {
					qs = data.toString();
				}
				// Raw string query
				else if (typeof data === "string") {
					qs = String(data);
				}
				// Default object → param()
				else {
					qs = param(data, {
						traditional: opts.traditional === true,
						json: false
					});
				}

				if (qs) finalUrl = appendQuery(finalUrl, qs);
			}
			if (cache === false) finalUrl = cacheBust(finalUrl);
			}
			else {
				if (hasData) {
					// 1) processData === false → pass through verbatim
					if (processData === false) {
						body = data;
					}

					// 2) Raw body types (FormData, Blob, etc.)
					else if (_isRawBody(data)) {
						body = data;
						// IMPORTANT:
						// - Do NOT set Content-Type for FormData
						// - Browser will add boundary automatically
					}

					// 3) Explicit JSON (opt-in ONLY)
					else if (opts.json === true) {
						body = param(data, { json: true });
						if (!_hasHeader(headers, "Content-Type")) {
							_setHeader(headers, "Content-Type", "application/json");
						}
					}

					// 4) Raw string body
					else if (typeof data === "string") {
						body = data;
						if (!_hasHeader(headers, "Content-Type")) {
							_setHeader(headers, "Content-Type",
								"application/x-www-form-urlencoded; charset=UTF-8");
						}
					}

					// 5) Default form encoding
					else {
						body = param(data, {
							traditional: opts.traditional === true,
							json: false
						});
						if (!_hasHeader(headers, "Content-Type")) {
							_setHeader(headers, "Content-Type",
								"application/x-www-form-urlencoded; charset=UTF-8");
						}
					}
				}
			}

			// Default Accept header (minimal hint)
			if (!_hasHeader(headers, "Accept")) {
				if (responseType === "json") _setHeader(headers, "Accept", "application/json, text/plain, */*");
				else _setHeader(headers, "Accept", "*/*");
			}

			// --- jqXHR-lite object ---
			const xhr = Object.create(null);

			// Public state (populated later)
			xhr.readyState = 0;      // 0=unsent, 1=opened, 2=headers, 3=loading, 4=done
			xhr.status = 0;
			xhr.statusText = "";
			xhr.response = null;
			xhr.responseText = null;
			xhr.ok = false;
			xhr.aborted = false;

			// Promise backing the request
			let _resolve, _reject;
			const promise = new Promise(function (resolve, reject) {
				_resolve = resolve;
				_reject = reject;
			});

			// Promise compatibility
			xhr.then = function (fn, err) { return promise.then(fn, err); };
			xhr.catch = function (fn) { return promise.catch(fn); };
			xhr.finally = function (fn) { return promise.finally(fn); };
			xhr.promise = function () { return promise; };

			// jQuery-style aliases
			xhr.done = function (fn) { promise.then(fn); return xhr; };
			xhr.fail = function (fn) { promise.catch(fn); return xhr; };
			xhr.always = function (fn) { promise.finally(fn); return xhr; };
			
			// Set request header
			xhr.setRequestHeader = function (name, value) {
				if (requestLocked) return xhr; // silent no-op like XHR
				if (!name) return xhr;
				_setHeader(headers, name, value);
				return xhr;
			};

			// Get response header
			xhr.getResponseHeader = function (name) {
				if (xhr.readyState < 2 || !xhr.response || !xhr.response.headers) return null;
				return _getHeader(xhr.response.headers, name);
			};
			
			// Get all response headers
			xhr.getAllResponseHeaders = function () {
				if (xhr.readyState < 2 || !xhr.response || !xhr.response.headers) return "";
				const h = xhr.response.headers;
				let out = "";
				for (const k in h) {
					if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
					out += k + ": " + h[k] + "\r\n";
				}
				return out;
			};

			// Abort hook
			const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
			let timerId = 0;
			let timedOut = false;
			let settled = false;
			
			//helpers			
			function makeError(type, err, extra) {
				const e = (err instanceof Error) ? err : new Error(String(err || "ajax(): error"));
				e.type = type || "error";
				e.url = finalUrl;
				e.method = method;
				if (extra && typeof extra === "object") {
					for (const k in extra) {
						if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
						e[k] = extra[k];
					}
				}
				return e;
			}

			function fireError(type, err) {
				// statusCode hooks fire when we have a real HTTP status (later)
				if (typeof errorCb === "function") { try { errorCb.call(ctx, xhr, type, err); } catch (e) {} }
				finishComplete(type);
				return;
			}

			function settleResolve(val) {
				if (settled) return;
				settled = true;
				_resolve(val);
				return;
			}

			function settleReject(err) {
				if (settled) return;
				settled = true;
				_reject(err);
				return;
			}

			function clearTimer() {
				if (timerId) {
					clearTimeout(timerId);
					timerId = 0;
				}
				return;
			}

			function finishComplete(statusText) {
				if (typeof completeCb === "function") {	try { completeCb.call(ctx, xhr, statusText || ""); } catch (e) {} }
			}

			function fireStatusCode(code) {
				if (!statusCode) return;
				const fn = statusCode[code];
				if (typeof fn === "function") {
					try { fn.call(ctx, xhr); } catch (e) {}
				}
				return;
			}

			xhr.abort = function () {
				if (xhr.readyState === 4 || settled) return;
				xhr.aborted = true;

				if (options.debug) aLog.warn("Request aborted: ", finalUrl);

				clearTimer();
				if (controller) controller.abort();

				const ae = makeError("abort", "ajax(): aborted", { aborted: true });
				fireError("abort", ae);
				settleReject(ae);
			};

			if (timeout > 0) {
				timerId = setTimeout(function () {
					if (settled) return;
					timedOut = true;
					xhr.aborted = true;

					if (options.debug) aLog.warn("Timeout reached (" + timeout + "ms): ", finalUrl);

					if (controller) controller.abort();

					const te = makeError("timeout", "ajax(): timeout", { timeout: true });
					fireError("timeout", te);
					settleReject(te)
				}, timeout);
			}

			// fetch options
			const fetchOpts = {
				method: method,
				headers: _headersToFetchObject(headers)
			};

			if (controller) fetchOpts.signal = controller.signal;
			fetchOpts.credentials = withCredentials ? "include" : "same-origin";
			if (body !== undefined && method !== "GET" && method !== "HEAD") fetchOpts.body = body;

			// Parse helper
			function readBody(res) {
				if (responseType === "json") {
					// Make JSON parse failures become "parsererror"
					return res.text().then(function (t) {
						if (t === "" || t == null) return null;
						try { return JSON.parse(t); }
						catch (e) {
							const pe = makeError("parsererror", e, { responseText: t });
							// throw typed error so catch() can route it
							throw pe;
						}
					});
				}
				if (responseType === "blob") return res.blob();
				if (responseType === "arraybuffer") return res.arrayBuffer();
				return res.text();
			}

			function headersToObject(h) {
				const out = Object.create(null);
				if (!h || typeof h.forEach !== "function") return out;
				h.forEach(function (v, k) { out[k] = v; });
				return out;
			}

			// --- start request ---
			xhr.readyState = 1;

			// beforeSend can cancel request
			if (beforeSend) {
				let okToSend = true;
				try {
					const r = beforeSend.call(ctx, xhr, {
						url: finalUrl,
						method: method,
						timeout: timeout,
						responseType: responseType,
						withCredentials: withCredentials,
						cache: cache,
						headers: headers,
						data: data
					});
					if (r === false) okToSend = false;
				} catch (e) {}
				if (!okToSend) {
					// behave like an abort
					xhr.abort();
					return xhr;
				}
			}

			if (options.debug) {
				aLog.debug("Starting: ", {
					url: finalUrl,
					method: method,
					timeout: timeout,
					responseType: responseType,
					withCredentials: fetchOpts.credentials,
					cache: cache,
					hasBody: body !== undefined
				});
				if (async === false) aLog.warn("ajax(): async=false is ignored by fetch()");
			}

			if (typeof fetch !== "function") {
				const fe = makeError("error", "ajax(): fetch is not available");
				xhr.readyState = 4;
				clearTimer();
				fireError("error", fe);
				settleReject(fe);
				return xhr;
			}
			
			requestLocked = true;

			fetch(finalUrl, fetchOpts).then(function (res) {
				if (settled) return;
				clearTimer();

				xhr.readyState = 2;
				xhr.status = res.status;
				xhr.statusText = res.statusText || "";
				xhr.ok = !!res.ok;

				const hdrs = headersToObject(res.headers);
				xhr.readyState = 3;

				return readBody(res).then(function (dataOut) {
					if (settled) return;
					
					// Optional dataFilter (runs on decoded payload)
					if (dataFilter) {
						try {
							dataOut = dataFilter.call(ctx, dataOut, responseType);
						} catch (e) {
							const fe = makeError("parsererror", e, { stage: "dataFilter" });
							fireError("parsererror", fe);
							settleReject(fe);
							return;
						}
					}
					
					xhr.readyState = 4;

					// Normalize response payload
					xhr.response = {
						ok: xhr.ok,
						status: xhr.status,
						statusText: xhr.statusText,
						url: res.url || finalUrl,
						method: method,
						headers: hdrs,
						data: dataOut
					};

					if (typeof dataOut === "string") xhr.responseText = dataOut;
					
					

					// statusCode hooks fire after response is built
					fireStatusCode(xhr.status);

					if (!xhr.ok) {
						const he = makeError("error", "ajax(): HTTP " + xhr.status, {
							status: xhr.status,
							response: xhr.response
						});
						fireError("error", he);
						settleReject(he);
						return;
					}

					if (typeof successCb === "function") {
						try { successCb.call(ctx, xhr.response.data, "success", xhr); } catch (e) {}
					}
					finishComplete("success");

					settleResolve(xhr.response);
				});
			}).catch(function (err) {
				if (settled) return;
				clearTimer();
				xhr.readyState = 4;

				if (timedOut) return;

				// Normalize abort
				if (xhr.aborted === true || (err && err.name === "AbortError")) {
					const ae = makeError("abort", "ajax(): aborted", { aborted: true });
					fireError("abort", ae);
					settleReject(ae);
					return;
				}

				// If we threw a typed error (parsererror), preserve it
				const type = (err && typeof err.type === "string") ? err.type : "error";
				const e2 = (err && err.type) ? err : makeError(type, err);

				fireError(type, e2);
				settleReject(e2);
			});

			return xhr;
		}
		
		/******************************************************************
		 * Attach public methods to net
		 ******************************************************************/
		defineLocked(net, "param", param);
		defineLocked(net, "ajax", ajax);
		defineLocked(net, "ajaxSettings", function ajaxSettings() { return _snapshotAjaxSettings(); });
		defineLocked(net, "setup", function setup(patch) { return _setupAjaxSettings(patch); });
		defineLocked(net, "get", get);
		defineLocked(net, "post", post);
		defineLocked(net, "getJSON", getJSON);
		defineLocked(net, "postJSON", postJSON);

		// expose defaults snapshot (useful for debugging)
		defineLocked(net, "defaults", function defaultsSnapshot() {	return _snapshotAjaxSettings(); });
		
		/******************************************************************
		 * Attach public methods to dom (extend, query compat) 
		 ******************************************************************/
		defineLocked(dom, "param", param);
		defineLocked(dom, "ajax", ajax);
		defineLocked(dom, "ajaxSettings", function ajaxSettings() {	return _snapshotAjaxSettings(); });
		defineLocked(dom, "ajaxSetup", function setup(patch) { return _setupAjaxSettings(patch); });
		defineLocked(dom, "get", get);
		defineLocked(dom, "post", post);
		defineLocked(dom, "getJSON", getJSON);
		defineLocked(dom, "postJSON", postJSON);

		/******************************************************************
		 * Attach API to system bag (preferred)
		 ******************************************************************/
		defineLocked(system, modName, net);

		log.info(modName + " module ready");

		// Optional return (loader will attach if system slot is still empty)
		return net;
	}

	// Attach defaults to start function (loader reads this)
	start.defaults = defaults();

})();

export default start;