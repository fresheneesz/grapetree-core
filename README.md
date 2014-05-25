`grapetree-core`
============

A simple, powerful library for generalized hierarchical path-routing for client-side and server-side applications.
`grapetree-core` powers the [grapetree](https://github.com/fresheneesz/grapetree) url routing library and was inspired by
 [cherrytree](https://github.com/QubitProducts/cherrytree).
Like [crossroads.js](http://millermedeiros.github.io/crossroads.js/), [router.js](https://github.com/tildeio/router.js), and cherrytree,
`grapetree-core` embraces the [single-responsibility principle ](http://en.wikipedia.org/wiki/Single_responsibility_principle)
and is entirely stand-alone, free of any dependencies on a framework of any kind.

Features
=====================
* Intuitive nested routing description
* Route lifecycle hooks so each part of the path can have a setup and cleanup function
* familiar error bubbling (errors bubble to the nearest handler up the tree)
* Small footprint (< 14.5 KB unminified uncompressed)

Install
=======

```
npm install grapetree-core
```

Usage
=====

```javascript
var GrapeTreeCore = require('grapetree-core')
```

`GrapeTreeCore(routeDefinition)` - Returns a new router instance based on `routeDefinition`, which should be a function that gets a `Route` object as its `this` context.

`GrapeTreeCore.param` - Special value used by `Route.route` - see below.

Router objects
--------------

`router.go(newPath[, emitGoEvent])` - Changes the current path and triggers the router to fire all the appropriate handlers. `newPath` is the path to change to, `emitGoEvent` is whether to emit the `"go"` event (default true).

`router.transformPath(trasformFn)` - Sets up path transformation, which modifies the raw path before passing it as an argument to the `"go"` event and `Route.default` handlers. This is mostly used for libraries that want to extend grapetree-core (like grapetree itself).

`router.on` - router inherits from [EventEmitter](http://nodejs.org/api/events.html) and so gets all the methods from it like `router.once` and `router.removeListener`. This can throw an exception if no Route `error` handlers catch an exception.

#### Router events

* 'go' - Emitted when the path has changed, but before the router has actually run any of the handlers for it. This is the only event. The event data contains the new path.

Route objects
--------------

`this.route(pathSegment, routeDefinition)` - creates a sub-path route. The routes are tested for a match in the order they are called - only one will be used.

* `pathSegment` - the parts of the path to match a route path against (e.g. ['a','b'] or 'x'). If `pathSegment` is an array, the route only matches if each item in `pathSegment` matches the corresponding parts in the path being changed to. If `pathSegment` is not an array, it is treated as `[pathSegment]`. If any of the items in the array are `GrapeTreeCore.param`, matching parts of the path being changed to are treated as parameters that will be passed to the `routeDefinition` function.
* `routeDefinition` - a function that gets a `Route` object as its `this` context. It is passed any parameters that exist in `pathSegment` in the same order.

`this.default(routeDefinition)` - creates a default sub-path route that is matched if no other route is.

* `routeDefinition` - a function that gets a `Route` object as its `this` context. It is passed the new pathSegment being changed to. If `router.transformPath` has been called, the parameter will have been transformed with the transform.

`this.enter(levelHandlers...)` - sets up handlers that are called when a path newly "enters" the subroute (see **Route Lifecycle Hooks** for details).

* `levelHandlers...` - `this.enter` can be passed any number of arguments, each being a function that will be called when the path is "entered". The index at which a `levelHandler` is at is significant, and is synchronized with `levelHandler`s in all entered routes (again details below). If `undefined` is passed as an argument, that level is skipped for this route.

`this.exit(levelHandlers...)` - sets up handlers that are called when a new path "exits" the subroute (see **Route Lifecycle Hooks** for details).

* `levelHandlers...` - `this.exit` can be passed any number of arguments, each being a function that will be called when the path is "exited". The index at which a `levelHandler` is at is significant, and is synchronized with `levelHandler`s in all exited routes (again details below). If `undefined` is passed as an argument, that level is skipped for this route.

`this.error(errorHandler)` - Sets up an error handler that is passed errors that happen anywhere in the router. If an error handler is not defined for a particular subroute, the error will be passed to its parent. If an error bubbles to the top, the error is thrown from the `router.go` function itself.

* `errorHandler(stage, error)` - A function that handles the `error`. The first parameter `stage` is the stage of path-changing the error happened in. `stage` can be either "enter", "exit", or "route"


Route Lifecycle Hooks
-------------

#### Handler order

1. 'go' event handler
2. Exit handlers - from outermost to the divergence route (the route who's parent still matches the new route)
3. Enter handlers - from the convergence route (the route matching the first segement of the new path) to the outermost new route

#### Handler (exit and enter) level order

1. All level 1s first
2. All level 2s
3. etc

#### Explanation

The routing hooks in `grapetree-core` are simple but powerful. Basically exit handlers are called from leaf-node routes inward, and enter handlers are called outward toward the leaf-nodes.

```javascript
var router = Router(function() { // root
    this.route('a', function() {
    	this.enter(function() {
       		// entering a
        })
        this.exit(function() {
        	// exiting a
        })
        this.route('x', function() {
            this.enter(function() {
                // entering x
            })
            this.exit(function() {
                // exiting x
            })
        })
    })
    this.route('b', function() {
    	this.enter(function() {
        	// entering b
        })
        this.exit(function() {
        	// exiting b
        })
    })
})

router.on('go', function(newPath) {
    console.log('went to '+newPath.join(','))
})

router.go(['a', 'x'])
router.go(['b'])
```

The order the handlers are called in the above example is:

1. go event: "went to a,x"
2. entering a
3. entering x
4. go event: "went to b"
5. exiting x
6. exiting a
7. entering b

If you have  multiple levels of exit or enter handlers, things get slightly more complicated:

``javascript
var router = Router(function() { // root
    this.route('a', function() {
    	this.enter(function() {
       		// entering a level 1
            return 1
        }, function(one) { // it gets the return value of the previous level as its argument
            // entering a level 2
        })
        this.route('x', function() {
            this.enter(function() {
                // entering x level 1
            }, function() {
                // entering x level 2
            })
        })
    })
})

router.go(['a', 'x'])
```

The order the handlers are called in the above example is:

1. entering a level 1
2. entering x level 1
3. entering a level 2
4. entering x level 2

You can use different handler levels to do things like make asynchronous server requests, expecting to wait for the request to be completed in a later level. Its up to you to decide what your application needs. Theses are analogous to [router.js](https://github.com/tildeio/router.js)'s hooks (enter, exit, beforeModel, model, afterModel).


Todo
====

* Browser testing


Changelog
========

* 0.0.1 - first version

How to Contribute!
============

Anything helps:

* Creating issues (aka tickets/bugs/etc). Please feel free to use issues to report bugs, request features, and discuss changes
* Updating the documentation: ie this readme file. Be bold! Help create amazing documentation!
* Submitting pull requests.

How to submit pull requests:

1. Please create an issue and get my input before spending too much time creating a feature. Work with me to ensure your feature or addition is optimal and fits with the purpose of the project.
2. Fork the repository
3. clone your forked repo onto your machine and run `npm install` at its root
4. If you're gonna work on multiple separate things, its best to create a separate branch for each of them
5. edit!
6. If it's a code change, please add to the unit tests (at test/grapetreeCoreTest.js) to verify that your change
7. When you're done, run the unit tests and ensure they all pass
8. Commit and push your changes
9. Submit a pull request: https://help.github.com/articles/creating-a-pull-request

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT
