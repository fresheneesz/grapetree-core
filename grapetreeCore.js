// based on ideas from https://github.com/QubitProducts/cherrytree

var EventEmitter = require('events').EventEmitter
var proto = require('proto')

var Router = module.exports = proto(EventEmitter, function() {

    // static

    this.param = {} // special value used to indicate a parameter in a route

    // routerDefinition should be a function that gets a Route object as its `this` context
    this.init = function(routerDefinition) {
        var route = Route([])
        route.route([], function() {
            this.topLevel = true
            routerDefinition.call(this)
        })

        this.currentPath = [] // this is only the case to initialize
        this.currentRoutes = [{route:route, pathIndex: -1}]

        var newRoutes = traverseRoute(this, route, [], -1, false, [])
        this.currentRoutes = this.currentRoutes.concat(newRoutes)
        runNewRoutes(this.currentRoutes, 0)
    }

    // instance

    // switches to a new path, running all the exit and enter handlers appropriately
    // path - the path to change to
    // emit - (default true) if false, won't emit a 'go' event
    this.go = function(path, emit) {
        if(emit === undefined) emit = true

        path = getPathFromInput(this, path)
        if(!(path instanceof Array)) {
            throw new Error("A route passed to `go` must be an array")
        }

        // find where path differs
        var divergenceIndex // the index at which the paths diverge
        for(var n=0; n<this.currentPath.length; n++) {
            if(this.currentPath[n] !== path[n]) {
                divergenceIndex = n
                break;
            }
        }
        if(divergenceIndex === undefined && path.length > this.currentPath.length) {
            divergenceIndex = this.currentPath.length
        }

        if(divergenceIndex === undefined)
            return; // do nothing if paths are the same

        var routeDivergenceIndex = findRouteIndexFromPathIndex(this.currentRoutes, divergenceIndex)
        var lastRoute = this.currentRoutes[routeDivergenceIndex-1].route
        var newPathSegment = path.slice(divergenceIndex)

        // routing
        var newRoutes = traverseRoute(this, lastRoute, newPathSegment, divergenceIndex, false, path)

        // exit handlers - run in reverse order
        runHandlers(this.currentRoutes, -1, 'exit', 'exitHandlers', routeDivergenceIndex)

        // change path
        this.currentRoutes.splice(routeDivergenceIndex) // remove the now-changed path segements

        // enter handlers - run in forward order
        this.currentRoutes = this.currentRoutes.concat(newRoutes)
        var succeeded = runNewRoutes(this.currentRoutes, routeDivergenceIndex)
        this.currentRoutes = this.currentRoutes.slice(0,succeeded) // clip off ones that failed

        this.currentPath = []
        for(var n=0; n<this.currentRoutes.length; n++) {
            this.currentPath = this.currentPath.concat(this.currentRoutes[n].route.pathSegment)
        }

        // emit event
        if(emit) {
            this.emit('go', getPathToOutput(this, this.currentPath))
        }
    }

    // sets up a transform function to transform paths before they are passed to `default` handlers and 'go' events
    this.transformPath = function(transform) {
        if(transform.toExternal === undefined || transform.toInternal === undefined) {
            throw new Error('Transforms must have both a toExternal function and toInternal function')
        }
        this.transform = transform
    }


    // transforms the path if necessary
    function getPathToOutput(that, path) {
        if(that.transform === undefined) {
            return path
        } else {
            return that.transform.toExternal(path)
        }
    }
    function getPathFromInput(that, path) {
        if(that.transform === undefined) {
            return path
        } else {
            return that.transform.toInternal(path)
        }
    }

    // run enter handlers in forwards order
    function runNewRoutes(routes, routeDivergenceIndex) {
        return runHandlers(routes, 1, 'enter', 'enterHandlers', routeDivergenceIndex)
    }

    // returns the number of elements matched if the path is matched by the route
    // returns undefined if it doesn't match
    // route is a Route object
    function match(pathSegment, path) {
        for(var n=0; n<pathSegment.length; n++) {
            var part = pathSegment[n]
            if(part === Router.param && path[n] !== undefined) {
                // matches anything
            } else if(part !== path[n]) {
                return undefined // no match
            }
        }

        return pathSegment.length // a match, must consume all of route.pathSegement (but not all of path)
    }

    // returns the first index of routes that matches the passed pathIndex
    function findRouteIndexFromPathIndex(routes, pathIndex) {
        for(var n=0; n<routes.length; n++) {
            if(routes[n].pathIndex === pathIndex) {
                return n
            }
        }
        // else
        return routes.length
    }

    // routes is the full list of currentRoutes
    // index is the route index where the error happened
    // stage is the stage the router was in when the error happened ('exit', 'enter', or 'route')
    // location is the relative pathSegment to where the error happened
    // e is the error that happened
    function handleError(routes, index, stage, e, location) {
        for(var n=index; n>=0; n--) {
            var route = routes[n].route
            if(route.errorHandler !== undefined) {
                try {
                    route.errorHandler(e, {stage: stage, location: location})
                    return
                } catch(e) {
                    if(index > 0) {
                        handleError(routes, n-1, stage, e, route.pathSegment)
                        return
                    } else {
                        throw e // ran out of error handlers
                    }
                }
            } else {
                location = route.pathSegment.concat(location)
            }
        }
        // else
        throw e
    }

    // returns a list of objects {route:route, pathIndex: x} where route matches piece of the pathSegment
    function traverseRoute(that, route, pathSegment, pathIndexOffset, isDefault, intendedPath) {

        var handlerParameters = []
        var matchingRouteInfo;
        for(var i=0; i<route.routes.length; i++) {
            var info = route.routes[i]

            var transformedPathSegment = getPathFromInput(that, info.pathSegment)
            if(!(transformedPathSegment instanceof Array))
                transformedPathSegment = [transformedPathSegment]

            var consumed = match(transformedPathSegment, pathSegment)
            if(consumed !== undefined) {
                matchingRouteInfo = {handler: info.handler, consumed: consumed, pathSegment: pathSegment.slice(0,consumed)}
                for(var n=0; n<transformedPathSegment.length; n++) {
                    if(transformedPathSegment[n] === Router.param) {
                        handlerParameters.push(pathSegment[n])
                    }
                }
                break;
            }
        }

        var nextIsDefault = false
        if(matchingRouteInfo === undefined) {
            if(pathSegment.length === 0) {
                return []; // done
            } else if(route.defaultHandler !== undefined) {
                matchingRouteInfo = {handler: route.defaultHandler, consumed: 0, pathSegment: pathSegment} // default handler doesn't consume any path, so it can have subroutes
                nextIsDefault = true
                handlerParameters.push(getPathToOutput(that, pathSegment))
            } else {
                if(isDefault) {
                    return []; // done
                } else {
                    throw new Error("No route matched path: "+JSON.stringify(getPathToOutput(that, intendedPath)))
                }
            }
        }

        var consumed = matchingRouteInfo.consumed
        var subroute = new Route(matchingRouteInfo.pathSegment)
        matchingRouteInfo.handler.apply(subroute, handlerParameters)

        var rest = traverseRoute(that, subroute, pathSegment.slice(consumed), pathIndexOffset+consumed, nextIsDefault)
        return [{route: subroute, pathIndex: pathIndexOffset}].concat(rest)
    }

    // type is the state - 'exit' or 'enter'
    // direction is 1 for forward (lower index to higher index), -1 for reverse (higher index to lower index)
    // handlerProperty is the property name of the list of appropriate handlers (either exitHandlers or enterHandlers)
    // routes is the ordered list of Route objects for path to process
    // returns the maximum depth that succeeded (without errors, duh)
    function runHandlers(currentRoutes, direction, type, handlerProperty, routeVergenceIndex) {
        var routes = currentRoutes.slice(routeVergenceIndex)
        if(direction === -1) {
            routes.reverse() // exit handlers are handled backwards
        }

        var routeInfo = routes.map(function(routeInfo, n) {
            // calculate the divergence/leaf distance - the number of routes between it and the recent path change
            var distance = routes.length - n
            if(direction === 1) {
                distance--
            }

            return {
                route: routeInfo.route,
                level: 0,
                lastValue: distance, // stores the last return value of a handler (initially contains the divergence/leaf distance)
                errorHappened: false // if an error happens, subsequent levels handlers should be prevented
            }
        })

        var maxDepthWithoutError = routeInfo.length-1
        var moreHandlers = true
        while(moreHandlers) {
            var moreHandlers = false // assume false until found otherwise
            for(var n=0; n<=maxDepthWithoutError; n++) {
                var info = routeInfo[n]
                var handlers = info.route[handlerProperty]

                if(handlers[info.level] !== undefined && !info.errorHappened) {
                    try {
                        info.lastValue = handlers[info.level](info.lastValue)
                    } catch(e) {
                        info.errorHappened = true
                        if(direction === -1) {
                            indexOfRouteErrorHappenedIn++
                            var indexOfRouteErrorHappenedIn = currentRoutes.length - n - 1
                        } else {
                            var indexOfRouteErrorHappenedIn = routeVergenceIndex+n
                            maxDepthWithoutError = n-1  // only clip off the ends in an error for enter handlers
                        }
                        handleError(currentRoutes, indexOfRouteErrorHappenedIn, type, e, [])
                    }
                }

                info.level++
                if(info.level < handlers.length) {
                    moreHandlers = true
                }
            }
        }

        if(direction === 1) { // note: right now this is incorrect if direction is reverse (-1), but the result for that isn't used... so i'm being lazy
            // call exit handlers of descendent routes who's ancestors had errors (but who didn't themselves)

            routeInfo.forEach(function(info) {
                info.level = 0 // reset level for exit handlers (don't reset whether an error happened tho)
            })

            var moreHandlers = true
            while(moreHandlers) {
                moreHandlers = false
                for(var n=routeInfo.length-1; n>maxDepthWithoutError; n--) {
                    var info = routeInfo[n]
                    var handlers = info.route.exitHandlers
                    if(handlers[info.level] !== undefined && !info.errorHappened) {
                        try {
                            info.lastValue = handlers[info.level](info.lastValue)
                        } catch(e) {
                            info.errorHappened = true
                            // no error reporting: the error that caused this in the first place should be fixed first
                        }
                    }

                    info.level++
                    if(info.level < handlers.length) {
                        moreHandlers = true
                    }
                }
            }

            return maxDepthWithoutError + routeVergenceIndex +1
        }
    }

})

