/* ez<name>.js
 * ezWeb Framework Module
 * Version: 0.0.1
 *
 * Contract:
 * - File evaluates to a FUNCTION: start(system)
 * - Loader calls start(system) exactly once per app mount
 * - Module may:
 *     - Attach API to system.<name>
 *     - OR return an API object (loader assigns it if system slot is empty)
 * - Optional: start.defaults for module-scoped options
 */

(function () {
	"use strict";

	const modName = "<name>";

	/********************************************************************
	 * Optional module defaults
	 * Merged into system.options.<moduleName> BEFORE start() runs
	 ********************************************************************/
	function defaults() {
		return {
			debug: false
		};
	}

	/******************************************************************
	 * <name> start
	 * Module entrypoint, attaches API to system bag
	 * @param {object} the system bag
	 ******************************************************************/
	function start(system) {
		//import base
		const base = system.base;
		
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
		function getName() {
			return modName;
		}

		/******************************************************************
		 * Public API
		 ******************************************************************/
		const <name> = Object.create(null);
		
		defineLocked(<name>, "sayHello", function sayHello(toMe) {
			const sayHelloLog = log.scope("sayHello");
			sayHelloLog.info("sayHello() called by", toMe);
			return "Hello, " + String(toMe || "") + ", I'm the " + getName() + " module.";
		});

		/******************************************************************
		 * Attach API to system bag (preferred)
		 ******************************************************************/
		defineLocked(system, modName, <name>);

		log.info(modName + " module ready");

		// Optional return (loader will attach if system slot is still empty)
		return <name>;
	}

	// Attach defaults to start function (loader reads this)
	start.defaults = defaults();

	/********************************************************************
	 * Module export (script-tag compatible)
	 *
	 * NOTE:
	 * - Script tags cannot return values directly to the loader.
	 * - Instead, the IIFE "returns" start(system) by publishing it
	 *   to a known global registry that the loader reads after load.
	 ********************************************************************/
	const w = window;
	if (!w.__ezWebMods) w.__ezWebMods = Object.create(null);
	w.__ezWebMods[modName] = start;

})();