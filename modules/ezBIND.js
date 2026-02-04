/* ezBIND.js
 * ezWeb Framework Module
 * Version: 0.0.6
 *
 * PURPOSE:
 * - One-way + two-way data binding
 * - Special object binding for <select> dropdown models
 * - Backtick template binding (ATTR + TEXT):  ``path.to.value``
 * - ezFor template expansion
 *
 * Contract:
 * - File evaluates to a FUNCTION: start(system)
 * - Loader calls start(system) exactly once per app mount
 * - Module attaches API to system.bind
 * - Optional: start.defaults for module-scoped options
 */

const start = (function () {
	"use strict";

	const modName = "bind";

	/********************************************************************
	 * Optional module defaults
	 * Merged into system.options.<moduleName> BEFORE start() runs
	 ********************************************************************/
	function defaults() {
		return { debug: false };
	}

	/******************************************************************
	 * bind start
	 ******************************************************************/
	return function start(system) {
		const base = system.base;
		const dom = system.dom;
		const defineLocked = system.base.defineLocked;

		const log = system.log.scope("ezWeb").scope(modName);
		const options = system.options[modName] || {};
		if (options.debug) log.debug("Starting " + modName + " module", options);

		/******************************************************************
		 * Binding registries
		 ******************************************************************/
		// pathString -> binding record[]
		const _bindings = Object.create(null);

		// Subtree bindings (object/array binds)
		const _deepBindings = []; // [{ pathString, apply, el }...]

		// backtickKeyPathString -> record[]
		const _btBindings = Object.create(null);

		// dataKey pathString -> for-record[]
		const _forBindings = Object.create(null);

		// raw object/array -> Map(pathString -> pathArr)
		const rawPaths = new WeakMap();

		// one rebuild per element per tick
		const _pendingSelectRebuild = new WeakMap();

		// one ezFor rebuild per record per tick
		const _pendingForRebuild = new WeakMap();

		/******************************************************************
		 * Registry helpers
		 ******************************************************************/
		function _scheduleForRebuild(rec) {
			if (!rec || !rec.anchor) return;
			if (_pendingForRebuild.has(rec)) return;

			_pendingForRebuild.set(rec, true);

			queueMicrotask(function () {
				_pendingForRebuild.delete(rec);
				if (!rec.anchor || !rec.anchor.parentNode) return;
				_renderForRecord(rec);
			});
		}

		function _scheduleSelectRebuild(el, getModelFn) {
			if (!el || el.nodeType !== 1) return;
			if (_pendingSelectRebuild.has(el)) return;

			_pendingSelectRebuild.set(el, true);

			queueMicrotask(function () {
				_pendingSelectRebuild.delete(el);

				// dead guard
				if (!el.isConnected) return;

				const model = getModelFn ? getModelFn() : null;
				if (!_isEzSelectModel(model)) return;

				// protect against reentrancy
				if (el.__ezUpdating === true) return;

				el.__ezUpdating = true;
				try { _rebuildSelectFromModel(el, model); }
				finally { el.__ezUpdating = false; }
			});
		}

		function _addBinding(pathString, rec) {
			if (!rec) return;
			if (!_bindings[pathString]) _bindings[pathString] = [];
			_bindings[pathString].push(rec);
		}

		function _addDeepBinding(pathString, rec) {
			if (!rec) return;
			rec.pathString = pathString;
			_deepBindings.push(rec);
		}

		function _notifyBindings(pathString) {
			const list = _bindings[pathString];
			if (!list || list.length === 0) return;

			if (options.debug) log.debug("_notifyBindings", { key: pathString, count: list.length });

			for (let i = 0; i < list.length; i++) {
				const b = list[i];
				if (!b || !b.el) continue;

				// dead element guard (elements only)
				if (b.el.nodeType === 1 && !b.el.isConnected) continue;

				if (typeof b.apply !== "function") continue;
				try { b.apply(); }
				catch (e) { log.error("ezBind apply failed for " + pathString, e); }
			}
		}

		function _notifyDeepBindings(change) {
			if (!change || !change.pathString) return;

			const p = change.pathString;
			const tgt = change.target; // raw target

			for (let i = 0; i < _deepBindings.length; i++) {
				const r = _deepBindings[i];
				if (!r || typeof r.apply !== "function") continue;

				// dead element guard
				if (r.el && r.el.nodeType === 1 && !r.el.isConnected) continue;

				try {
					// path-based trigger (normal behavior)
					if (_isPathPrefix(r.pathString, p)) { r.apply(p); continue; }

					// alias-based trigger (select model subtree)
					if (tgt) {
						const rootRaw = r.getRootRaw ? r.getRootRaw() : null;
						if (_modelContainsTarget(rootRaw, tgt)) { r.apply(p); continue; }
					}
				}
				catch (e) {
					log.error("deep bind apply failed for " + (r.pathString || "(unknown)"), e);
				}
			}
		}

		function _addBtBinding(pathString, rec) {
			if (!_btBindings[pathString]) _btBindings[pathString] = [];
			_btBindings[pathString].push(rec);
		}

		function _notifyBackTicks(pathString) {
			const list = _btBindings[pathString];
			if (!list || list.length === 0) return;

			for (let i = 0; i < list.length; i++) {
				const r = list[i];
				if (!r || !r.el) continue;

				// If record provides apply(), prefer it (works for TEXT + ATTR)
				if (typeof r.apply === "function") {
					try { r.apply(pathString); }
					catch (e) { log.error("backticks apply failed for " + pathString, e); }
					continue;
				}
			}
		}

		function _addForBinding(pathString, rec) {
			if (!_forBindings[pathString]) _forBindings[pathString] = [];
			_forBindings[pathString].push(rec);
		}

		function _notifyFor(changedPathString) {
			for (const k in _forBindings) {
				if (!_isPathPrefix(k, changedPathString)) continue;

				const list = _forBindings[k];
				if (!list || list.length === 0) continue;

				for (let i = 0; i < list.length; i++) {
					const r = list[i];
					if (!r || !r.anchor || !r.anchor.parentNode) continue;
					_scheduleForRebuild(r);
				}
			}
		}

		function _notifyDescendants(prefixPathString) {
			if (!prefixPathString) return;

			const dotPrefix = prefixPathString + ".";
			const brkPrefix = prefixPathString + "[";

			// ---- ezBind leaf bindings ----
			for (const k in _bindings) {
				if (k === prefixPathString) continue;
				if (k.indexOf(dotPrefix) === 0 || k.indexOf(brkPrefix) === 0) _notifyBindings(k);
			}

			// ---- backticks ----
			for (const k in _btBindings) {
				if (k === prefixPathString) continue;
				if (k.indexOf(dotPrefix) === 0 || k.indexOf(brkPrefix) === 0) _notifyBackTicks(k);
			}

			// ---- ezFor ----
			_notifyFor(prefixPathString);
		}

		function _registerRawPath(raw, pathArr) {
			if (!base.isObj(raw) && !Array.isArray(raw)) return;
			const ps = _pathToString(pathArr);
			let map = rawPaths.get(raw);
			if (!map) { map = new Map(); rawPaths.set(raw, map); }
			if (!map.has(ps)) map.set(ps, pathArr.slice());
		}

		/******************************************************************
		 * Path utilities
		 ******************************************************************/
		function _parsePath(pathString) {
			let s = String(pathString || "").trim();
			if (!s) return [];

			const out = [];
			let i = 0;

			function isIdentStart(ch) { return /[A-Za-z_$]/.test(ch); }
			function isIdentChar(ch) { return /[A-Za-z0-9_$]/.test(ch); }

			while (i < s.length) {
				const ch = s[i];

				if (ch === ".") { i++; continue; }

				if (ch === "[") {
					i++;
					while (i < s.length && /\s/.test(s[i])) i++;

					if (s[i] === '"' || s[i] === "'") {
						const q = s[i++];
						let buf = "";
						while (i < s.length && s[i] !== q) {
							if (s[i] === "\\" && i + 1 < s.length) {
								buf += s[i + 1];
								i += 2;
							} else {
								buf += s[i++];
							}
						}
						if (s[i] === q) i++;
						while (i < s.length && /\s/.test(s[i])) i++;
						if (s[i] === "]") i++;

						out.push(buf);
						continue;
					}

					let num = "";
					while (i < s.length && /[0-9]/.test(s[i])) num += s[i++];

					while (i < s.length && /\s/.test(s[i])) i++;
					if (s[i] === "]") i++;

					if (num !== "") out.push(parseInt(num, 10));
					continue;
				}

				if (isIdentStart(ch)) {
					let name = "";
					while (i < s.length && isIdentChar(s[i])) name += s[i++];
					if (name) out.push(name);
					continue;
				}

				i++;
			}

			return out;
		}

		function _pathToString(pathArr) {
			let s = "";
			for (let i = 0; i < pathArr.length; i++) {
				const k = pathArr[i];
				if (typeof k === "number" || /^\d+$/.test(String(k))) { s += "[" + k + "]"; continue; }
				const ks = String(k);
				if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ks)) s += (s ? "." : "") + ks;
				else s += "[" + JSON.stringify(ks) + "]";
			}
			return s;
		}

		function _getAtPath(root, pathArr) {
			let cur = root;
			for (let i = 0; i < pathArr.length; i++) {
				if (cur == null) return undefined;
				cur = cur[pathArr[i]];
			}
			return cur;
		}

		function _setAtPath(root, pathArr, value) {
			if (!root || !pathArr || pathArr.length === 0) return;

			let cur = root;

			for (let i = 0; i < pathArr.length - 1; i++) {
				const k = pathArr[i];

				let next = Reflect.get(cur, k);
				if (next == null) {
					const nk = pathArr[i + 1];
					const made = (typeof nk === "number" || /^\d+$/.test(String(nk))) ? [] : {};
					Reflect.set(cur, k, made);
					next = Reflect.get(cur, k);
				}

				cur = next;
			}

			const last = pathArr[pathArr.length - 1];
			Reflect.set(cur, last, value);
		}

		function _isPathPrefix(prefix, full) {
			if (!prefix || !full) return false;
			if (full === prefix) return true;
			if (full.indexOf(prefix) !== 0) return false;

			const ch = full.charAt(prefix.length);
			return (ch === "." || ch === "[");
		}

		/******************************************************************
		 * DOM find helper (scoped to mount via dom())
		 ******************************************************************/
		function _findMacthingEls(ctxLog, selectors, context) {
			const fmeLog = ctxLog.scope("findMacthingEls");

			const targets = dom(selectors, context);
			const els = targets.els ? targets.els.slice() : [];

			if (context && context.nodeType === 1 && context.matches(selectors)) {
				els.push(context);
			}

			if (options.debug) fmeLog.debug("Returning " + els.length + " elements.", els);
			return els;
		}

		/******************************************************************
		 * Deep Proxy (reactive data core)
		 ******************************************************************/
		function _makeDeepProxy() {
			if (system.data && system.data.__isEzDeepProxy === true) return;
			if (!base.isObj(system.data)) system.data = {};

			const INTERNAL = {
				isProxy: "__isEzDeepProxy",
				onChange: "__onChange",
				raw: "__raw"
			};

			let onChangeHook = null;
			const proxyCache = new WeakMap();

			function _isInternalKey(k) {
				return k === INTERNAL.isProxy || k === INTERNAL.onChange || k === INTERNAL.raw;
			}

			function _emitChange(change) {
				if (typeof onChangeHook === "function") {
					try { onChangeHook(change); }
					catch (e) { log.error("data __onChange failed", e); }
				}
			}

			function _emitAllAliases(targetRaw, primaryPathArr, changeFactory) {
				const map = rawPaths.get(targetRaw);
				if (!map || map.size === 0) {
					_emitChange(changeFactory(primaryPathArr));
					return;
				}
				map.forEach((aliasPathArr) => {
					_emitChange(changeFactory(aliasPathArr));
				});
			}

			function _wrap(value, pathArr) {
				if (!base.isObj(value) && !Array.isArray(value)) return value;
				if (value && value[INTERNAL.isProxy] === true) return value;

				_registerRawPath(value, pathArr);

				const pathKey = _pathToString(pathArr);

				let map = proxyCache.get(value);
				if (!map) { map = new Map(); proxyCache.set(value, map); }

				const cached = map.get(pathKey);
				if (cached) return cached;

				const handler = {
					get(target, prop, receiver) {
						if (prop === INTERNAL.isProxy) return true;
						if (prop === INTERNAL.raw) return target;
						if (prop === INTERNAL.onChange) return onChangeHook;

						const out = Reflect.get(target, prop, receiver);
						return (base.isObj(out) || Array.isArray(out)) ? _wrap(out, pathArr.concat([prop])) : out;
					},

					set(target, prop, value, receiver) {
						if (prop === INTERNAL.onChange) {
							onChangeHook = (typeof value === "function") ? value : null;
							return true;
						}

						if (_isInternalKey(prop)) return true;

						const had = Object.prototype.hasOwnProperty.call(target, prop);
						const oldValue = target[prop];

						const newValue = (value && value[INTERNAL.isProxy] === true && value[INTERNAL.raw])
							? value[INTERNAL.raw]
							: value;

						if (had && oldValue === newValue) return true;

						const ok = Reflect.set(target, prop, newValue, receiver);
						if (!ok) return false;

						_emitAllAliases(target, pathArr, function (aliasPathArr) {
							const aliasFullPath = aliasPathArr.concat([prop]);
							return {
								type: had ? "set" : "add",
								path: aliasFullPath,
								pathString: _pathToString(aliasFullPath),
								target: target,
								prop: prop,
								value: newValue,
								oldValue: oldValue
							};
						});

						return true;
					},

					deleteProperty(target, prop) {
						if (_isInternalKey(prop)) return true;
						if (!Object.prototype.hasOwnProperty.call(target, prop)) return true;

						const oldValue = target[prop];
						const ok = Reflect.deleteProperty(target, prop);
						if (!ok) return false;

						const fullPath = pathArr.concat([prop]);

						_emitChange({
							type: "delete",
							path: fullPath,
							pathString: _pathToString(fullPath),
							target: target,
							prop: prop,
							value: undefined,
							oldValue: oldValue
						});

						return true;
					},

					defineProperty(target, prop, desc) {
						if (_isInternalKey(prop)) return Reflect.defineProperty(target, prop, desc);

						const had = Object.prototype.hasOwnProperty.call(target, prop);
						const oldValue = target[prop];

						const ok = Reflect.defineProperty(target, prop, desc);
						if (!ok) return false;

						const fullPath = pathArr.concat([prop]);

						_emitChange({
							type: had ? "define" : "add",
							path: fullPath,
							pathString: _pathToString(fullPath),
							target: target,
							prop: prop,
							value: target[prop],
							oldValue: oldValue
						});

						return true;
					}
				};

				const proxy = new Proxy(value, handler);
				map.set(pathKey, proxy);
				return proxy;
			}

			system.data = _wrap(system.data, []);
			Object.defineProperty(system.data, INTERNAL.isProxy, { value: true, enumerable: false });

			if (options.debug) log.debug("system.data deep-proxied");
		}

		/******************************************************************
		 * Data change hook (bind module installs)
		 ******************************************************************/
		function _installDataChangeHook() {
			if (!system.data || system.data.__isEzDeepProxy !== true) return;

			if (system.data.__ezBindHookInstalled === true) return;
			Object.defineProperty(system.data, "__ezBindHookInstalled", {
				value: true, enumerable: false, configurable: false
			});

			system.data.__onChange = function (change) {
				if (!change || !change.pathString) return;

				const p = change.pathString;

				// 1) subtree bindings FIRST (object/array roots)
				_notifyDeepBindings(change);

				// 2) exact leaf key
				_notifyBindings(p);
				_notifyBackTicks(p);
				_notifyFor(p);

				const isObjReplace =
					(change.type === "set" || change.type === "add" || change.type === "define") &&
					(change.value && typeof change.value === "object");

				if (isObjReplace) _notifyDescendants(p);

				// 3) parents
				const arr = _parsePath(p);
				while (arr.length > 0) {
					arr.pop();
					if (arr.length === 0) break;
					const parent = _pathToString(arr);
					_notifyBindings(parent);
					_notifyBackTicks(parent);
					_notifyFor(parent);
				}
			};

			if (options.debug) log.debug("bind: installed system.data.__onChange hook");
		}

		/******************************************************************
		 * Backtick binding core
		 ******************************************************************/
		function _hasBackTicks(s) {
			return String(s || "").indexOf("``") !== -1;
		}

		function _extractBackTickKeys(template) {
			const keys = [];
			const re = /``([^`]+)``/g;
			let m;
			while ((m = re.exec(String(template || "")))) {
				const k = String(m[1] || "").trim();
				if (!k) continue;
				keys.push(k);
			}
			return keys;
		}

		function _renderBackTickTemplate(template) {
			return String(template || "").replace(/``([^`]+)``/g, function (_all, keyRaw) {
				const key = String(keyRaw || "").trim();
				if (!key) return "";
				const pathArr = _parsePath(key);
				const v = _getAtPath(system.data, pathArr);
				return (v == null) ? "" : String(v);
			});
		}

		/******************************************************************
		 * Backtick binding: ATTRIBUTES
		 ******************************************************************/
		function _findBackTicksInAttrs(context) {
			const out = [];
			if (!context) return out;

			let root = context;
			if (root && root.els && root.els[0]) root = root.els[0];
			if (!root) return out;

			function scanEl(el) {
				if (!el || el.nodeType !== 1) return;

				const attrs = el.attributes;
				if (!attrs || attrs.length === 0) return;

				let foundAny = false;
				const specAttrs = [];

				for (let i = 0; i < attrs.length; i++) {
					const a = attrs[i];
					if (!a) continue;
					if (!_hasBackTicks(a.value)) continue;

					const keys = _extractBackTickKeys(a.value);
					if (keys.length === 0) continue;

					foundAny = true;
					specAttrs.push({
						name: a.name,
						template: String(a.value),
						keys: keys
					});
				}

				if (!foundAny) return;

				el.__ezBackTickSpec = {
					attrs: specAttrs
				};

				out.push(el);
			}

			// root itself
			scanEl(root);

			// descendants
			const kids = root.querySelectorAll ? root.querySelectorAll("*") : [];
			for (let i = 0; i < kids.length; i++) scanEl(kids[i]);

			return out;
		}

		function _bindBackTicksAttrs(el) {
			if (!el || el.nodeType !== 1) return;

			const flag = "__ezBackTicksAttrsBound";
			if (el[flag] === true) return;
			el[flag] = true;

			const spec = el.__ezBackTickSpec;
			if (!spec || !spec.attrs || spec.attrs.length === 0) return;

			const rec = {
				el: el,
				attrs: spec.attrs,
				apply: function () {
					if (!el.isConnected) return;
					for (let i = 0; i < spec.attrs.length; i++) {
						const a = spec.attrs[i];
						const rendered = _renderBackTickTemplate(a.template);
						el.setAttribute(a.name, rendered);
					}
				}
			};

			// first apply
			rec.apply();

			// register keys
			for (let i = 0; i < spec.attrs.length; i++) {
				const a = spec.attrs[i];
				for (let k = 0; k < a.keys.length; k++) {
					const pathString = _pathToString(_parsePath(a.keys[k]));
					_addBtBinding(pathString, rec);
				}
			}
		}

		/******************************************************************
		 * Backtick binding: TEXT NODES (TreeWalker)
		 ******************************************************************/
		function _bindTickTextTree(root) {
			const nt = root ? root.nodeType : 0;
			if (nt !== 1 && nt !== 9 && nt !== 11) return;

			// TreeWalker needs NodeFilter in some environments; guard hard.
			if (typeof document === "undefined" || !document.createTreeWalker) return;
			if (typeof NodeFilter === "undefined") return;

			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);

			let n;
			while ((n = walker.nextNode())) {
				_bindTickTextNode(n);
			}
		}

		function _bindTickTextNode(textNode) {
			if (!textNode || textNode.nodeType !== 3) return;

			const flag = "__ezBackTicksTextBound";
			if (textNode[flag] === true) return;

			const template = String(textNode.nodeValue || "");
			if (!_hasBackTicks(template)) return;

			const keys = _extractBackTickKeys(template);
			if (!keys || keys.length === 0) return;

			textNode[flag] = true;

			const rec = {
				el: textNode,
				template: template,
				apply: function () {
					// dead guard
					if (!textNode.parentNode) return;
					textNode.nodeValue = _renderBackTickTemplate(template);
				}
			};

			// first apply
			rec.apply();

			// register keys
			for (let i = 0; i < keys.length; i++) {
				const pathString = _pathToString(_parsePath(keys[i]));
				_addBtBinding(pathString, rec);
			}
		}

		/******************************************************************
		 * Backticks: one entrypoint (separate from bindData)
		 ******************************************************************/
		function _bindTicks(context) {
			if (!context) return;

			let root = context;
			if (root && root.els && root.els[0]) root = root.els[0];
			if (!root) return;

			// 1) TEXT nodes
			_bindTickTextTree(root);

			// 2) ATTRIBUTES
			const btEls = _findBackTicksInAttrs(root);
			for (let i = 0; i < btEls.length; i++) _bindBackTicksAttrs(btEls[i]);
		}

		/******************************************************************
		 * ezFor
		 ******************************************************************/
		function _findFor(context) {
			const out = [];
			if (!context) return out;

			let root = context;
			if (root && root.els && root.els[0]) root = root.els[0];

			function scanEl(el) {
				if (!el || el.nodeType !== 1) return;
				if (!el.hasAttribute("ezFor")) return;
				out.push(el);
			}

			scanEl(root);

			const kids = root.querySelectorAll ? root.querySelectorAll("[ezFor]") : [];
			for (let i = 0; i < kids.length; i++) out.push(kids[i]);

			return out;
		}

		function _prefixTemplateKeysInTree(rootEl, prefix) {
			const all = [rootEl];
			if (rootEl.querySelectorAll) {
				const kids = rootEl.querySelectorAll("*");
				for (let i = 0; i < kids.length; i++) all.push(kids[i]);
			}

			for (let i = 0; i < all.length; i++) {
				const el = all[i];
				if (!el || el.nodeType !== 1) continue;

				// ezBind
				if (el.hasAttribute("ezBind")) {
					const subKey = String(el.getAttribute("ezBind") || "").trim();
					if (subKey && subKey.indexOf(prefix) !== 0) {
						el.setAttribute("ezBind", prefix + "." + subKey);
					}
				}

				// backticks in attributes (text nodes are handled later by compile)
				const attrs = el.attributes;
				if (!attrs) continue;

				for (let j = 0; j < attrs.length; j++) {
					const a = attrs[j];
					if (!a || typeof a.value !== "string") continue;
					if (a.value.indexOf("``") === -1) continue;

					const newVal = a.value.replace(/``([^`]+)``/g, function (_all, key) {
						const k = String(key || "").trim();
						if (!k) return _all;
						if (k.indexOf(prefix) === 0) return "``" + k + "``";
						return "``" + prefix + "." + k + "``";
					});

					if (newVal !== a.value) el.setAttribute(a.name, newVal);
				}
			}
		}

		function _renderForRecord(rec) {
			const arr = _getAtPath(system.data, rec.pathArr);

			// clear previous
			for (let i = 0; i < rec.rendered.length; i++) {
				const n = rec.rendered[i];
				if (n && n.parentNode) n.parentNode.removeChild(n);
			}
			rec.rendered = [];

			if (!Array.isArray(arr)) {
				if (options.debug) log.warn("ezFor expected array at " + rec.dataKey, { value: arr });
				return;
			}

			// insert in correct order by iterating from end
			for (let i = arr.length - 1; i >= 0; i--) {
				const item = rec.template.cloneNode(true);
				item.removeAttribute("ezFor");

				const prefix = rec.dataKey + "[" + i + "]";

				item.setAttribute("ezForChild", prefix);
				item.setAttribute("ezForIndex", i);

				_prefixTemplateKeysInTree(item, prefix);

				rec.anchor.parentNode.insertBefore(item, rec.anchor.nextSibling);
				rec.rendered.push(item);

				const w = dom(item);
				if (w && typeof w.show === "function") w.show();

				compile(item);
			}
		}

		function _bindFor(context) {
			const bindForLog = log.scope("bindFor");
			const els = _findFor(context);

			for (let i = 0; i < els.length; i++) {
				const tpl = els[i];
				if (!tpl || tpl.nodeType !== 1) continue;

				const flag = "__ezForBound";
				if (tpl[flag] === true) continue;
				tpl[flag] = true;

				const dataKey = String(tpl.getAttribute("ezFor") || "").trim();
				if (!dataKey) continue;

				const pathArr = _parsePath(dataKey);
				const pathString = _pathToString(pathArr);

				const anchor = document.createComment("ezFor:" + dataKey);
				tpl.parentNode.insertBefore(anchor, tpl);

				const template = tpl.cloneNode(true);
				tpl.parentNode.removeChild(tpl);

				const rec = {
					dataKey: dataKey,
					pathArr: pathArr,
					pathString: pathString,
					anchor: anchor,
					template: template,
					rendered: []
				};

				_addForBinding(pathString, rec);
				_renderForRecord(rec);
			}

			if (options.debug) {
				const err = new Error("_bindFor call stack");
				bindForLog.debug("Bound ezFor on " + els.length + " templates", err.stack);
			}
		}

		/******************************************************************
		 * Element read/write helpers
		 ******************************************************************/
		function _readElValue(el) {
			if (!el || el.nodeType !== 1) return undefined;

			const tag = (el.tagName || "").toLowerCase();
			const type = String(el.type || "").toLowerCase();

			if (tag === "input") {
				if (type === "checkbox") return !!el.checked;
				if (type === "radio") return el.checked ? el.value : undefined;
				return el.value;
			}
			if (tag === "textarea") return el.value;

			if (tag === "select") {
				if (el.multiple) {
					const out = [];
					for (let i = 0; i < el.options.length; i++) {
						const opt = el.options[i];
						if (opt.selected) out.push(opt.value);
					}
					return out;
				}
				return el.value;
			}

			return el.textContent;
		}

		function _writeElValue(el, value) {
			if (!el || el.nodeType !== 1) return;

			const tag = (el.tagName || "").toLowerCase();
			const type = String(el.type || "").toLowerCase();

			if (tag === "input") {
				if (type === "checkbox") { el.checked = !!value; return; }
				if (type === "radio") { el.checked = (String(el.value) === String(value)); return; }
				el.value = (value == null) ? "" : String(value);
				return;
			}

			if (tag === "textarea") {
				el.value = (value == null) ? "" : String(value);
				return;
			}

			if (tag === "select") {
				if (_isEzSelectModel(value)) {
					el.__ezUpdating = true;
					try { _rebuildSelectFromModel(el, value); }
					finally { el.__ezUpdating = false; }
					return;
				}
				el.value = (value == null) ? "" : String(value);
				return;
			}

			el.textContent = (value == null) ? "" : String(value);
		}

		/******************************************************************
		 * Dropdown model support
		 ******************************************************************/
		const isSelectModelLog = log.scope("isEzSelectModel");
		function _isEzSelectModel(v) {
			if (!v || typeof v !== "object") return false;
			if (typeof v.selectedValue === "undefined") return false;

			if (!Array.isArray(v.options)) {
				if (options.debug) {
					isSelectModelLog.warn("ezBind <select>: options is not an array", {
						options: v.options,
						model: v
					});
				}
				return false;
			}

			return true;
		}

		function _modelContainsTarget(modelRaw, targetRaw) {
			if (!modelRaw || !targetRaw) return false;
			if (modelRaw === targetRaw) return true;
			if (modelRaw.options && modelRaw.options === targetRaw) return true;

			const opts = modelRaw.options;
			if (Array.isArray(opts)) {
				for (let i = 0; i < opts.length; i++) {
					if (opts[i] === targetRaw) return true;
				}
			}
			return false;
		}

		function _rebuildSelectFromModel(sel, model) {
			const opts = model.options;
			const selectedValue = (model.selectedValue == null) ? "" : String(model.selectedValue);

			while (sel.firstChild) sel.removeChild(sel.firstChild);

			for (let i = 0; i < opts.length; i++) {
				const entry = opts[i];

				if (!Array.isArray(entry) || entry.length < 2) {
					if (options.debug) log.warn("ezBind <select>: invalid option tuple", entry);
					continue;
				}

				const value = String(entry[0]);
				const enabled = (entry[1] === true);

				const opt = document.createElement("option");
				opt.value = value;
				opt.textContent = value;
				opt.disabled = !enabled;

				sel.appendChild(opt);
			}

			sel.value = selectedValue;

			if (selectedValue !== "" && sel.value !== selectedValue) {
				if (options.debug) {
					log.warn("ezBind <select>: selectedValue invalid or disabled", {
						selectedValue: selectedValue,
						options: opts
					});
				}
				sel.selectedIndex = -1;
			}
		}

		/******************************************************************
		 * bindData: ezBind + dropdown model (NO backticks here)
		 ******************************************************************/
		function _bindData(context) {
			const bindDataLog = log.scope("bindData");

			const els = _findMacthingEls(bindDataLog, "[ezBind]", context);

			function _toRaw(v) {
				if (!v) return v;
				if (v.__isEzDeepProxy === true && typeof v.__raw !== "undefined") return v.__raw;
				return v;
			}

			function bindOne(el) {
				if (!el || el.nodeType !== 1) return;

				const flag = "__ezBindBound";
				if (el[flag] === true) return;
				el[flag] = true;

				const key = String(el.getAttribute("ezBind") || "").trim();
				if (!key) return;

				const pathArr = _parsePath(key);
				const pathString = _pathToString(pathArr);

				_addBinding(pathString, {
					el: el,
					pathArr: pathArr,
					apply: function () {
						const model = _getAtPath(system.data, pathArr);
						if (_isEzSelectModel(model)) {
							el.__ezUpdating = true;
							try { _rebuildSelectFromModel(el, model); }
							finally { el.__ezUpdating = false; }
						} else {
							_writeElValue(el, model);
						}
					}
				});

				const tag = (el.tagName || "").toLowerCase();
				const type = String(el.type || "").toLowerCase();

				// initial push
				const initial = _getAtPath(system.data, pathArr);
				_writeElValue(el, initial);

				// Deep subscribe if object/array OR select model binding
				const wantsDeep = (tag === "select") || (initial && typeof initial === "object");

				if (wantsDeep) {
					_addDeepBinding(pathString, {
						el: el,
						rootPath: pathString,
						getRootRaw: function () {
							const v = _getAtPath(system.data, pathArr);
							return _toRaw(v);
						},
						apply: function (changedPath) {
							const cur = _getAtPath(system.data, pathArr);

							if (!_isEzSelectModel(cur)) {
								_writeElValue(el, cur);
								return;
							}

							const selPath = pathString + ".selectedValue";
							const optPath = pathString + ".options";

							if (changedPath === selPath) {
								if (el.__ezUpdating === true) return;
								el.__ezUpdating = true;
								try { el.value = (cur.selectedValue == null) ? "" : String(cur.selectedValue); }
								finally { el.__ezUpdating = false; }
								return;
							}

							if (_isPathPrefix(optPath, changedPath) || _isPathPrefix(pathString, changedPath)) {
								_scheduleSelectRebuild(el, function () {
									return _getAtPath(system.data, pathArr);
								});
								return;
							}
						}
					});
				}

				// select special: object model binding
				if (tag === "select") {
					el.addEventListener("change", function () {
						if (el.__ezUpdating === true) return;

						const model = _getAtPath(system.data, pathArr);

						if (options.debug) log.debug("select writeback", {
							bind: el.getAttribute("ezBind"),
							writePath: _pathToString(pathArr.concat(["selectedValue"])),
							value: el.value
						});

						if (_isEzSelectModel(model)) {
							model.selectedValue = el.value;
							return;
						}

						_setAtPath(system.data, pathArr, el.value);
					});

					return;
				}

				// generic inputs: choose event
				let evt = "change";
				if (tag === "textarea") evt = "input";
				else if (tag === "input") {
					if (type === "text" || type === "password" || type === "search" || type === "email" ||
						type === "number" || type === "tel" || type === "url") evt = "input";
					else evt = "change";
				}

				el.addEventListener(evt, function () {
					const v = _readElValue(el);
					if (tag === "input" && type === "radio" && el.checked !== true) return;
					_setAtPath(system.data, pathArr, v);
				});
			}

			for (let i = 0; i < els.length; i++) bindOne(els[i]);

			if (options.debug) {
				const err = new Error("_bindData call stack");
				bindDataLog.debug("Bound data on " + els.length + " elements", err.stack);
			}
		}

		/******************************************************************
		 * Event binding (ezClick / ezChange / etc.)
		 ******************************************************************/
		function _maybeGetOtherContext(el, ev, ctxLog) {
			const mLog = ctxLog.scope("_maybeGetOtherContext");
			if (!bind || typeof bind._getOtherContext !== "function") return null;
			try {
				const other = bind._getOtherContext(el, ev);
				return (other && typeof other === "object") ? other : null;
			}
			catch (e) {
				mLog.warn("_getOtherContext failed", e);
				return null;
			}
		}

		function _resolveContext(el, ev, ctxLog) {
			const other = _maybeGetOtherContext(el, ev, ctxLog);

			const ctx = {
				el: el,
				sender: el,
				event: ev || null,
				type: ev ? ev.type : null,
				id: el ? (el.id || el.getAttribute("name") || null) : null,
				name: el ? (el.getAttribute("name") || null) : null,
				target: ev ? (ev.target || null) : null,

				data: (el && el.dataset) ? el.dataset : null,

				key: ev && typeof ev.key !== "undefined" ? ev.key : null,
				code: ev && typeof ev.code !== "undefined" ? ev.code : null
			};

			if (other) {
				for (const k in other) {
					if (!Object.prototype.hasOwnProperty.call(other, k)) continue;
					if (k === "el" || k === "sender" || k === "event" || k === "target") continue;
					ctx[k] = other[k];
				}
			}

			return ctx;
		}

		function _parsePathLoose(pathString) {
			let s = String(pathString || "").trim();
			if (!s) return [];

			if (s.indexOf("system.data.") === 0) s = s.substring("system.data.".length);
			s = s.replace(/\(\)\s*;?\s*$/, "");

			const out = [];
			let i = 0;

			function isIdentStart(ch) { return /[A-Za-z_$]/.test(ch); }
			function isIdentChar(ch) { return /[A-Za-z0-9_$]/.test(ch); }

			while (i < s.length) {
				const ch = s[i];

				if (ch === ".") { i++; continue; }

				if (ch === "[") {
					i++;
					while (i < s.length && /\s/.test(s[i])) i++;

					if (s[i] === '"' || s[i] === "'") {
						const q = s[i++];
						let buf = "";
						while (i < s.length && s[i] !== q) {
							if (s[i] === "\\" && i + 1 < s.length) {
								buf += s[i + 1];
								i += 2;
							} else {
								buf += s[i++];
							}
						}
						if (s[i] === q) i++;
						while (i < s.length && /\s/.test(s[i])) i++;
						if (s[i] === "]") i++;

						out.push(buf);
						continue;
					}

					let num = "";
					let j = i;
					while (j < s.length && /[0-9]/.test(s[j])) { num += s[j]; j++; }

					if (num === "" && isIdentStart(s[i])) {
						let name = "";
						while (i < s.length && isIdentChar(s[i])) name += s[i++];
						while (i < s.length && /\s/.test(s[i])) i++;
						if (s[i] === "]") i++;
						if (name) out.push(name);
						continue;
					}

					i = j;
					while (i < s.length && /\s/.test(s[i])) i++;
					if (s[i] === "]") i++;

					if (num !== "") out.push(parseInt(num, 10));
					continue;
				}

				if (isIdentStart(ch)) {
					let name = "";
					while (i < s.length && isIdentChar(s[i])) name += s[i++];
					if (name) out.push(name);
					continue;
				}

				i++;
			}

			return out;
		}

		function _getAtPathSafe(root, pathArr) {
			let cur = root;
			for (let i = 0; i < pathArr.length; i++) {
				if (cur == null) return undefined;

				const k = pathArr[i];
				if (k === "__proto__" || k === "prototype" || k === "constructor") return undefined;

				cur = cur[k];
			}
			return cur;
		}

		function _executeCodeString(codeString, context, meta, onErr) {
			const execLog = log.scope("executeCodeString");

			const raw = String(codeString || "").trim();
			if (!raw) return;

			const pathArr = _parsePathLoose(raw);
			if (!pathArr || pathArr.length === 0) return;

			const fnKey = pathArr[pathArr.length - 1];
			const parentPath = pathArr.slice(0, -1);

			const parent = (parentPath.length === 0) ? system.data : _getAtPathSafe(system.data, parentPath);
			const fn = (parent != null) ? parent[fnKey] : undefined;

			if (typeof fn !== "function") {
				if (options.debug) {
					execLog.warn("ezClick target is not a function: " + String(raw), {
						path: raw,
						pathArr: pathArr,
						resolvedType: typeof fn
					});
				}
				return;
			}

			try {
				return fn.call(parent, system, context, meta);
			} catch (e) {
				const label = (meta && meta.sourceName) ? String(meta.sourceName) : "ezWeb.invoke";
				const msg = "Error executing handler for " + label;

				if (typeof onErr === "function") {
					try { execLog.error(msg, onErr(e)); }
					catch (e2) { execLog.error(msg + " (onErr threw)", e2); }
					return;
				}

				if (onErr) {
					execLog.error(msg, { meta: meta, onErr: onErr, error: e });
					return;
				}

				execLog.error(msg, e);
			}
		}

		function _bindEvents(context) {
			const bindEventsLog = log.scope("bindEvents");

			const specs = [
				{ attr: "ezClick", evt: "click" },
				{ attr: "ezChange", evt: "change" },
				{ attr: "ezInput", evt: "input" },
				{ attr: "ezKeyDown", evt: "keydown" },
				{ attr: "ezKeyUp", evt: "keyup" },
				{ attr: "ezBlur", evt: "blur" },
				{ attr: "ezFocus", evt: "focus" }
			];

			const selectors = specs.map(s => "[" + s.attr + "]").join(",");
			const els = _findMacthingEls(bindEventsLog, selectors, context);

			function eachStatement(codeStr, fn) {
				String(codeStr || "").split(";").forEach((part, idx) => {
					const trimmed = part.trim();
					if (!trimmed) return;
					fn(trimmed, idx);
				});
			}

			function bindEvent(el, spec) {
				if (!el.hasAttribute(spec.attr)) return;

				const flag = "__" + spec.attr + "Bound";
				if (el[flag] === true) return;
				el[flag] = true;

				el.addEventListener(spec.evt, function (ev) {
					const codes = el.getAttribute(spec.attr);
					if (!codes) return;

					const ctx = _resolveContext(el, ev, bindEventsLog);

					eachStatement(codes, (stmt, idx) => {
						_executeCodeString(stmt, ctx, {
							sourceName: spec.attr + ":" + (el.id || el.getAttribute("id") || el.getAttribute("name") || "anon") + " #" + idx
						});
					});
				});
			}

			for (let i = 0; i < els.length; i++) {
				const el = els[i];
				for (let j = 0; j < specs.length; j++) bindEvent(el, specs[j]);
			}

			if (options.debug) {
				const err = new Error("_bindEvents call stack");
				bindEventsLog.debug("Bound events on " + els.length + " elements", err.stack);
			}
		}

		/******************************************************************
		 * Public API + compile hook
		 ******************************************************************/
		const bind = Object.create(null);

		function compile(context) {
			_bindFor(context);       // expand templates first
			_bindTicks(context);     // then backticks (TEXT + ATTR)
			_bindData(context);      // then ezBind + select models
			_bindEvents(context);    // then events
		}

		defineLocked(system, modName, bind);
		defineLocked(dom.fn, "__ezCompile", compile);

		// Init core systems
		_makeDeepProxy();
		_installDataChangeHook();

		// First compile pass
		compile(system.appEl);

		log.info(modName + " module ready");
		return bind;
	};

	start.defaults = defaults();

})();

export default start;