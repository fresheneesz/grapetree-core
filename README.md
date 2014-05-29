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
* Familiar error bubbling (errors bubble to the nearest handler up the tree)
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

`GrapeTreeCore.Future` - A reference to [the async-future module](https://github.com/fresheneesz/asyncFuture), which `grapetree-core` uses internally. This does not have to be the futures/promises implementation you use to return a future from `enter` and `exit` handlers, but a future must have a `then`, `catch`, and `finally` method.

Router objects
--------------

`router.go(newPath[, emitChangeEvent])` - Changes the current path and triggers the router to fire all the appropriate handlers. `newPath` is the path to change to, `emitChangeEvent` is whether to emit the `"change"` event (default true). Returns [a future](https://github.com/fresheneesz/asyncFuture) that is resolved when the route is complete or has an error that isn't handled by a Route's error handler.

`router.transformPath(trasformFns)` - Sets up path transformation, which modifies the internal path before passing it as an argument to the `"change"` event and `Route.default` handlers and after getting an external path from the `router.go` and `Route.route` functions. This is mostly used for libraries that want to extend grapetree-core (like grapetree itself).

* trasformFns - an object like {toExternal: function(internalPath){...}, toInternal: function(externalPath){...}}

`router.on` - router inherits from [EventEmitter](http://nodejs.org/api/events.html) and so gets all the methods from it like `router.once` and `router.removeListener`. This can throw an exception if no Route `error` handlers catch an exception.

#### Router events

* 'change' - Emitted after all the handlers for a particular new path have been run. This is the only event. The event data contains the new path.

Route objects
--------------

`this.route(pathSegment, routeDefinition)` - creates a sub-path route. The routes are tested for a match in the order they are called - only one will be used.

* `pathSegment` - the parts of the path to match a route path against (e.g. ['a','b'] or 'x'). If `pathSegment` is an array, the route only matches if each item in `pathSegment` matches the corresponding parts in the path being changed to. If `pathSegment` is not an array, it is treated as `[pathSegment]`. If any of the items in the array are `GrapeTreeCore.param`, matching parts of the path being changed to are treated as parameters that will be passed to the `routeDefinition` function.
* `routeDefinition` - a function that gets a `Route` object as its `this` context. It is passed any parameters that exist in `pathSegment` in the same order.

`this.default(routeDefinition)` - creates a default sub-path route that is matched if no other route is.

* `routeDefinition` - a function that gets a `Route` object as its `this` context. It is passed the new pathSegment being changed to. If `router.transformPath` has been called, the parameter will have been transformed with the transform.

`this.enter(handler)` - sets up a handler that is called when a path newly "enters" the subroute (see **Route Lifecycle Hooks** for details).

* `handler(parentValue, leafDistance)` - a function that will be called when the path is "entered". The handler may return [a future](https://github.com/fresheneesz/asyncFuture), which will be waited on before child enter-handlers are called.
  * `leafDistance` is the number of routes between it and the deepest matching route (e.g. for a change from ['a','b','c','d'] to ['a','b','x','y'], x's leaf distance is 1, and y's is 0). This is useful, for example, in situations where you want to redirect to a (default) subroute only if the current route is the last one (`leafDistance === 0`).
  * `parentValue` is the value of the future returned by its parent's enter handler, or undefined if no future was returned by its parent.

`this.exit(handler)` - sets up a handler that is called when a new path "exits" the subroute (see **Route Lifecycle Hooks** for details).

* `handler(parentValue, divergenceDistance)` - a function that will be called when the path is "exited". The handler may return [a future](https://github.com/fresheneesz/asyncFuture), which will be waited on before parent exit-handlers are called.
  * `divergenceDistance` is the number of routes between it and the recent path-change (e.g. for a change from ['a','b','c','d'] to ['a','b','x','y'], c's divergence distance is 0, and d's is 1). This is useful, for example, if some work your exit handler does is unnecessary if its parent route's exit handler is called.
  * `parentValue` is the value of the future returned by its parent's **enter** handler (*not* its parent's or child's exit handler), or undefined if no future was returned by its parent.

`this.error(errorHandler)` - Sets up an error handler that is passed errors that happen anywhere in the router. If an error handler is not defined for a particular subroute, the error will be passed to its parent. If an error bubbles to the top, the error is thrown from the `router.go` function itself. The handler may return [a future](https://github.com/fresheneesz/asyncFuture), which will propogate errors from that future to the next error handler up, if that future resolves to an error.

* `errorHandler(error, info)` - A function that handles the `error`. The second parameter is an object with info about where the error happened. It has the following members:
  * `info.stage` - the stage of path-changing the error happened in. `stage` can be either "enter", "exit", or "route"
  * `info.location` - the path segement (relative to the current route) where the error happened ([] indicates the current route)

Route Lifecycle Hooks
-------------

#### Handler order

1. 'change' event handler
2. Exit handlers - from outermost to the divergence route (the route who's parent still matches the new route)
3. Enter handlers - from the convergence route (the route matching the first segement of the new path) to the outermost new route

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

router.on('change', function(newPath) {
    console.log('went to '+newPath.join(','))
})

router.go(['a', 'x']).then(function() {
    return router.go(['b'])
}).done()
```

The order the handlers are called in the above example is:

1. change event: "went to a,x"
2. entering a
3. entering x
4. change event: "went to b"
5. exiting x
6. exiting a
7. entering b


Error Handling
==============

Error handling in grape-tree is an attempt to be as intuitive as possible, but they are a bit different from traditional try-catch, because the success of a parent route should not depend on the success of a child route (as opposed to normal try-catch situations where the calling code's success depends on the called code).
Here are some facts about how errors are handled:

* If a child route has an error and it bubbles up past its parent, its parent is not actually affected - all its enter and exit handlers are called as normal.
* Errors bubble up from the route where they happened, to the error handler of nearest ancestor route that has one.
* If a route has an error, the path will be incomplete (e.g. if you try to go to /a/b/c/d and there was an error at c, the path will end up bing /a/b)

See the unit tests for exhaustive examples of how error handling works. For the most part, you should be able to use it well without fully understanding the intricacies of how it works.


Default Handlers
================

Like the error handlers, default handlers for a route also cover the scope of that route's children. In other words, if a child doesn't have a default route, its parent's (or grandparent's etc) default route will be used.
This allows you to have a single default handlers at the top level that will catch any invalid route.


Todo
====

* If an error happens in a enter handler and is not handled by an error handler in that route, enter handlers of parents should probably continue to run
    * if a parent doesn't handle the error either, should its exit handler be automatically called?
* Browser testing


Changelog
========

* 2.2.0 - making a route's default handlers get run in the case a route's children don't have deafult routes
* 2.1.0 - changing exit handlers so they get both a "value" and the divergenceIndex (just like the enter handler gets two similar parameters)
* 2.0.1 - fixing bug with switching between paths that have the same beggining in a route with multiple parts
* 2.0.0 - major API change
  * changing the "go" event to be the "change" event
  * getting rid of enter and exit "levels"
  * adding the ability to return a future from enter and exit handlers, which will cause child enter handlers to only run when those resolve and handle errors that come out of the futures properly
  * adding the ability to return a future from error handlers, which if resolve to an error will propogate to the next error handler up
* 1.1.1 - minor error reporting fix
* 1.1.0
  * improving exception message
  * fixing default's path to be a path segement instead of the full path
  * fixing up error handling to behave more reasonably, and adding documentation about how error handling works specifically
  * changing order of the error handler's arguments
* 1.0.0 - changing the `transformPath` method to allow transforms in both directions
* 0.0.3 - pass the leaf distance to the first enter handler
* 0.0.2 - pass the divergence/convergence distance to the first enter/exit handler
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