var Route = proto(function() {

    this.init = function(pathSegment) {
        this.routes = []
        this.topLevel = false // can be set by something outside to enable that exception down there
        this.pathSegment = pathSegment
    }

    // these are only safe being static because they are always set, never mutated
    this.enterHandlers = []
    this.exitHandlers = []

    // sets up a sub-route - another piece of the path
    this.route = function(pathSegment, handler) {
        this.routes.push({pathSegment: pathSegment, handler: handler})
    }

    // handler gets one parameter: the new path
    // called if there's no matching route
    this.default = function(handler) {
        if(this.defaultHandler !== undefined) throw new Error("only one `default` call allowed per route")
        validateFunctionArgs(arguments)
        this.defaultHandler = handler
    }

    // sets up a list of enter handlers that are called when a path is being entered
    this.enter = function(/*handlers*/) {
        if(this.enterHandlers.length !== 0) throw new Error("only one `enter` call allowed per route")
        validateFunctionArgs(arguments)
        this.enterHandlers = arguments
    }

    // sets up a list of exit handlers that are called when a path is being exited
    this.exit = function(/*handlers*/) {
        if(this.topLevel) throw new Error("exit handlers can't be set up for the top-level router, because it never exits")
        if(this.exitHandlers.length !== 0) throw new Error("only one `exit` call allowed per route")
        validateFunctionArgs(arguments)
        this.exitHandlers = arguments
    }

    // sets up an error handler that gets called by handler(state, e) where
        // state is either 'enter', 'exit', or 'routing'
    this.error = function(handler) {
        if(this.errorHandler !== undefined) throw new Error("only one `error` call allowed per route")
        validateFunctionArgs(arguments)
        this.errorHandler = handler
    }

    // private

    function validateFunctionArgs(args) {
        for(var n=0; n<args.length; n++) {
            if(!(args[n] instanceof Function) && args[n] !== undefined)
                throw new Error("Passed handler "+(n+1)+" is not a function")
        }
    }
})