
/* ezDOM.js
 * ezWeb Framework Module
 * Version: 0.0.9
 *
 * Contract:
 * - File registers a FUNCTION: start(system) into window.__ezWebMods[modName]
 * - Loader calls start(system) exactly once per app mount
 * - Module attaches API to system.dom (callable function object)
 * - Optional: start.defaults for module-scoped options
 */

const start = (function () {
	"use strict";

	const modName = "dom";

	/********************************************************************
	 * Optional module defaults
	 * Merged into system.options.dom BEFORE start() runs
	 ********************************************************************/
	function defaults() {
		return {
			debug: false,

			// Query scoping:
			// - true  => dom("...") queries inside system.appEl
			// - false => dom("...") queries document-wide
			scopeToMount: true
		};
	}

	/******************************************************************
	 * dom start
	 * -Module entrypoint, attaches API to system bag
	 * @param {object} the system bag
	 ******************************************************************/
	return function start(system) {
		//import base
		const base = system.base;
		
		//import defineLocked
		const defineLocked = base.defineLocked;
		

		// Scoped logger for this module
		const log = system.log.scope("ezWeb").scope(modName);

		// Module options (already merged by loader)
		const options = system.options[modName] || {};

		if (options.debug) log.debug("Starting " + modName + " module", options);

		/******************************************************************
		 * dom _Wrapped
		 * -this wraps HTML elements and adds functions (jQuery-like)
		 * @param {object} input element/s
		 * @param {object} the system bag
		 * @param {object} the scoped log
		 * @param {object} the module options
		 ******************************************************************/
		function _Wrapped(input, system, log, options) {
			const base = system.base;
			const wrapLog = log.scope("Wrapper");

			let els;
			if (input == null) els = [];
			else if (Array.isArray(input)) els = input;
			else els = [input];

			// normalize/clean
			els = els.filter(e => e && e.nodeType === 1);
			
			//get first
			const el = els.length ? els[0] : null;
			
			defineLocked(this, "el", el);
			defineLocked(this, "els", els);
			defineLocked(this, "length", els.length);
			
			if (options && options.debug) wrapLog.debug("Wrapping up " + this.length + " elements");
			
		}
		
		/******************************************************************
		 * dom _Wrapped filter
		 * -this filters elements
		 * -this takes a function that takes an element and returns true or false for each
		 * -the true ones are returned in a NEW _Wrapped instance
		 * -always returns a NEW _Wrapped instance
		 * @param {function} the filter function
		 * @returns {_Wrapped} a new wrapped set containing the filtered elements
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "filter", function filterWrapped(fn) {
			const out = [];
			for (let i = 0; i < this.els.length; i++) {
				if (fn(this.els[i], i)) out.push(this.els[i]);
			}
			return _wrapMany(out);
		});
		
		/******************************************************************
		 * dom _Wrapped each
		 * -this runs a function on each element. 
		 * -the function sent in should take an element
		 * @param {function} the function to run
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "each", function eachWrapped(fn) {
			for (let i = 0; i < this.els.length; i++) fn(this.els[i], i);
			return this;
		});

		/******************************************************************
		 * dom _Wrapped addClass
		 * -this adds a class to each element in the array  
		 * @param {string} the class name to add
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "addClass", function addClassWrapped(cls) {
			for (let i = 0; i < this.els.length; i++) addClass(this.els[i],cls);
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped removeClass
		 * -this adds a class to each element in the array  
		 * @param {string} the class name to add
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "removeClass", function removeClassWrapped(cls) {
			for (let i = 0; i < this.els.length; i++) removeClass(this.els[i],cls);
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped eq
		 * -reduces the current wrapped set to a single element by index
		 * -negative indexes are allowed (from the end)
		 * -always returns a NEW _Wrapped instance
		 * -if index is out of range, returns an empty _Wrapped
		 * @param {number} index the element index to select
		 * @returns {_Wrapped} a new wrapped set containing 0 or 1 element
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "eq", function eqWrapped(i) {
			let idx = (typeof i === "number") ? i : 0;
			if (idx < 0) idx = this.els.length + idx; // negative support

			const el = (idx >= 0 && idx < this.els.length) ? this.els[idx] : null;
			return _wrapMany(el ? [el] : []);
		});

		/******************************************************************
		 * dom _Wrapped first
		 * -reduces the current wrapped set to just the first
		 * -always returns a NEW _Wrapped instance
		 * @returns {_Wrapped} a new wrapped set containing 1 element
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "first", function firstWrapped() {
			return this.eq(0);
		});

		/******************************************************************
		 * dom _Wrapped last
		 * -reduces the current wrapped set to just the first
		 * -always returns a NEW _Wrapped instance
		 * @returns {_Wrapped} a new wrapped set containing 1 element
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "last", function lastWrapped() {
			return this.eq(this.els.length - 1);
		});
		
		/******************************************************************
		 * dom _Wrapped find
		 * -finds all elements by selector
		 * -always returns a NEW _Wrapped instance
		 * @param {string} the selector name
		 * @returns {_Wrapped} a new wrapped set containing 0|1|many element/s
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "find", function findWrapped(sel) {
			const s = String(sel || "").trim();
			if (!s) return _wrapOne();

			const out = [];
			for (let i = 0; i < this.els.length; i++) {
				const found = this.els[i].querySelectorAll(s);
				for (let j = 0; j < found.length; j++) out.push(found[j]);
			}
			return _wrapMany(out);
		});
		
		/******************************************************************
		 * dom _Wrapped attr
		 * -gets or sets an attr on the wrapped set
		 * -getter returns an array of values (one per element)
		 * -setter sets on all elements and returns this for chaining
		 * @param {string|object} name attribute name OR map of attributes
		 * @param {any} (optional) value to set
		 * @returns {string[]|_Wrapped}
		 ******************************************************************/
		function attrWrapped(name, value) {

			// GETTER: attr("id") => string[]
			if (arguments.length === 1 && typeof name === "string") {
				const out = [];
				for (let i = 0; i < this.els.length; i++) {
					// core attr is ELEMENT-ONLY (no wrappers)
					out.push(attr(this.els[i], name));
				}
				return out;
			}

			// SETTER: attr("id","x") OR attr({a:1,b:2}) => this
			for (let i = 0; i < this.els.length; i++) {
				attr(this.els[i], name, value); // core setter
			}
			return this;
		}
		
		defineLocked(_Wrapped.prototype, "attr", attrWrapped);
		
		/******************************************************************
		 * dom _Wrapped prop
		 * -same as attr
		 * @param {string|object} name attribute name OR map of attributes
		 * @param {any} (optional) value to set
		 * @returns {string[]|_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "prop", attrWrapped);
		
		/******************************************************************
		 * dom _Wrapped removeAttr
		 * -removes an attribute from each element
		 * @param {string} attribute name
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		function removeAttrWrapped(name) {
			const key = String(name || "");
			if (!key) return this;

			for (let i = 0; i < this.els.length; i++) removeAttr(this.els[i],key);
			
			return this;
		};
		
		defineLocked(_Wrapped.prototype, "removeAttr", removeAttrWrapped);
		
		/******************************************************************
		 * dom _Wrapped removeProp
		 * -same as removeAttr
		 * @param {string} attribute name
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "removeProp", removeAttrWrapped);
		
		/******************************************************************
		 * dom _Wrapped text
		 * -sets the textContent attr on an element
		 * @param {string} Optional the text to set
		 * returns {string} the textContent
		 * -OR
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "text", function textWrapped(v) {
			// GETTER: return array
			if (arguments.length === 0) {
				const out = [];
				for (let i = 0; i < this.els.length; i++) {
					out.push(text(this.els[i]));
				}
				return out;
			}

			// SETTER: set all, return this
			for (let i = 0; i < this.els.length; i++) {
				text(this.els[i], v);
			}
			return this;
		});

		/******************************************************************
		 * dom _Wrapped html
		 * -sets the innerHTML attr on an element
		 * @param {string} the HTML string to set
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "html", function htmlWrapped(v) {
			// GETTER: return array
			if (arguments.length === 0) {
				const out = [];
				for (let i = 0; i < this.els.length; i++) {
					out.push(html(this.els[i]));
				}
				return out;
			}

			// SETTER: set all, return this
			for (let i = 0; i < this.els.length; i++) {
				html(this.els[i], v);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped on
		 * -sets an evet on an element
		 * @param {string} the name of the event
		 * @param {function} the handler
		 * @param {object} the options
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "on", function onWrapped(evt, handler, opts) {
			const e = String(evt || "").trim();
			if (!e || typeof handler !== "function") return this;

			for (let i = 0; i < this.els.length; i++) {
				this.els[i].addEventListener(e, handler, opts);
			}
			return this;
		});

		/******************************************************************
		 * dom _Wrapped off
		 * -removes an event from an element
		 * @param {string} the name of the event
		 * @param {function} the handler
		 * @param {object} the options
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "off", function offWrapped(evt, handler, opts) {
			const e = String(evt || "").trim();
			if (!e) return this;

			for (let i = 0; i < this.els.length; i++) {
				this.els[i].removeEventListener(e, handler, opts);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped hasClass
		 * -checks each element for the given class
		 * -getter returns boolean[] (one per element)
		 * @param {string} class name
		 * @returns {boolean[]}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "hasClass", function hasClassWrapped(cls) {
			const out = [];
			for (let i = 0; i < this.els.length; i++) {
				out.push(hasClass(this.els[i], cls));
			}
			return out;
		});
		
		/******************************************************************
		 * dom _Wrapped toggleClass
		 * -toggles a class on each element
		 * @param {string} class name
		 * @param {boolean} optional force state
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "toggleClass", function toggleClassWrapped(cls, force) {
			if (!cls) return this;

			for (let i = 0; i < this.els.length; i++) toggleClass(this.els[i],cls,force);
				
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped val
		 * -gets or sets the value property
		 * -applies to inputs, selects, textareas
		 * @param {any} optional value to set
		 * @returns {any|_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "val", function valWrapped(v) {
			// GETTER: return array
			if (arguments.length === 0) {
				const out = [];
				for (let i = 0; i < this.els.length; i++) {
					out.push(val(this.els[i]));
				}
				return out;
			}

			// SETTER: set all, return this
			for (let i = 0; i < this.els.length; i++) {
				val(this.els[i], v);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped append
		 * -appends content to each element
		 * -accepts:
		 *     - string HTML
		 *     - HTMLElement
		 *     - _Wrapped
		 *     - spec object  {tag:"div", ...}
		 *     - QOL overload: ("div", { ... }) -> createString("div", spec)
		 * @param {any} content
		 * @param {object} (optional) spec
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "append", function appendWrapped(content, spec) {
			const cleanContent = _resolveContentArgs(content, spec);
			if (cleanContent == null) return this;

			const clean = _resolveNodes(cleanContent);
			if (!clean || clean.length <= 0) return this;

			const lastHostIdx = this.els.length - 1;

			for (let i = 0; i < this.els.length; i++) {
				const host = this.els[i];
				const useOriginalsHere = (i === lastHostIdx); // jQuery: original goes to LAST target

				for (let j = 0; j < clean.length; j++) {
					const node = useOriginalsHere ? clean[j] : clean[j].cloneNode(true);
					addChild(host, node); // append
				}
			}

			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped prepend
		 * -prepends content as the first child of each element
		 * -accepts string | HTMLElement | _Wrapped
		 * -if bind module is present (dom.fn.compile exists), compile new subtree
		 * @param {any} content to prepend
		 * @param {object} spec object
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "prepend", function prependWrapped(content, spec) {
			const cleanContent = _resolveContentArgs(content, spec);
			if (cleanContent == null) return this;

			const clean = _resolveNodes(cleanContent);
			if (!clean || clean.length <= 0) return this;

			const lastHostIdx = this.els.length - 1;

			for (let i = 0; i < this.els.length; i++) {
				const host = this.els[i];
				const useOriginalsHere = (i === lastHostIdx);

				// insert in order at the front
				for (let j = 0; j < clean.length; j++) {
					const node = useOriginalsHere ? clean[j] : clean[j].cloneNode(true);
					addChild(host, node, j);
				}
			}

			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped before
		 * -inserts content before each element in the wrapped set
		 * -accepts string | HTMLElement | _Wrapped
		 * -if bind module is present (dom.fn.compile exists), compile parent subtree
		 * @param {any} content to insert
		 * @param {object} spec object
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "before", function beforeWrapped(content, spec) {
			const cleanContent = _resolveContentArgs(content, spec);
			if (cleanContent == null) return this;

			const clean = _resolveNodes(cleanContent);
			if (!clean || clean.length <= 0) return this;

			const lastTargetIdx = this.els.length - 1;

			for (let i = 0; i < this.els.length; i++) {
				const target = this.els[i];
				const useOriginalsHere = (i === lastTargetIdx);

				// preserve order: insert nodes from left->right before the target
				// easiest: keep a moving "cursor" (the target stays the same)
				for (let j = 0; j < clean.length; j++) {
					const node = useOriginalsHere ? clean[j] : clean[j].cloneNode(true);
					insertBefore(target, node);
				}
			}

			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped after
		 * -inserts content after each element in the wrapped set
		 * -accepts string | HTMLElement | _Wrapped
		 * -if bind module is present (dom.fn.compile exists), compile parent subtree
		 * @param {any} content to insert
		 * @param {object} spec object
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "after", function afterWrapped(content, spec) {
			const cleanContent = _resolveContentArgs(content, spec);
			if (cleanContent == null) return this;

			const clean = _resolveNodes(cleanContent);
			if (!clean || clean.length <= 0) return this;

			const lastTargetIdx = this.els.length - 1;

			for (let i = 0; i < this.els.length; i++) {
				let cursor = this.els[i]; // advances as we insert
				const useOriginalsHere = (i === lastTargetIdx);

				for (let j = 0; j < clean.length; j++) {
					const node = useOriginalsHere ? clean[j] : clean[j].cloneNode(true);
					const inserted = insertAfter(cursor, node);
					if (inserted) cursor = inserted;
				}
			}

			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped remove
		 * -removes each element from the DOM
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "remove", function removeWrapped() {
			for (let i = 0; i < this.els.length; i++) {
				const el = this.els[i];
				if (el.parentNode) el.parentNode.removeChild(el);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped empty
		 * -removes all child nodes from each element
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "empty", function emptyWrapped() {
			for (let i = 0; i < this.els.length; i++) {
				this.els[i].innerHTML = "";
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped get
		 * -returns the raw DOM element at index
		 * -negative indexes allowed
		 * @param {number} index
		 * @returns {HTMLElement|null}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "get", function getWrapped(i) {
			let idx = (typeof i === "number") ? i : 0;
			if (idx < 0) idx = this.els.length + idx;
			return (idx >= 0 && idx < this.els.length) ? this.els[idx] : null;
		});
		
		/******************************************************************
		 * dom _Wrapped toArray
		 * -returns a shallow copy of the internal element array
		 * @returns {array}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "toArray", function toArrayWrapped() {
			return this.els.slice();
		});
		
		/******************************************************************
		 * dom _Wrapped parent
		 * -gets unique parent elements
		 * -always returns a NEW _Wrapped instance
		 * @returns {_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "parent", function parentWrapped() {
			const out = [];

			for (let i = 0; i < this.els.length; i++) {
				const p = this.els[i].parentElement;
				if (p && out.indexOf(p) === -1) out.push(p);
			}
			return _wrapMany(out);
		});
		
		/******************************************************************
		 * dom _Wrapped children
		 * -gets direct children of each element
		 * -always returns a NEW _Wrapped instance
		 * @param {string} optional selector
		 * @returns {_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "children", function childrenWrapped(sel) {
			const out = [];
			const s = typeof sel === "string" ? sel.trim() : null;

			for (let i = 0; i < this.els.length; i++) {
				const kids = this.els[i].children;
				for (let j = 0; j < kids.length; j++) {
					if (!s || kids[j].matches(s)) out.push(kids[j]);
				}
			}
			return _wrapMany(out);
		});
		
		/******************************************************************
		 * dom _Wrapped closest
		 * -gets the closest ancestor matching selector
		 * -one per element, unique
		 * -always returns a NEW _Wrapped instance
		 * @param {string} selector
		 * @returns {_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "closest", function closestWrapped(sel) {
			const s = String(sel || "").trim();
			if (!s) return _wrapMany([]);

			const out = [];

			for (let i = 0; i < this.els.length; i++) {
				const found = this.els[i].closest(s);
				if (found && out.indexOf(found) === -1) out.push(found);
			}
			return _wrapMany(out);
		});
		
		/******************************************************************
		 * dom _Wrapped css
		 * -gets computed style (getter) or sets inline style (setter)
		 * -numeric values auto-append "px" where appropriate
		 * @param {string|object} name style name OR map of styles
		 * @param {string[]|number} (optional) value to set
		 * @returns {string|_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "css", function cssWrapped(name, value) {

			// GETTER: css("width") => string[]
			if (arguments.length === 1 && typeof name === "string") {
				const out = [];
				for (let i = 0; i < this.els.length; i++) {
					out.push(css(this.els[i], name));
				}
				return out;
			}

			// SETTER: css({a:1}) OR css("width", 120) => this
			for (let i = 0; i < this.els.length; i++) {
				css(this.els[i], name, value);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped width
		 * -gets or sets width in pixels
		 * -getter returns a number (px)
		 * -setter accepts number (auto px) or string ("50%")
		 * @param {any} optional width value
		 * @returns {number|_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "width", function widthWrapped(v) {
			// getter
			if (arguments.length === 0) {
				if (!this.el) return 0;
				// computed style width is usually px; parseFloat is safe
				return base.toNumber(css(this.el, "width"));
			}

			// setter
			return this.css("width", v);
		});

		/******************************************************************
		 * dom _Wrapped height
		 * -gets or sets height in pixels
		 * -getter returns a number (px)
		 * -setter accepts number (auto px) or string ("50%")
		 * @param {any} optional height value
		 * @returns {number|_Wrapped}
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "height", function heightWrapped(v) {
			// getter
			if (arguments.length === 0) {
				if (!this.el) return 0;
				return base.toNumber(css(this.el, "height"));
			}

			// setter
			return this.css("height", v);
		});
		
		/******************************************************************
		 * dom _Wrapped offset
		 * -gets document-relative offset of the FIRST element
		 * @returns {object} { top:number, left:number }
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "offset", function offsetWrapped() {
			if (!this.el) return { top: 0, left: 0 };

			const r = this.el.getBoundingClientRect();

			// document scroll offsets
			const doc = document.documentElement;
			const sx = window.pageXOffset || doc.scrollLeft || 0;
			const sy = window.pageYOffset || doc.scrollTop || 0;

			return {
				top: r.top + sy,
				left: r.left + sx
			};
		});
		
		/******************************************************************
		 * dom _Wrapped position
		 * -gets position of FIRST element relative to its offsetParent
		 * @returns {object} { top:number, left:number }
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "position", function positionWrapped() {
			if (!this.el) return { top: 0, left: 0 };

			const el = this.el;
			const parent = el.offsetParent || document.documentElement;

			const er = el.getBoundingClientRect();
			const pr = parent.getBoundingClientRect();

			// scroll offsets of offsetParent matter
			const sx = parent.scrollLeft || 0;
			const sy = parent.scrollTop || 0;

			return {
				top: (er.top - pr.top) + sy,
				left: (er.left - pr.left) + sx
			};
		});
		
		/******************************************************************
		 * dom _Wrapped hide
		 * -hides each element (display:none) and remembers previous inline display
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "hide", function hideWrapped() {
			for (let i = 0; i < this.els.length; i++) {
				hide(this.els[i]);
			}
			return this;
		});

		/******************************************************************
		 * dom _Wrapped show
		 * -shows each element and restores previous inline display if known
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "show", function showWrapped() {
			for (let i = 0; i < this.els.length; i++) {
				show(this.els[i]);
			}
			return this;
		});

		/******************************************************************
		 * dom _Wrapped toggle
		 * -toggles visibility via display none
		 * -toggle(true) forces show
		 * -toggle(false) forces hide
		 * @param {boolean} optional force state
		 * @returns {_Wrapped} this wrapped set for chaining
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "toggle", function toggleWrapped(force) {
			for (let i = 0; i < this.els.length; i++) {
				toggle(this.els[i],force);
			}
			return this;
		});
		
		/******************************************************************
		 * dom _Wrapped outerWidth
		 * -gets the outer width of the FIRST element (border-box)
		 * -includeMargin=true adds left+right margins
		 * @param {boolean} optional includeMargin
		 * @returns {number} width in px
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "outerWidth", function outerWidthWrapped(includeMargin) {
			if (!this.el) return 0;

			const r = this.el.getBoundingClientRect();
			let w = r.width;

			if (includeMargin === true) {
				const cs = window.getComputedStyle(this.el);
				w += base.toNumber(cs.marginLeft) + base.toNumber(cs.marginRight);
			}

			return w;
		});
		
		/******************************************************************
		 * dom _Wrapped innerWidth
		 * -gets the inner width of the FIRST element
		 * -content + padding (no border, no margin)
		 * @returns {number} width in px
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "innerWidth", function innerWidthWrapped() {
			if (!this.el) return 0;

			const cs = window.getComputedStyle(this.el);
			const box = cs.boxSizing;

			// If border-box, subtract borders
			let w = this.el.getBoundingClientRect().width;

			if (box === "border-box") {
				w -= base.toNumber(cs.borderLeftWidth);
				w -= base.toNumber(cs.borderRightWidth);
			}

			// padding is included in both box models here
			return w;
		});

		/******************************************************************
		 * dom _Wrapped outerHeight
		 * -gets the outer height of the FIRST element (border-box)
		 * -includeMargin=true adds top+bottom margins
		 * @param {boolean} optional includeMargin
		 * @returns {number} height in px
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "outerHeight", function outerHeightWrapped(includeMargin) {
			if (!this.el) return 0;

			const r = this.el.getBoundingClientRect();
			let h = r.height;

			if (includeMargin === true) {
				const cs = window.getComputedStyle(this.el);
				h += base.toNumber(cs.marginTop) + base.toNumber(cs.marginBottom);
			}

			return h;
		});
		
		/******************************************************************
		 * dom _Wrapped innerHeight
		 * -gets the inner height of the FIRST element
		 * -content + padding (no border, no margin)
		 * @returns {number} height in px
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "innerHeight", function innerHeightWrapped() {
			if (!this.el) return 0;

			const cs = window.getComputedStyle(this.el);
			const box = cs.boxSizing;

			let h = this.el.getBoundingClientRect().height;

			if (box === "border-box") {
				h -= base.toNumber(cs.borderTopWidth);
				h -= base.toNumber(cs.borderBottomWidth);
			}

			return h;
		});
		
		/******************************************************************
		 * dom _Wrapped extract
		 * -converts the elements in a wrapped set into HTML string (or array)
		 * -default: returns outerHTML of first element		 
		 * -options.inner=true returns innerHTML
		 * -options.all=true all elements
		 * @param {object} opts { inner?: boolean, all?: boolean }
		 * @returns {string|string[]} html string (or array if all=true)
		 ******************************************************************/
		defineLocked(_Wrapped.prototype, "extract", function extractWrapped(opts) {
			return extract(this.els, opts);
		});
				
		/**
		 * dom _Wrapped field(containerEl, name)
		 *
		 * Locate form field(s) by name within a container element.
		 *
		 * @param {string} name
		 * @returns {_Wrapped} a NEW wrapped set for chaining
		 */
		defineLocked(_Wrapped.prototype, "field", function fieldWrapped(name) {
			const out = field(this.el,name);
			if (Array.isArray(out)) return _wrapMany(out);
			return _wrapOne(out);
		});
		
		/**
		 * form(containerEl, opts)
		 *
		 * Create a lightweight, programmatic "form controller" bound to a container
		 * element. No <form> tag is required. Native submit behavior is ALWAYS
		 * suppressed.
		 *		
		 * @param {object} (optional) opts
		 * @returns {object|null} form controller API
		 */
		defineLocked(_Wrapped.prototype, "form", function formWrapped(opts) {
			return form(this.el,opts);
		});
		
		/**
		 * dom _Wrapped serializeArray(containerEl, opts)
		 *
		 * Convert fields within a container element into a jQuery-style array:
		 *   [{ name: string, value: string }, ...]
		 *
		 * @param {object} (optional) opts
		 * @param {boolean} (optional) opts.includeEmpty
		 * @returns {Array<{name:string,value:string}>}
		 */
		defineLocked(_Wrapped.prototype, "serializeArray", function serializeArrayWrapped(opts) {
			return serializeArray(this.el,opts);
		});
		
		/**
		 * dom _Wrapped serialize(containerEl, opts)
		 *
		 * Convert fields within a container element into a name → value object.
		 *
		 * @param {object} (optional) opts
		 * @returns {object} name/value map
		 */
		defineLocked(_Wrapped.prototype, "serialize", function serializeWrapped(opts) {
			return serialize(this.el,opts);
		});
		
		/******************************************************************
		 * Internal helpers (private)
		 ******************************************************************/
		 
		/******************************************************************
		 * dom @private _isHtmlElement
		 * @param {any} object to test
		 * @returns {boolean} true or false
		 ******************************************************************/
		function _isHtmlElement(v) {
			return !!v && v.nodeType === 1;
		}
		
		/******************************************************************
		 * dom @private _isNodeListLike
		 * @param {any} object to test
		 * @returns {boolean} true or false
		 ******************************************************************/
		function _isNodeListLike(v) {
			if (!v || typeof v !== "object") return false;
			if (typeof v.length !== "number") return false;
			if (typeof v.item === "function") return true;
			return (typeof v[Symbol.iterator] === "function");
		}
		
		/******************************************************************
		 * dom @private _toArray
		 * -converts a node list to an array
		 * @param {nodeList} nodeList to convert 
		 * @returns {array} nodeList as an array
		 ******************************************************************/
		function _toArray(nodeListLike) {
			const out = [];
			for (let i = 0; i < nodeListLike.length; i++) out.push(nodeListLike[i]);
			return out;
		}

		/******************************************************************
		 * dom @private _looksLikeHtml
		 * -we just see if the string starts with '<'
		 * @param {string} string to test
		 * @returns {boolean} true or false
		 ******************************************************************/
		function _looksLikeHtml(s) {
			return s.length > 0 && s.trim().startsWith("<");
		}

		/******************************************************************
		 * dom @private _getQueryRoot
		 * @returns {element} element or document
		 ******************************************************************/
		function _getQueryRoot() {
			return (options.scopeToMount === false) ? document : system.appEl || document;
		}

		/******************************************************************
		 * dom @private _wrapOne
		 * @param {element} the element to wrap
		 * @returns {object} our wrapped object
		 ******************************************************************/
		function _wrapOne(el) {
			return new _Wrapped(el ? [el] : [], system, log, options);
		}

		/******************************************************************
		 * dom @private _wrapMany
		 * @param {array} the array of elements to wrap
		 * @returns {object} our wrapped object
		 ******************************************************************/
		function _wrapMany(els) {
			const out = [];
			for (let i = 0; i < els.length; i++) {
				if (_isHtmlElement(els[i])) out.push(els[i]);
			}
			return new _Wrapped(out, system, log, options);
		}

		/******************************************************************
		 * dom @private _isPlainObject
		 * -check if the object is our wrapper object or a native dom element or an array
		 * -everything else is a plain object.
		 * @param {string} string to test
		 * @returns {boolean} true or false
		 ******************************************************************/
		function _isPlainObject(v) {
			if (!v || typeof v !== "object") return false;
			if (Array.isArray(v)) return false;

			// wrappers
			if (v instanceof _Wrapped) return false;

			// DOM-ish
			if (_isHtmlElement(v)) return false;
			if (_isNodeListLike(v)) return false;

			return true;
		}
		
		/******************************************************************
		 * dom @private _resolveNodes
		 * -check if the object is our wrapper object or a native dom element or an array
		 * @param {_Wrapped|Element|Element[]|String} object with nodes to clean
		 * @returns {array} array of cleaned nodes
		 ******************************************************************/
		function _resolveNodes(content) {
			let nodes = [];

			if (content instanceof _Wrapped) nodes = content.els;
			else if (_isHtmlElement(content)) nodes = [content];
			else if (Array.isArray(content)) nodes = content;
			else if (_isNodeListLike(content)) nodes = _toArray(content);
			else if (typeof content === "string") {
				const made = create(content);
				if (Array.isArray(made)) nodes = made;
				else if (_isHtmlElement(made)) nodes = [made];
			}

			const clean = [];
			for (let i = 0; i < nodes.length; i++) if (_isHtmlElement(nodes[i])) clean.push(nodes[i]);
			return clean;
		}
		
		/******************************************************************
		 * dom @private _resolveContentArgs
		 * -resolves content args for append/prepend/before/after
		 * -if element or element array, return it
		 * -if html string, return it
		 * -try making a string, return it
		 * -anything else, return null
		 * @param {any} content
		 * @param {object} (optional) spec
		 * @returns {element|string|_Wrapped|array|null}
		 ******************************************************************/
		function _resolveContentArgs(content, spec) {
			const rcaLog = log.scope("resolveContentArgs");

			if (content == null) {
				if (options.debug) rcaLog.debug("resolveContentArgs(): content was null/undefined");
				return null;
			}

			// QOL overload: ("div", { ... }) => HTML string
			if (typeof content === "string" && spec && base.isObj(spec)) {
				content = createString(content, spec);
			}
			// QOL overload: ({ tag:"div", ... }) => HTML string
			else if (_isPlainObject(content) && spec == null) {
				content = createString(content);
			}

			// Validate supported types
			const isHtmlString = (typeof content === "string") ? _looksLikeHtml(content.trim()) : false;
			const isElement = _isHtmlElement(content);
			const isWrapped = (content instanceof _Wrapped);
			const isArray = Array.isArray(content);
			const isNodeList = _isNodeListLike(content);

			if (!isHtmlString && !isElement && !isWrapped && !isArray && !isNodeList) {
				if (options.debug) rcaLog.debug("resolveContentArgs(): unsupported content type", content);
				return null;
			}

			return content;
		}
		
		/******************************************************************
		 * dom @private _resolveSelectorRoot
		 * @param {string} the selector to look for
		 * @returns {element} the element found or null
		 ******************************************************************/
		function _resolveSelectorRoot(sel) {
			const root = _getQueryRoot();
			const found = root.querySelector(sel);
			return found || null;
		}

		/******************************************************************
		 * dom @private _resolveContextRoot
		 * @param {string} the selector to look for
		 * @returns {element} the root element found or null
		 ******************************************************************/
		function _resolveContextRoot(ctx) {

			// null/undefined => default root
			if (ctx == null) return _getQueryRoot();

			if (ctx instanceof _Wrapped) {
				return (ctx.els && ctx.els.length > 0) ? ctx.els[0] : _getQueryRoot();
			}

			// raw element
			if (_isHtmlElement(ctx)) {
				return ctx;
			}

			// array / NodeList-like => first element
			if (Array.isArray(ctx)) {
				for (let i = 0; i < ctx.length; i++) {
					if (_isHtmlElement(ctx[i])) return ctx[i];
				}
				return _getQueryRoot();
			}

			if (_isNodeListLike(ctx)) {
				for (let i = 0; i < ctx.length; i++) {
					if (_isHtmlElement(ctx[i])) return ctx[i];
				}
				return _getQueryRoot();
			}

			// selector string context
			if (typeof ctx === "string") {
				const s = ctx.trim();
				if (!s) return _getQueryRoot();

				// if they pass "<div>...</div>" as context, create it and use first root
				if (_looksLikeHtml(s)) {
					const made = create(s);
					if (made == null) return _getQueryRoot();

					if (Array.isArray(made)) {
						for (let i = 0; i < made.length; i++) {
							if (_isHtmlElement(made[i])) return made[i];
						}
						return _getQueryRoot();
					}

					return _isHtmlElement(made) ? made : _getQueryRoot();
				}

				const el = _resolveSelectorRoot(s);
				return el || _getQueryRoot();
			}

			// unknown context type => default root
			return _getQueryRoot();
		}
		
		/******************************************************************
		 * dom @private _hiddenKey
		 * -private property name for storing previous inline display
		 ******************************************************************/
		const _hiddenKey = "__ezPrevDisplay";
		
		/******************************************************************
		 * dom @private _maybeCompile
		 * -If bind module extended dom.fn.compile, call it.
		 * -No dependency on system.bind (no forward call up the pole).
		 * @param {any} root element | _Wrapped | array | NodeList-like
		 ******************************************************************/
		function _maybeCompile(root) {
			if (!dom || !dom.fn || typeof dom.fn.__ezCompile !== "function") return undefined;
			const wrapped = dom(root); //ensure wrapped
			if (wrapped && typeof wrapped.__ezCompile === "function" && _shouldCompileNode(root)) wrapped.__ezCompile(root);
		}
		
		/******************************************************************
		 * dom @private _shouldCompileNode
		 * -counld we compile this node?
		 * @param {HTMLElement} root node
		 * @ return {boolean} if we should compile the node
		 ******************************************************************/
		function _shouldCompileNode(node) {
			if (!node || node.nodeType !== 1) return false;

			// skip non-visual nodes entirely
			const tag = node.tagName ? node.tagName.toLowerCase() : "";
			if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return false;

			return true;
		}
		
		/**
		 * dom _validate(containerEl, rules, opts)
		 *
		 * Create a validator controller for a container (custom form).
		 * No <form> tag required.
		 *
		 * @param {HTMLElement} containerEl
		 * @param {object} rules  map: fieldName -> ruleSpec
		 * @param {object} (optional) opts
		 * @returns {object|null} validator API
		 */
		function _validate(containerEl, rules, opts) {
			const vLog = log.scope("validate");
			if (!containerEl || containerEl.nodeType !== 1) return null;

			// auditable defaults
			const defaultOpts = {
				live: true,                 // blur/input/change hooks
				includeEmpty: false,        // passed to serialize/serializeArray
				errorClass: "ez-error",
				errorTag: "div",
				errorAttr: "data-ez-error", // marker for cleanup
				errorPlacement: "after",    // "after" | "before" | "container"
				errorContainer: null,       // HTMLElement or selector string (optional)
				firstErrorFocus: true       // focus first invalid field on validate()
			};

			const newOpts = base.mergeDeep(defaultOpts, (opts && typeof opts === "object") ? opts : {});
			const ruleMap = (rules && typeof rules === "object") ? rules : Object.create(null);

			// internal state
			let lastErrors = Object.create(null);

			// resolve error container if configured
			function resolveErrorContainer() {
				if (!newOpts.errorContainer) return null;

				if (newOpts.errorContainer && newOpts.errorContainer.nodeType === 1) return newOpts.errorContainer;

				if (typeof newOpts.errorContainer === "string") {
					try {
						const s = newOpts.errorContainer.trim();
						if (!s) return null;
						return containerEl.querySelector(s) || document.querySelector(s) || null;
					} catch (e) { return null; }
				}
				return null;
			}

			function toStr(v) {
				if (v == null) return "";
				return String(v);
			}

			function isEmptyValue(v) {
				// jQuery-style: empty string, null, undefined, empty array => empty
				if (v == null) return true;
				if (Array.isArray(v)) return v.length === 0;
				return toStr(v).trim() === "";
			}

			// --- built-in rule implementations ---
			function rule_required(val) {
				return !isEmptyValue(val);
			}

			function rule_minlength(val, n) {
				if (Array.isArray(val)) return val.length >= n;
				return toStr(val).length >= n;
			}

			function rule_maxlength(val, n) {
				if (Array.isArray(val)) return val.length <= n;
				return toStr(val).length <= n;
			}

			function rule_min(val, n) {
				const x = base.toNumber(val);
				if (!isFinite(x)) return false;
				return x >= n;
			}

			function rule_max(val, n) {
				const x = base.toNumber(val);
				if (!isFinite(x)) return false;
				return x <= n;
			}

			function rule_email(val) {
				// pragmatic email check (not RFC cosplay)
				const s = toStr(val).trim();
				if (!s) return true;
				return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
			}

			function rule_pattern(val, pat) {
				const s = toStr(val);
				if (pat instanceof RegExp) return pat.test(s);
				if (typeof pat === "string" && pat) return new RegExp(pat).test(s);
				return true; // no pattern => pass
			}

			function rule_equalTo(val, otherName, values) {
				return toStr(val) === toStr(values[otherName]);
			}

			function rule_in(val, list) {
				if (!Array.isArray(list)) return true;
				
				if (Array.isArray(val)) {
					for (let i = 0; i < val.length; i++) {
						if (list.indexOf(val[i]) === -1) return false;
					}
					return true;
				}
				return list.indexOf(val) !== -1;
			}

			/**
			 * Check one field by name against its ruleSpec.
			 * @returns {string|null} error message or null if ok
			 */
			function checkField(name, values) {
				const spec = ruleMap[name];
				if (!spec || typeof spec !== "object") return null;

				const val = values[name];

				// required gate: if not required and empty => ok (skip other rules)
				const required = spec.required === true;
				if (!required && isEmptyValue(val)) return null;

				// message table
				const messages = (spec.messages && typeof spec.messages === "object") ? spec.messages : Object.create(null);

				function msg(ruleKey, fallback) {
					return toStr(messages[ruleKey] || fallback || (name + " is invalid"));
				}

				// required
				if (required && !rule_required(val)) return msg("required", name + " is required");

				// length
				if (typeof spec.minlength === "number" && !rule_minlength(val, spec.minlength)) {
					return msg("minlength", name + " must be at least " + spec.minlength);
				}
				if (typeof spec.maxlength === "number" && !rule_maxlength(val, spec.maxlength)) {
					return msg("maxlength", name + " must be at most " + spec.maxlength);
				}

				// numeric range
				if (typeof spec.min === "number" && !rule_min(val, spec.min)) {
					return msg("min", name + " must be >= " + spec.min);
				}
				if (typeof spec.max === "number" && !rule_max(val, spec.max)) {
					return msg("max", name + " must be <= " + spec.max);
				}

				// email
				if (spec.email === true && !rule_email(val)) {
					return msg("email", name + " must be a valid email");
				}

				// pattern
				if (spec.pattern != null && !rule_pattern(val, spec.pattern)) {
					return msg("pattern", name + " format is invalid");
				}

				// equalTo
				if (spec.equalTo && !rule_equalTo(val, spec.equalTo, values)) {
					return msg("equalTo", name + " must match " + spec.equalTo);
				}

				// in-list
				if (spec.in && !rule_in(val, spec.in)) {
					return msg("in", name + " is not allowed");
				}

				// custom
				if (typeof spec.custom === "function") {
					const res = spec.custom(val, field(containerEl, name), values, api);
					if (res === true || res == null) {
						// ok
					} else if (typeof res === "string") {
						return res;
					} else {
						return msg("custom", name + " is invalid");
					}
				}

				return null;
			}

			// --- error rendering ---
			function isFieldEl(el) {
				return !!(el && el.nodeType === 1 && el.getAttribute && el.getAttribute("name"));
			}

			function getFieldNameFromEl(el) {
				if (!isFieldEl(el)) return "";
				const n = el.getAttribute("name");
				return n ? String(n) : "";
			}

			function clearFieldErrors(name) {
				if (!name) return;

				const n = String(name);

				const esc = (window.CSS && typeof window.CSS.escape === "function")	? window.CSS.escape(n) : n.replace(/["\\]/g, "\\$&");

				// remove injected error nodes inside the main container
				const nodes = containerEl.querySelectorAll(
					"[" + newOpts.errorAttr + '][data-ez-error-for="' + esc + '"]'
				);
				for (let i = 0; i < nodes.length; i++) {
					const el = nodes[i];
					if (el && el.parentNode) el.parentNode.removeChild(el);
				}

				// remove injected error nodes inside a shared error container (if used)
				const ec = resolveErrorContainer();
				if (ec) {
					const cn = ec.querySelectorAll(
						"[" + newOpts.errorAttr + '][data-ez-error-for="' + esc + '"]'
					);
					for (let j = 0; j < cn.length; j++) {
						const el2 = cn[j];
						if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
					}
				}

				delete lastErrors[n];
			}

			function clearErrors() {
				// remove any existing injected error nodes in container
				const nodes = containerEl.querySelectorAll("[" + newOpts.errorAttr + "]");
				for (let i = 0; i < nodes.length; i++) {
					const n = nodes[i];
					if (n && n.parentNode) n.parentNode.removeChild(n);
				}

				// optional: clear error container content
				const ec = resolveErrorContainer();
				if (ec) ec.innerHTML = "";

				lastErrors = Object.create(null);
			}

			function placeError(el, message, fieldName) {
				if (!el || el.nodeType !== 1) return;

				const tag = String(newOpts.errorTag || "div");
				const node = document.createElement(tag);

				node.setAttribute(newOpts.errorAttr, "1");
				node.setAttribute("data-ez-error-for", String(fieldName || ""));
				node.className = String(newOpts.errorClass || "ez-error");
				node.textContent = String(message);

				// container placement
				const ec = resolveErrorContainer();
				if (newOpts.errorPlacement === "container" && ec) {
					ec.appendChild(node);
					return;
				}

				// default: before/after the element
				const parent = el.parentNode;
				if (!parent) return;

				if (newOpts.errorPlacement === "before") parent.insertBefore(node, el);
				else parent.insertBefore(node, el.nextSibling);
			}
			
			/**
			 * Validate a field
			 * @param {string} name
			 * @returns {object} { ok:boolean, errors:object, values:object }
			 */
			function validateField(name) {
				if (!name || !ruleMap[name]) return { ok: true, errors: api.errors(), values: serialize(containerEl, { includeEmpty: newOpts.includeEmpty }) };

				// recompute values once (keeps equalTo/custom consistent)
				const values = serialize(containerEl, { includeEmpty: newOpts.includeEmpty });

				// clear only this field’s errors
				clearFieldErrors(name);

				const err = checkField(name, values);
				if (err) {
					lastErrors[name] = err;

					const el = field(containerEl, name);
					const one = Array.isArray(el) ? (el[0] || null) : el;
					if (one) placeError(one, err, name);
				} else {
					delete lastErrors[name];
				}

				const ok = (Object.keys(lastErrors).length === 0);

				return {
					ok: ok,
					errors: api.errors(),
					values: values
				};
			}

			/**
			 * Validate all configured rules.
			 * @returns {object} { ok:boolean, errors:object, values:object }
			 */
			function runValidate() {
				clearErrors();

				// capture current values via serialize()
				const values = serialize(containerEl, { includeEmpty: newOpts.includeEmpty });

				const errors = Object.create(null);
				let firstBadEl = null;

				for (const name in ruleMap) {
					if (!Object.prototype.hasOwnProperty.call(ruleMap, name)) continue;

					const err = checkField(name, values);
					if (err) {
						errors[name] = err;

						const el = field(containerEl, name);
						// field() can be element or array; normalize to first for focus/placement
						const one = Array.isArray(el) ? (el[0] || null) : el;

						if (!firstBadEl && one) firstBadEl = one;
						if (one) placeError(one, err, name);
					}
				}

				lastErrors = errors;

				const ok = (Object.keys(errors).length === 0);

				if (!ok && newOpts.firstErrorFocus === true && firstBadEl && typeof firstBadEl.focus === "function") {
					try { firstBadEl.focus(); } catch (e) {}
				}

				return {
					ok: ok,
					errors: base.cloneDeep ? base.cloneDeep(errors) : errors, // if you have cloneDeep later
					values: values
				};
			}

			// --- live hooks ---
			function onLiveEvent(e) {
				if (!newOpts.live) return;

				const t = e && e.target;
				if (!t || t.nodeType !== 1) return;

				// only revalidate if target has a name and we have rules for it
				const n = getFieldNameFromEl(t);
				if (!n) return;
				if (!ruleMap[n]) return;

				// cheap: validate all for now (keeps it simple + consistent)
				// later optimization: per-field validate + preserve other errors
				runValidate();
			}

			containerEl.addEventListener("blur", onLiveEvent, true);
			containerEl.addEventListener("input", onLiveEvent, true);
			containerEl.addEventListener("change", onLiveEvent, true);

			// --- public API (locked) ---
			const api = Object.create(null);

			defineLocked(api, "el", containerEl);

			defineLocked(api, "validate", function validateAll() {
				return runValidate();
			});

			defineLocked(api, "valid", function valid() {
				return runValidate().ok === true;
			});

			defineLocked(api, "errors", function errors() {
				// return a copy-ish view
				const out = Object.create(null);
				for (const k in lastErrors) {
					if (Object.prototype.hasOwnProperty.call(lastErrors, k)) out[k] = lastErrors[k];
				}
				return out;
			});

			defineLocked(api, "reset", function reset() {
				clearErrors();
				return api;
			});

			defineLocked(api, "destroy", function destroy() {
				containerEl.removeEventListener("blur", onLiveEvent, true);
				containerEl.removeEventListener("input", onLiveEvent, true);
				containerEl.removeEventListener("change", onLiveEvent, true);
				clearErrors();
			});

			return api;
		}
		
		/**
		 * dom _createDOMFromNode(_node)
		 *
		 * Create a real usable dom fome a node and it's kids
		 *
		 * @param {_node} containerEl Template
		 * @returns {HTMLElement} a real live element
		 */
		function _createDOMFromNode(_node) {
			// preserve text nodes as children (important for <button>text</button>)
			if (_node.nodeType === Node.TEXT_NODE) {
				return document.createTextNode(_node.textContent);
			}

			if (_node.nodeType !== Node.ELEMENT_NODE) return null;

			const tag = _node.tagName.toLowerCase();
			const el = document.createElement(tag);

			// copy attributes
			for (let i = 0; i < _node.attributes.length; i++) {
				const attr = _node.attributes[i];
				el.setAttribute(attr.nodeName, attr.nodeValue);
			}

			// recurse children (includes text nodes)
			for (let i = 0; i < _node.childNodes.length; i++) {
				const child = _createDOMFromNode(_node.childNodes[i]);
				if (child) el.appendChild(child);
			}

			return el;
		}
		
		/******************************************************************
		 * Public functions
		 ******************************************************************/

		/******************************************************************
		 * dom createString 
		 * -This function creates an html string from an array of nodes names and values
		 * -There is no sanity here.
		 * @param {string}, {object} tag and elementData an array of options for the element
		 * @param overload {object} elementData an array of options for the element including the tag
		 * 
		 * @returns {string} the HTML in a string
		 ******************************************************************/
		function createString(a1, a2) {
			// - createString("div", { id:"x", text:"hi" })
			// - createString({ tag:"div", id:"x", text:"hi" })

			//the logger for this function:
			const createStringLog = log.scope("createString");

			var tag;
			var elementData;

			//argument overloading
			if (typeof a1 === "string") {
				tag = a1;
				elementData = (a2 && typeof a2 === "object") ? a2 : {};
			} else if (a1 && typeof a1 === "object") {
				elementData = a1;
				tag = elementData.tag;
			}

			// the only sanity
			if (tag === undefined || tag === "") {
				createStringLog.warn("No tag defined, returning ''.");
				return "";
			}

			//start the opening tag
			var htmlString = "<" + tag;

			//add attributes (skip reserved keys)
			for (var key in elementData) {
				if (Object.prototype.hasOwnProperty.call(elementData, key) &&
					key !== "tag" &&
					key !== "text" &&
					key !== "innerHTML" &&
					key !== "children") {

					htmlString += ' ' + key + '="' + elementData[key] + '"';
				}
			}

			// Close the opening tag
			htmlString += ">";

			// Content precedence: text > innerHTML > children
			if (elementData.text != null) {
				htmlString += String(elementData.text);
			}
			else if (elementData.innerHTML != null) {
				htmlString += String(elementData.innerHTML);
			}
			else if (elementData.children != null) {

				// single child spec object
				if (base.isObj(elementData.children)) {
					htmlString += createString(elementData.children);
				}
				// array of child specs or strings
				else if (Array.isArray(elementData.children)) {
					for (var i = 0; i < elementData.children.length; i++) {
						var spec = elementData.children[i];

						if (spec == null) {
							// skip null/undefined
						}
						else if (typeof spec === "string") {
							htmlString += spec;
						}
						else if (typeof spec === "number" || typeof spec === "boolean") {
							htmlString += String(spec);
						}
						else {
							htmlString += createString(spec);
						}
					}
				}
				else {
					createStringLog.warn("children must be a, string, object or array", elementData.children);
				}
			}

			// Close the element
			htmlString += "</" + tag + ">";

			if (options.debug) createStringLog.debug("Returning: ", htmlString);

			return htmlString;
		}

		/******************************************************************
		 * dom create
		 * -This function creates HTML element(s) from an HTML string or spec object.
		 * -Overloads:
		 *    - create("<div>..</div>")
		 *    - create({ tag:"div", ... })
		 *    - create("div", { id:"x", text:"hi" })
		 * @param {any} a1 string|object
		 * @param {object} (optional) a2 elementData if a1 is tag string
		 * @returns {element|array|null} single root element or array of nodes
		 ******************************************************************/
		function create(a1, a2) {
			// the logger for this function:
			const createLog = log.scope("create");

			let html = "";

			// overload: create("div", { ... }) => use createString
			if (typeof a1 === "string" && a2 && typeof a2 === "object" && !_looksLikeHtml(a1)) {
				html = createString(a1, a2);

				if (!html || !String(html).trim()) {
					createLog.error("create(): createString() returned empty HTML for tag+spec", { tag: a1, spec: a2 });
					return null;
				}
			}
			// string => parse directly (HTML or selector-ish string, but create() treats as HTML input)
			else if (typeof a1 === "string") {
				html = a1;
			}
			// object => generate html via createString
			else if (a1 && typeof a1 === "object") {
				html = createString(a1);

				// if createString returns empty, treat as invalid spec (and bail)
				if (!html || !String(html).trim()) {
					createLog.error("create(): createString() returned empty HTML for spec", a1);
					return null;
				}
			}
			// invalid => fatal
			else {
				const err = new Error("create(): unsupported input type");
				createLog.fatal("create(): unsupported input type", err);
			}

			const trimmed = String(html || "").trim();
			if (!trimmed) return null;

			// parse with a temp div (old-library behavior)
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = trimmed;

			// Convert childNodes -> “real” DOM nodes
			const made = [];
			for (let i = 0; i < tempDiv.childNodes.length; i++) {
				const n = tempDiv.childNodes[i];
				const domNode = _createDOMFromNode(n);
				if (domNode && domNode.nodeType === 1) {
					made.push(domNode);
				}
			}

			// No element roots
			if (made.length <= 0) return null;

			// Single root element => return the element
			if (made.length === 1) return made[0];

			// Multi-root => return array of elements
			return made;
		}
		
		/******************************************************************
		 * dom hide
		 * -hide an element and remember previous inline display
		 * @param {element} el
		 ******************************************************************/
		function hide(el) {
			if (!el || el.nodeType !== 1) return;

			// store previous inline display only once
			if (el[_hiddenKey] === undefined) {
				el[_hiddenKey] = el.style.display;
			}

			el.style.display = "none";
		}

		/******************************************************************
		 * dom show
		 * -show an element and restore previous inline display (if any)
		 * @param {element} el
		 ******************************************************************/
		function show(el) {
			if (!el || el.nodeType !== 1) return;

			if (el[_hiddenKey] !== undefined) {
				el.style.display = el[_hiddenKey] || "";
				delete el[_hiddenKey];
			} else {
				// if we never hid it, just clear inline "none" if present
				if (el.style.display === "none") el.style.display = "";
			}
		}
		
		/******************************************************************
		 * dom toggle
		 * -toggles visibility via display none
		 * -toggle(true) forces show
		 * -toggle(false) forces hide
		 * @param {element} el
		 * @param {boolean} optional force state
		 ******************************************************************/
		function toggle(el,force) {
			// force mode
			if (typeof force === "boolean") {
				return force ? show(el) : hide(el);
			}

			// auto mode
			if (el && el.nodeType === 1) {
				const disp = window.getComputedStyle(el).display;
				if (disp === "none") show(el);
				else hide(el);
			}
		}
		
		/******************************************************************
		 * dom addClass
		 * -this adds a class to each element in the array  
		 * @param {element} el
		 * @param {string} the class name to add
		 ******************************************************************/
		function addClass(el, cls) {
			if (!el || el.nodeType !== 1 || !cls) return;
			el.classList.add(cls);
		}
		
		/******************************************************************
		 * dom removeClass
		 * -this adds a class to each element in the array
		 * @param {element} el
		 * @param {string} the class name to add
		 ******************************************************************/
		function removeClass(el, cls) {
			if (!el || el.nodeType !== 1 || !cls) return;
			el.classList.remove(cls);
		}
		
		/******************************************************************
		 * dom attr
		 * -gets or sets an attr
		 * @param {element} el
		 * @param {string|object} name attribute name OR map of attributes
		 * @param {any} (optional) value to set
		 * @returns {string|null}
		 * -getter returns string ("" if missing)
		 * -setter returns null
		 ******************************************************************/
		function attr(el, name, value) {
			if (!el || el.nodeType !== 1) return "";

			// getter: attr(el, "id")
			if (arguments.length === 2 && typeof name === "string") {
				const v = el.getAttribute(name);
				return (v == null) ? "" : String(v);
			}

			// setter map: attr(el, {a:1,b:2})
			if (name && typeof name === "object") {
				for (const k in name) {
					if (Object.prototype.hasOwnProperty.call(name, k)) {
						el.setAttribute(k, String(name[k]));
					}
				}
				return null;
			}

			// setter: attr(el, "id", "x")
			const key = String(name || "");
			if (key) el.setAttribute(key, String(value));
			return null;
		}
		
		/******************************************************************
		 * dom removeAttr
		 * -removes an attribute from an element
		 * @param {element} el
		 * @param {string} attribute name
		 ******************************************************************/
		function removeAttr(el, name) {
			if (!el || el.nodeType !== 1) return;
			const key = String(name || "");
			if (!key) return;
			el.removeAttribute(key);
		}
		
		/******************************************************************
		 * dom text
		 * -sets the textContent attr on an element
		 * @param {element} el
		 * @param {string} Optional the text to set
		 * returns {string} the textContent or null if setting
		 ******************************************************************/
		function text(el, value) {
			if (!el || el.nodeType !== 1) return null;

			// getter
			if (arguments.length === 1) {
				return el.textContent;
			}

			// setter
			el.textContent = String(value);
			return null;
		}
		
		/******************************************************************
		 * dom html
		 * -gets or sets the innerHTML on an element
		 * @param {element} el
		 * @param {string} (optional) html to set
		 * @returns {string|null} string if getting, null if setting
		 ******************************************************************/
		function html(el, v) {
			if (!el || el.nodeType !== 1) return null;

			// getter: html(el)
			if (arguments.length === 1) {
				return el.innerHTML;
			}

			// setter: html(el, "<div></div>")
			el.innerHTML = String(v);
			_maybeCompile(el);
			return null;
		}
		
		/******************************************************************
		 * dom val
		 * -gets or sets the value property
		 * -applies to inputs, selects, textareas (anything with .value)
		 * @param {element} el
		 * @param {any} (optional) value to set
		 * @returns {any|null} value if getting, null if setting
		 ******************************************************************/
		function val(el, v) {
			if (!el || el.nodeType !== 1) return null;

			// getter: val(el)
			if (arguments.length === 1) {
				return ("value" in el) ? el.value : null;
			}

			// setter: val(el, x)
			if ("value" in el) el.value = v;
			return null;
		}
		
		/******************************************************************
		 * dom hasClass
		 * -checks if the FIRST element has the given class
		 * @param {element} el
		 * @param {string} class name
		 * @returns {boolean}
		 ******************************************************************/
		function hasClass(el, cls) {
			if (!el || !cls) return false;
			return el.classList.contains(cls);
		}
		/******************************************************************
		 * dom toggleClass
		 * -toggles a class on an element
		 * @param {element} el
		 * @param {string} class name
		 * @param {boolean} optional force state
		 ******************************************************************/
		function toggleClass(el, cls, force) {
			if (!el || !cls) return;

			if (force === undefined) {
				el.classList.toggle(cls);
			} else {
				el.classList.toggle(cls, !!force);
			}
			return;
		}
		
		/******************************************************************
		 * dom css
		 * -gets computed style (getter) or sets inline style (setter)
		 * -numeric values auto-append "px" where appropriate
		 * @param {element} el
		 * @param {string|object} name style name OR map of styles
		 * @param {string|number} (optional) value to set
		 * @returns {string[]|null}
		 * -getter returns string ("" if missing/invalid)
		 * -setter returns null
		 ******************************************************************/
		function css(el, name, value) {

			const unitless = {
				"opacity": true,
				"z-index": true,
				"font-weight": true,
				"line-height": true,
				"flex": true,
				"flex-grow": true,
				"flex-shrink": true,
				"order": true,
				"zoom": true
			};

			function normalize(prop, val) {
				if (typeof val === "number") {
					if (prop.startsWith("--")) return String(val);
					if (unitless[prop]) return String(val);
					return val + "px";
				}
				return String(val);
			}

			// getter: css(el, "width")
			if (arguments.length === 2 && typeof name === "string") {
				if (!el || el.nodeType !== 1) return "";
				const prop = name.trim();
				if (!prop) return "";
				return window.getComputedStyle(el).getPropertyValue(prop);
			}

			// setters need a valid element
			if (!el || el.nodeType !== 1) return null;

			// setter map: css(el, {a:1,b:2})
			if (name && typeof name === "object") {
			for (const k in name) {
				if (Object.prototype.hasOwnProperty.call(name, k)) {
					el.style.setProperty(k, normalize(k, name[k]));
				}
			}
			return null;
			}

			// setter: css(el, "width", 120)
			const key = String(name || "").trim();
			if (!key) return null;

			el.style.setProperty(key, normalize(key, value));
			return null;
		}
		
		/******************************************************************
		 * dom addChild
		 * -inserts childEl into el at child index
		 * -invalid/undefined index => append
		 * @param {element} el parent element
		 * @param {element} childEl element to insert
		 * @param {number} (optional) atIndex child index
		 * @returns {element|null} inserted child element
		 ******************************************************************/
		function addChild(el, childEl, atIndex) {
			const addChildLog = log.scope("addChild");

			if (!el || el.nodeType !== 1) {
				addChildLog.warn("Invalid parent element", el);
				return null;
			}

			// QOL: allow HTML string
			if (typeof childEl === "string") {
				childEl = create(childEl);

				// create() can return array for multi-root strings
				if (Array.isArray(childEl)) {
					addChildLog.warn("HTML string produced multiple root nodes; expected 1 element", childEl);
					return null;
				}
			}

			// still strict: single ELEMENT only
			if (!childEl || childEl.nodeType !== 1) {
				addChildLog.warn("Invalid child element", childEl);
				return null;
			}

			const kids = el.children;
			const len = kids ? kids.length : 0;

			let idx = -1;
			if (typeof atIndex === "number" && isFinite(atIndex)) idx = Math.floor(atIndex);

			if (idx < 0 || idx > len) {
				el.appendChild(childEl);
				_maybeCompile(childEl);
				return childEl;
			}

			const ref = kids[idx] || null;
			el.insertBefore(childEl, ref);
			_maybeCompile(childEl);
			return childEl;
		}
		
		/******************************************************************
		 * dom insertBefore
		 * -inserts elToInsert before targetEl (as sibling)
		 * @param {element} targetEl
		 * @param {element|string} elToInsert (QOL: HTML string allowed)
		 * @returns {element|null} inserted element
		 ******************************************************************/
		function insertBefore(targetEl, elToInsert) {
			const ibLog = log.scope("insertBefore");

			if (!targetEl || targetEl.nodeType !== 1) {
				ibLog.warn("Invalid target element", targetEl);
				return null;
			}

			if (typeof elToInsert === "string") {
				elToInsert = create(elToInsert);
				if (Array.isArray(elToInsert)) {
					ibLog.warn("HTML string produced multiple root nodes; expected 1 element", elToInsert);
					return null;
				}
			}

			if (!elToInsert || elToInsert.nodeType !== 1) {
				ibLog.warn("Invalid insert element", elToInsert);
				return null;
			}

			const parent = targetEl.parentNode;
			if (!parent) {
				ibLog.warn("Target has no parentNode", targetEl);
				return null;
			}

			parent.insertBefore(elToInsert, targetEl);
			_maybeCompile(elToInsert);
			return elToInsert;
		}

		/******************************************************************
		 * dom insertAfter
		 * -inserts elToInsert after targetEl (as sibling)
		 * @param {element} targetEl
		 * @param {element|string} elToInsert (QOL: HTML string allowed)
		 * @returns {element|null} inserted element
		 ******************************************************************/
		function insertAfter(targetEl, elToInsert) {
			const iaLog = log.scope("insertAfter");

			if (!targetEl || targetEl.nodeType !== 1) {
				iaLog.warn("Invalid target element", targetEl);
				return null;
			}

			if (typeof elToInsert === "string") {
				elToInsert = create(elToInsert);
				if (Array.isArray(elToInsert)) {
					iaLog.warn("HTML string produced multiple root nodes; expected 1 element", elToInsert);
					return null;
				}
			}

			if (!elToInsert || elToInsert.nodeType !== 1) {
				iaLog.warn("Invalid insert element", elToInsert);
				return null;
			}

			const parent = targetEl.parentNode;
			if (!parent) {
				iaLog.warn("Target has no parentNode", targetEl);
				return null;
			}

			// nextSibling works for all node types, but we're inserting an element anyway
			parent.insertBefore(elToInsert, targetEl.nextSibling);
			_maybeCompile(elToInsert);
			return elToInsert;
		}

		/******************************************************************
		 * dom extract
		 * -converts an element (or wrapped set) into HTML string (or array)
		 * -default: returns outerHTML of first element		 
		 * -options.inner=true returns innerHTML
		 * -options.all=true all elements
		 * @param {any} target element | _Wrapped | array | NodeList-like
		 * @param {object} opts { inner?: boolean, all?: boolean }
		 * @returns {string|string[]} html string (or array if all=true)
		 ******************************************************************/
		function extract(target, opts) {
			opts = (opts && typeof opts === "object") ? opts : {};
			const inner = opts.inner === true;
			const all = opts.all === true;

			// unwrap to elements array
			let els = [];

			if (target && target.nodeType === 1) {
				els = [target];
			} else if (Array.isArray(target)) {
				els = target;
			} else if (_isNodeListLike(target)) {
				els = _toArray(target);
			}

			// normalize
			const clean = els.filter(e => e && e.nodeType === 1);

			if (!all) {
				const el = clean.length ? clean[0] : null;
				if (!el) return "";
				return inner ? el.innerHTML : el.outerHTML;
			}

			const out = [];
			for (let i = 0; i < clean.length; i++) {
				out.push(inner ? clean[i].innerHTML : clean[i].outerHTML);
			}
			return out;
		}
		
		/**
		 * dom field(containerEl, name)
		 *
		 * Locate form field(s) by name within a container element.
		 *
		 * PURPOSE:
		 * - Primitive DOM utility used by serialize / serializeArray / form
		 * - Does NOT depend on <form> tags
		 * - Does NOT assume any submit semantics
		 *
		 * BEHAVIOR:
		 * - Searches for elements with attribute [name="..."]
		 * - Scope is LIMITED to the provided container element
		 *
		 * RETURN VALUE:
		 * - null              → no matching fields
		 * - HTMLElement       → exactly one match
		 * - HTMLElement[]     → multiple matches (same name)
		 *
		 * NOTES:
		 * - Does NOT filter by tag type (input/select/textarea)
		 *   Filtering is handled by higher-level helpers
		 * - Caller is responsible for validating containerEl
		 *
		 * @param {HTMLElement} containerEl
		 * @param {string} name
		 * @returns {HTMLElement|HTMLElement[]|null}
		 */
		function field(containerEl, name) {
			if (!containerEl || containerEl.nodeType !== 1) return null;
			if (!name) return null;

			const list = containerEl.querySelectorAll('[name="' + name + '"]');
			
			const n = String(name);

			// CSS.escape is the correct way to build attribute selectors safely.
			// Fallback is best-effort (still safe-ish for common bracket names).
			const esc = (window.CSS && typeof window.CSS.escape === "function")	? window.CSS.escape(n) : n.replace(/["\\]/g, "\\$&");

			if (!list || list.length === 0) return null;
			if (list.length === 1) return list[0];

			return Array.prototype.slice.call(list);
		}
		
		/**
		 * dom form(containerEl, opts)
		 *
		 * Create a lightweight, programmatic "form controller" bound to a container
		 * element. No <form> tag is required. Native submit behavior is ALWAYS
		 * suppressed.
		 *
		 * PURPOSE:
		 * - Treats "form" as BEHAVIOR, not markup
		 * - Enables fine-grained submit control
		 * - Integrates cleanly with validators and ajax
		 *
		 * DEFAULT BEHAVIOR:
		 * - Enter key submits (except inside textarea)
		 * - Click on [data-submit] triggers submit
		 * - Native <form> submit is prevented if present
		 *
		 * OPTIONS (auditable defaults):
		 * - submitAttr   : attribute used to mark submit triggers
		 * - enterSubmit  : whether Enter key triggers submit
		 *
		 * @param {HTMLElement} containerEl
		 * @param {object} (optional) opts
		 * @returns {object|null} form controller API
		 */
		function form(containerEl, opts) {
			if (!containerEl || containerEl.nodeType !== 1) return null;

			// auditable defaults
			const defaultOpts = {
				submitAttr: "data-submit",
				enterSubmit: true
			};

			// merge opts over defaults
			const newOpts = base.mergeDeep(defaultOpts, (opts && typeof opts === "object") ? opts : {});

			let submitHandler = null;
			let wiredNativeSubmit = false;

			// ---- internal submit pipeline ----
			function doSubmit(e) {
				if (e) { e.preventDefault(); e.stopPropagation(); }
				
				// if validator exists, enforce it
				if (_validator) {
					const r = _validator.validate();
					if (!r.ok) return; // blocked
				}

				if (typeof submitHandler === "function") { submitHandler(serialize(containerEl, { includeEmpty: false }), api); }
			}

			// ---- event handlers ----
			function onKeyDown(e) {
				if (e && e.defaultPrevented === true) return;
				if (!newOpts.enterSubmit) return;

				// IME / composition safety
				if (e.isComposing === true || e.keyCode === 229) return;

				if (e.key !== "Enter") return;

				const t = e.target;

				// never enter-submit inside textarea
				if (t && t.tagName && t.tagName.toLowerCase() === "textarea") return;

				// avoid double-submit when focused on clickables
				if (t && t.tagName) {
					const tag = t.tagName.toLowerCase();
					if (tag === "button" || tag === "a") return;
				}

				doSubmit(e);
			}

			function onClick(e) {
				if (e && e.defaultPrevented === true) return;
				const t = e.target;
				if (!t) return;

				// support clicks on child elements inside the trigger
				if (typeof t.closest !== "function") return;

				const sel = "[" + newOpts.submitAttr + "]";
				const trigger = t.closest(sel);
				if (!trigger) return;

				// ignore disabled buttons
				const tag = trigger.tagName ? trigger.tagName.toLowerCase() : "";
				if (tag === "button" && trigger.disabled === true) return;
				if (trigger.getAttribute && trigger.getAttribute("aria-disabled") === "true") return;

				doSubmit(e);
			}

			function onNativeSubmit(e) {
				doSubmit(e);
			}

			// ---- wire listeners ----
			containerEl.addEventListener("keydown", onKeyDown);
			containerEl.addEventListener("click", onClick);

			// neutralize native form submit if container IS a form
			if (containerEl.tagName && containerEl.tagName.toLowerCase() === "form") {
				containerEl.addEventListener("submit", onNativeSubmit);
				wiredNativeSubmit = true;
			}

			// ---- public API ----
			const api = Object.create(null);
			
			defineLocked(api,"el", containerEl);
			defineLocked(api,"fields", function (opts) { return serializeArray(containerEl, opts); });
			defineLocked(api,"values", function (opts) { return serialize(containerEl, opts); });
			defineLocked(api,"field", function (name) {	return field(containerEl, name); });
			defineLocked(api,"onSubmit", function (fn) { submitHandler = fn; return api; });
			defineLocked(api,"submit", function () { doSubmit(); return api; });
			defineLocked(api,"destroy", function () {
				containerEl.removeEventListener("keydown", onKeyDown);
				containerEl.removeEventListener("click", onClick);
				if (wiredNativeSubmit) containerEl.removeEventListener("submit", onNativeSubmit);
			});
			
			let _validator = null;

			defineLocked(api, "getValidator", function getValidator() {
				return _validator;
			});

			defineLocked(api, "validate", function attachValidator(rules, vopts) {
				_validator = _validate(containerEl, rules, vopts);
				return _validator;
			});

			return api;
		}

		/**
		 * dom serializeArray(containerEl, opts)
		 *
		 * Convert fields within a container element into a jQuery-style array:
		 *   [{ name: string, value: string }, ...]
		 *
		 * PURPOSE:
		 * - Works on ANY container (no <form> required)
		 * - Produces a flat list suitable for:
		 *     - serialize() object building
		 *     - net.param() form encoding
		 *     - validators / custom submit pipelines
		 *
		 * DEFAULT RULES (jQuery-like):
		 * - Includes: input, select, textarea
		 * - Skips:
		 *     - disabled fields
		 *     - fields without a name
		 *     - buttons (button / submit / reset)
		 * - Checkbox / radio:
		 *     - included ONLY if checked
		 * - select[multiple]:
		 *     - one {name,value} per selected option
		 * - Values are normalized to strings
		 *
		 * OPTIONS:
		 * - includeEmpty (default false):
		 *     - if false: empty-string values ("") are skipped
		 *     - if true : empty-string values are included
		 *
		 * @param {HTMLElement} containerEl
		 * @param {object} (optional) opts
		 * @param {boolean} (optional) opts.includeEmpty
		 * @returns {Array<{name:string,value:string}>}
		 */
		function serializeArray(containerEl, opts) {
			if (!containerEl || containerEl.nodeType !== 1) return [];

			// auditable defaults
			const defaultOpts = { includeEmpty: false };

			// merge opts over defaults (opts wins)
			const newOpts = base.mergeDeep(defaultOpts, (opts && typeof opts === "object") ? opts : {});

			const out = [];
			const fields = containerEl.querySelectorAll("input, select, textarea");

			for (let i = 0; i < fields.length; i++) {
				const el = fields[i];

				// skip disabled + unnamed
				if (el.disabled) continue;
				if (!el.name) continue;

				const tag = el.tagName.toLowerCase();
				const type = String(el.type || "").toLowerCase();

				// skip buttons
				if (tag === "button") continue;
				if (type === "submit" || type === "reset" || type === "button" || type === "fieldset") continue;
				if (type === "file" || type === "image") continue;

				// checkbox / radio: only if checked
				if (type === "checkbox" || type === "radio") {
					if (!el.checked) continue;

					const v = String(el.value);
					if (v === "" && newOpts.includeEmpty !== true) continue;

					out.push({ name: el.name, value: v });
					continue;
				}

				// select[multiple]: one item per selected option
				if (tag === "select" && el.multiple) {
					for (let j = 0; j < el.options.length; j++) {
						const opt = el.options[j];
						if (!opt.selected) continue;

						const v = String(opt.value);
						if (v === "" && newOpts.includeEmpty !== true) continue;

						out.push({ name: el.name, value: v });
					}
					continue;
				}

				// normal input/select/textarea value
				const v = String(el.value);
				if (v === "" && newOpts.includeEmpty !== true) continue;

				out.push({ name: el.name, value: v });
			}

			return out;
		}
		
		/**
		 * dom serialize(containerEl, opts)
		 *
		 * Convert fields within a container element into a name → value object.
		 *
		 * PURPOSE:
		 * - High-level convenience over serializeArray()
		 * - Suitable for ajax data payloads and validators
		 *
		 * BEHAVIOR:
		 * - Single field name  → scalar string
		 * - Repeated field name → array of strings
		 *
		 * DEFAULT RULES:
		 * - Inherits all rules from serializeArray()
		 * - Empty values are excluded unless includeEmpty === true
		 *
		 * OPTIONS (auditable defaults):
		 * - includeEmpty (default false):
		 *     - false → skip empty-string values
		 *     - true  → include empty-string values
		 *
		 * @param {HTMLElement} containerEl
		 * @param {object} (optional) opts
		 * @returns {object} name/value map
		 */
		function serialize(containerEl, opts) {
			if (!containerEl || containerEl.nodeType !== 1) return Object.create(null);

			// auditable defaults
			const defaultOpts = { includeEmpty: false };

			// merge opts over defaults (opts wins)
			const newOpts = base.mergeDeep(defaultOpts, (opts && typeof opts === "object") ? opts : {});

			const arr = serializeArray(containerEl, newOpts);
			const out = Object.create(null);

			for (let i = 0; i < arr.length; i++) {
				const name = arr[i].name;
				const value = arr[i].value;

				if (out[name] === undefined) {
					out[name] = value;
				}
				else if (Array.isArray(out[name])) {
					out[name].push(value);
				}
				else {
					out[name] = [ out[name], value ];
				}
			}

			return out;
		}
		
		/******************************************************************
		 * dom() constructor (callable API)
		 * - jQuery-style:
		 *     dom("div") selects tags
		 *     dom("#id") selects id
		 *     dom(".cls") selects classes
		 *     dom("div", ctx) selects within ctx
		 * - also supports:
		 *     dom("<div>..</div>") -> creates + wraps
		 *     dom({tag:"div", ...}) -> creates + wraps
		 *     dom("div", {attrs}) -> creates + wraps
		 ******************************************************************/
		function dom(input, context) {

			// 1) null / undefined -> empty wrapper
			if (input == null) {
				return _wrapOne();
			}

			// 2) already wrapper?
			if (input && typeof input === "object" && input instanceof _Wrapped) {
				return input;
			}

			// 3) HTMLElement -> wrap one
			if (_isHtmlElement(input)) {
				return _wrapOne(input);
			}

			// 4) NodeList-like / array-like -> wrap many
			if (Array.isArray(input)) {
				return _wrapMany(input);
			}

			if (_isNodeListLike(input)) {
				return _wrapMany(_toArray(input));
			}

			// 5) ("tag", {attrs}) overload -> CREATE + WRAP
			if (typeof input === "string" && _isPlainObject(context)) {

				const spec = Object.create(null);

				// copy attrs
				for (const k in context) {
					if (Object.prototype.hasOwnProperty.call(context, k)) {
						spec[k] = context[k];
					}
				}

				// tag param wins
				spec.tag = input;

				const made = create(spec); // create() will call createString() and throw if needed
				if (made == null) return _wrapOne();
				if (Array.isArray(made)) return _wrapMany(made);
				return _wrapOne(made);
			}

			// 6) string -> HTML OR selector (jQuery-style, optional context)
			if (typeof input === "string") {
				const s = input.trim();
				if (!s) return _wrapOne();

				// 6a) HTML -> create -> wrap
				if (_looksLikeHtml(s)) {
					const made = create(s);
					if (made == null) return _wrapOne();
					if (Array.isArray(made)) return _wrapMany(made);
					return _wrapOne(made);
				}

				// 6b) Selector, scoped to context if provided
				const root = _resolveContextRoot(context);

				// If context is custom, use querySelector so the context is respected.
				if (s[0] === "#" && s.indexOf(" ") === -1 && s.indexOf(">") === -1 && s.indexOf("+") === -1 && s.indexOf("~") === -1) {
					if (root === _getQueryRoot() || root === document || root === system.appEl) {
						const id = s.substring(1);
						const el = document.getElementById(id);
						return el ? _wrapOne(el) : _wrapOne();
					}
					const one = root.querySelector(s);
					return one ? _wrapOne(one) : _wrapOne();
				}
				const wrapped = _wrapOne(root);
				return (wrapped.prop(s) === []) ? wrapped : _wrapMany(_toArray(root.querySelectorAll(s)));
			}

			// 7) spec object -> create -> wrap
			if (input && typeof input === "object") {
				if (input.tag || input.type) {
					if (!input.tag && input.type) input.tag = input.type;

					const made = create(input);
					if (made == null) return _wrapOne();
					if (Array.isArray(made)) return _wrapMany(made);
					return _wrapOne(made);
				}
			}

			// 8) unknown -> throw
			const err = new Error("Unsupported input type: " + input);
			log.fatal("Unsupported input type", err);
		}

		/******************************************************************
		 * Attach semi private _Wrapped so other mods can extend it
		 ******************************************************************/
		defineLocked(dom, "fn", _Wrapped.prototype);   // jQuery-ish extension surface
		defineLocked(dom, "_Wrapped", _Wrapped);       // for instanceof, debugging
		
		/******************************************************************
		 * Attach public methods to dom. 
		 ******************************************************************/
		//Note, dom dom() and dom().fn QOL is as jQuery users expect
		//-wrap an el with dom(el) to opt into wrapped query object
		//or use the raw dom.fn(el) to stay unwrapped.
		//wrapped versions use raw element function.
		//the are extra ez things on dom
		
		//dom creation/extraction
		//dom() QOL uses these
		defineLocked(dom, "create", create);
		defineLocked(dom, "createString", createString);		
		
		//dom(). QOL has prepend,append,before, and after, but uses these
		defineLocked(dom, "addChild", addChild);
		defineLocked(dom, "insertBefore", insertBefore);
		defineLocked(dom, "insertAfter", insertAfter);
		
		//ezHelper
		//note, this is not on the dom() QOL.
		//examlples
		// dom.extract(el);
		//OR
		// const wrapped = dom(el); dom.extract(wrapped.el);
		//but no dom(el).extract. dom() creates, extract is for debugging, saving or auditing.
		defineLocked(dom, "extract", extract);
		
		//visibility helpers
		defineLocked(dom, "hide", hide);
		defineLocked(dom, "show", show);
		defineLocked(dom, "toggle", toggle);
		
		//class helpers
		defineLocked(dom, "addClass", addClass);
		defineLocked(dom, "removeClass", removeClass);
		defineLocked(dom, "hasClass", hasClass);
		defineLocked(dom, "toggleClass", toggleClass);
		
		//attributes/properties
		defineLocked(dom, "attr", attr);
		defineLocked(dom, "prop", attr); // jQuery has both, they do the same thing.
		defineLocked(dom, "removeAttr", removeAttr);
		defineLocked(dom, "removeProp", removeAttr);
		defineLocked(dom, "text", text);
		defineLocked(dom, "html", html);
		defineLocked(dom, "val", val);
		defineLocked(dom, "css", css);
				
		//forms
		defineLocked(dom, "field", field);
		defineLocked(dom, "form", form);
		defineLocked(dom, "serializeArray", serializeArray);
		defineLocked(dom, "serialize", serialize);
		
		/******************************************************************
		 * Attach to system
		 ******************************************************************/
		defineLocked(system, modName, dom);

		log.info(modName + " module ready");

		return dom;
	}

	// Attach defaults to start function (loader reads this)
	start.defaults = defaults();

	/********************************************************************
	 * Module export (registry)
	 ********************************************************************/
	const w = window;
	if (!w.__ezWebMods) w.__ezWebMods = Object.create(null);
	w.__ezWebMods[modName] = start;

})();

export default start;