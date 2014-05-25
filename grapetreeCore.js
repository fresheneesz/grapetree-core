// based on ideas from https://github.com/QubitProducts/cherrytree

var EventEmitter = require('events').EventEmitter
var proto = require('proto')

var Router = module.exports = proto(EventEmitter, function() {

    // static

    this.param = {} // special value used to indicate a parameter in a route

    // routerDefinition should be a function that gets a Route object as its `this` context
    this.init = function(routerDefinition) {
        var route = Route()
        route.route([], function() {
            this.topLevel = true
            routerDefinition.call(this)
        })

        this.currentPath = [] // this is only the case to initialize
        this.currentRoutes = [{route:route, pathIndex: -1}]

        buildAndRunNewRoute.call(this, route, [], -1, 0)
    }

    // instance

    // switches to a new path, running all the exit and enter handlers appropriately
    // path - the path to change to
    // emit - (default true) if false, won't emit a 'go' event
    this.go = function(path, emit) {
        if(emit === undefined) emit = true
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

        // emit event
        if(emit) {
            this.emit('go', getPathToOutput(this, path))
        }

        var routeDivergenceIndex = findRouteIndexFromPathIndex(this.currentRoutes, divergenceIndex)

        // run exit handlers in reverse order
        runHandlers(this.currentRoutes, -1, 'exit', 'exitHandlers', routeDivergenceIndex)

        // change path
        this.currentRoutes.splice(routeDivergenceIndex) // remove the now-changed path segements
        this.currentPath = path

        var lastRoute = this.currentRoutes[routeDivergenceIndex-1].route
        var newPathSegment = path.slice(divergenceIndex)
        buildAndRunNewRoute.call(this, lastRoute, newPathSegment, divergenceIndex, routeDivergenceIndex)
    }

    // sets up a transform function to transform paths before they are passed to `default` handlers and 'go' events
    this.transformPath = function(transform) {
        this.transform = transform
    }


    // transforms the path if necessary
    function getPathToOutput(that, path) {
        if(that.transform === undefined) {
            return path
        } else {
            return that.transform(path)
        }
    }

    function buildAndRunNewRoute(lastRoute, newPathSegment, divergenceIndex, routeDivergenceIndex) {
        try {
            traverseRoute.call(this, lastRoute, newPathSegment, divergenceIndex, false)
        } catch(e) {
            if(e.message === 'noMatchedRoute') {
                e = new Error("No route matched path: "+JSON.stringify(path))
            }

            handleError(this.currentRoutes, this.currentRoutes.length-1, 'route', e)
        }

        // run enter handlers in forwards order
        runHandlers(this.currentRoutes, 1, 'enter', 'enterHandlers', routeDivergenceIndex)
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
    // state is the state the router was in when the error happened ('exit', 'enter', or 'route')
    // e is the error that happened
    function handleError(routes, index, state, e) {
        for(var n=index; n>=0; n--) {
            if(routes[n].route.errorHandler !== undefined) {
                try {
                    routes[n].route.errorHandler(state, e)
                    return
                } catch(e) {
                    if(index > 0) {
                        handleError(routes, index-1, state, e)
                        return
                    } else {
                        throw e // ran out of error handlers
                    }
                }
            }
        }
        // else
        throw e
    }

    // returns a list of objects {route:route, pathIndex: x} where route matches piece of the pathSegment
    function traverseRoute(route, pathSegment, pathIndexOffset, isDefault) {

        var handlerParameters = []
        var matchingRouteInfo;
        for(var i=0; i<route.routes.length; i++) {
            var info = route.routes[i]
            var consumed = match(info.pathSegment, pathSegment)
            if(consumed !== undefined) {
                matchingRouteInfo = {handler: info.handler, consumed: consumed}
                for(var n=0; n<info.pathSegment.length; n++) {
                    if(info.pathSegment[n] === Router.param) {
                        handlerParameters.push(pathSegment[n])
                    }
                }
                break;
            }
        }

        var nextIsDefault = false
        if(matchingRouteInfo === undefined) {
            if(pathSegment.length === 0) {
                return; // done
            } else if(route.defaultHandler !== undefined) {
                matchingRouteInfo = {handler: route.defaultHandler, consumed: 0} // default handler doesn't consume any path, so it can have subroutes
                nextIsDefault = true
                handlerParameters.push(getPathToOutput(this, this.currentPath))
            } else {
                if(isDefault) {
                    return; // done
                } else {
                    throw new Error("No route matched: "+pathSegment)
                }
            }
        }

        var consumed = matchingRouteInfo.consumed
        var subroute = new Route()
        matchingRouteInfo.handler.apply(subroute, handlerParameters)

        this.currentRoutes.push({route: subroute, pathIndex: pathIndexOffset})
        traverseRoute.call(this, subroute, pathSegment.slice(consumed), pathIndexOffset+consumed, nextIsDefault)
    }

    // type is the state - 'exit' or 'enter'
    // direction is 1 for forward (lower index to higher index), -1 for reverse (higher index to lower index)
    // handlerProperty is the property name of the list of appropriate handlers (either exitHandlers or enterHandlers)
    // routes is the ordered list of Route objects for path to process
    function runHandlers(currentRoutes, direction, type, handlerProperty, routeDivergenceIndex) {
        var routes = currentRoutes.slice(routeDivergenceIndex)
        if(direction === -1) {
            routes.reverse()
        }

        var routeInfo = routes.map(function(routeInfo) {
            return {
                route: routeInfo.route,
                level: 0,
                lastValue: undefined // stores the last return value of a handler
            }
        })

        var moreHandlers = true
        while(moreHandlers) {
            var moreHandlers = false // assume false until found otherwise
            for(var n=0; n<routeInfo.length; n++) { // exit handlers are handled backwards
                var info = routeInfo[n]
                var handlers = info.route[handlerProperty]

                if(handlers[info.level] !== undefined) {
                    try {
                        info.lastValue = handlers[info.level](info.lastValue)
                    } catch(e) {
                        handleError(currentRoutes, (n*direction)+routeDivergenceIndex, type, e)
                    }
                }

                info.level++
                if(info.level < handlers.length) {
                    moreHandlers = true
                }
            }
        }
    }

})

var Route = proto(function() {
    this.init = function() {
        this.routes = []
        this.topLevel = false // can be set by something outside to enable that exception down there
    }

    // these are only safe being static because they are always set, never mutated
    this.enterHandlers = []
    this.exitHandlers = []

    // sets up a sub-route - another piece of the path
    this.route = function(pathSegment, handler) {
        if(!(pathSegment instanceof Array)) {
            pathSegment = [pathSegment]
        }

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

    function validateFunctionArgs(args) {
        for(var n=0; n<args.length; n++) {
            if(!(args[n] instanceof Function) && args[n] !== undefined)
                throw new Error("Passed handler "+(n+1)+" is not a function")
        }
    }
})