<!-- ezWeb README.md version: 0.0.4 -->

# ezWeb  
### A loader + composable primitives  
**Transparent contracts. Security-first by default.**
For a more detailed readme, download and double click readme.html
---

## Table of Contents

- [Introduction](#introduction)
- [Quick Start](#quick-start)
- [Totem Pole Ladder](#totem-pole-ladder)
- [Philosophy](#philosophy)
- [Security Model](#security-model)
- [Module API Contract](#module-api-contract)
- [Interop (DOM + NET modules)](#interop-dom--net-modules)
- [Binding](#binding)
- [Logging](#logging)

---

## Introduction

ezWeb is a small framework built around **hard contracts**:  
a loader that owns scope and security, and a set of composable modules:

```
dom → net → bind → ui → uix
```

It exists because *existing libraries work… until they don’t*.

When behavior is hidden, state is implicit, and debugging depends on magic,
you eventually pay for it.

ezWeb prioritizes:

- **Transparency over convenience**
- **Debuggability over cleverness**
- **Security as a first-class concern**

What ezWeb is **not**:

- Not React
- Not Angular
- Not a “framework replacement”

What ezWeb **is**:

- A loader + explicit module lifecycle
- A system bag you can inspect
- A codebase you can understand by reading it

---

## Quick Start

The loader is the engine.

Modules don’t run until the loader mounts your app.  
The mount callback is the **only place** you receive the live system bag.

High-level security posture:

- No global pollution
- Explicit module ladder
- ezWeb returns **only a pid string**, not the system handle

### Minimal example

```html
<div id="app"></div>
<script type="module">
	"use strict";
	import ezWeb from "https://cdn.jsdelivr.net/gh/Akadine/ezWebJS@v0.1.7/ezWeb.js";
	
	const options = {
		appPrefix: "MyApp",
		verbosity: 3
	};
	
	const data = {};
	
	ezWeb("app", "dom", data, options, function(system){
		const $ = system.dom;
		$(system.appEl).append({ tag:"div", text:"Hello World from ezWeb" });
	});
</script>
```

---

## Totem Pole Ladder

ezWeb uses a **hardcoded dependency ladder**.

```
dom → net → bind → ui → uix
```

Pick the highest module you want; ezWeb loads everything below it. (Note: ui and uix are not released yet. dom + net would be minimum viable, adding bind was minimum wow)

---

## Philosophy

ezWeb is optimized for code you can understand months later — by reading it.

Transparency > convenience  
Debuggability > magic  
Security first  

---

## Security Model

ezWeb returns only a pid string.  
The loader owns lifecycle, scope, and order.

Security through structure — not obscurity.

---

## Module API Contract

Each module exposes its API by attaching it to the system bag.

Higher modules may extend lower modules — never the other way around.

---

## Interop (DOM + NET modules)

DOM and NET (AJAX) follow the jQuery silhouette with modern internals. (i.e. $.ajax() just works)

No dependency. No globals.

---

## Binding

No virtual DOM.  
No manual compile.  
Declarative ez* attributes.

---

## Logging

Scoped logging with levels:
NONE, INFO, WARN, DEBUG, ERROR, FATAL

ERROR and FATAL always print, FATAL always throws.
