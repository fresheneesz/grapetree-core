// based on ideas from https://github.com/QubitProducts/cherrytree

var EventEmitter = require('events').EventEmitter
var proto = require('proto')
var Future = require("async-future")

var Router = module.exports = proto(EventEmitter, function() {

    // static

    this.param = {} // special value used to indicate a parameter in a route

    // routerDefinition should be a function that gets a Route object as its `this` context
    this.init = function(routerDefinition) {
        this.routerDefinition = routerDefinition
    }

    // instance

    // switches to a new path, running all the exit and enter handlers appropriately
    // pathArgument - the path to change to
    // emit - (default true) if false, won't emit a 'go' event
    // returns a future that resolves when the route-change has completed
    this.go = function(pathArgument, emit) {
        var that = this

        if(this.routeChangeInProgress) {
            throw new Error("Route change already in progress, wait on the future returned from `go` before changing routes")
        }

        if(this.afterInit === undefined) {
            var route = Route([])
            route.route(getPathToOutput(that, []), function() {
                this.topLevel = true
                that.routerDefinition.call(this)
            })

            this.currentPath = [] // this is only the case to initialize
            this.currentRoutes = [{route:route, pathIndexes: {start:-1, end:-1}}]

            var newRoutes = traverseRoute(this, route, [], -1, [])
            if(newRoutes ===  undefined) {
                throw new Error("No route matched path: "+JSON.stringify(getPathToOutput(this, pathArgument)))
            }

            this.currentRoutes = this.currentRoutes.concat(newRoutes)
            this.routeChangeInProgress = true
            this.afterInit = runNewRoutes(this.currentRoutes, 0)
        }

        return this.afterInit.then(function() {
            if(emit === undefined) emit = true

            var path = getPathFromInput(that, pathArgument)
            if(!(path instanceof Array)) {
                throw new Error("A route passed to `go` must be an array")
            }

            var info = getNewRouteInfo(that, path, path)
            if(info === undefined) {
                return Future(undefined); // do nothing if paths are the same
            }

            var newRoutes = info.newRoutes
            var routeDivergenceIndex = info.divergenceIndex
            var pathToEmit = info.pathToEmit

            that.routeChangeInProgress = true

            // exit handlers - run in reverse order
            return runHandlers(that.currentRoutes, -1, 'exit', 'exitHandler', routeDivergenceIndex).then(function() {
                // change path
                that.currentRoutes.splice(routeDivergenceIndex) // remove the now-changed path segments

                // enter handlers - run in forward order
                that.currentRoutes = that.currentRoutes.concat(newRoutes)
                return runNewRoutes(that.currentRoutes, routeDivergenceIndex).then(function(succeeded) {
                    that.currentRoutes = that.currentRoutes.slice(0,succeeded) // clip off ones that failed

                    that.currentPath = []
                    for(var n=0; n<that.currentRoutes.length; n++) {
                        that.currentPath = that.currentPath.concat(that.currentRoutes[n].route.pathSegment)
                    }

                    // emit event
                    if(emit) {
                        that.emit('change', getPathToOutput(that, pathToEmit))
                    }
                })
            })
        }).finally(function() {
            that.routeChangeInProgress = false
        })
    }

    // returns an object with the properties
        // newRoutes - an array of Route objects; the list of new routes to enter
        // divergenceIndex - the route divergence index
        // pathToEmit - the path to use when emitting the 'change' event
    // or
        // undefined - if the paths are the same
    function getNewRouteInfo(that, path, pathToEmit) {
        var indexes = getDivergenceIndexes(that.currentPath, path, that.currentRoutes)
            if(indexes === undefined) {
                return undefined
            }

        var routeDivergenceIndex = indexes.routeIndex
        var pathDivergenceIndex = indexes.pathIndex
        var lastRoute = that.currentRoutes[routeDivergenceIndex-1].route
        var newPathSegment = path.slice(pathDivergenceIndex)

        // routing
        var newRoutes = traverseRoute(that, lastRoute, newPathSegment, pathDivergenceIndex, path)
        if(newRoutes ===  undefined) {
            throw new Error("No route matched path: "+JSON.stringify(getPathToOutput(that, path)))
        } else {
            if(newRoutes.length > 0) {
                var redirectInfo = newRoutes[newRoutes.length-1].route.redirectInfo
            } else {
                var redirectInfo = that.currentRoutes[routeDivergenceIndex-1].route.redirectInfo
            }

            if(redirectInfo !== undefined) {
                var newPathToEmit = redirectInfo.path
                if(redirectInfo.emitOldPath)
                    newPathToEmit = path

                var newPath = getPathFromInput(that, redirectInfo.path)
                if(!(newPath instanceof Array)) {
                    throw new Error("A route passed to `redirect` must be an array")
                }

                return getNewRouteInfo(that, newPath, newPathToEmit)
            }
        }

        return {newRoutes: newRoutes, divergenceIndex: routeDivergenceIndex, pathToEmit: pathToEmit}
    }

    // returns an object with the properties:
        // routeIndex - the route divergence index (the index of currentRoute at which the paths diverge)
        // pathIndex - the index of the currentPath at which the paths diverge
    // or
        // undefined - if the paths are the same
    function getDivergenceIndexes(currentPath, newPath, routes) {
        // find where path differs
        var divergenceIndex // the index at which the paths diverge
        for(var n=0; n<currentPath.length; n++) {
            if(currentPath[n] !== newPath[n]) {
                divergenceIndex = n
                break;
            }
        }
        if(divergenceIndex === undefined && newPath.length > currentPath.length) {
            divergenceIndex = currentPath.length
        }

        if(divergenceIndex === undefined)
            return undefined

        return routeAndCorrectedPathIndexes(routes, divergenceIndex)
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
        return runHandlers(routes, 1, 'enter', 'enterHandler', routeDivergenceIndex)
    }

    // returns the number of elements matched if the path is matched by the route
    // returns undefined if it doesn't match
    // pathSegment is the path segment a route applies to (will contain a subset of path if match returns true)
    // path is the remainder of the path being matched to
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

    // returns an object with the members:
        // routeIndex - the first index of routes that matches the passed pathIndex
        // pathIndex - the path index corrected for where the beggining of the divergence route is
    function routeAndCorrectedPathIndexes(routes, pathIndex) {
        for(var n=0; n<routes.length; n++) {
            var pathIndexes = routes[n].pathIndexes
            if(pathIndexes.start <= pathIndex && pathIndex <= pathIndexes.end ) {
                return {routeIndex: n, pathIndex: pathIndexes.start}
            }
        }
        // else
        return {routeIndex: routes.length, pathIndex: pathIndex}
    }

    // routes is the full list of currentRoutes
    // index is the route index where the error happened
    // stage is the stage the router was in when the error happened ('exit', 'enter', or 'route')
    // location is the relative pathSegment to where the error happened
    // e is the error that happened
    function handleError(routes, index, stage, e, location) {

        return loopThroughErrorHandlers(location, index)


        function loopThroughErrorHandlers(location, n) {
            if(n >= 0) {
                var route = routes[n].route
                if(route.errorHandler !== undefined) {
                    try {
                        var result = route.errorHandler(e, {stage: stage, location: location})
                    } catch(e) {
                        var result = new Future
                        result.throw(e)
                    }

                    if(result === undefined) {
                        result = Future(undefined)
                    }

                    return result.catch(function(e) {
                        if(index > 0) {
                            return handleError(routes, n-1, stage, e, route.pathSegment)
                        } else {
                            throw e // ran out of error handlers
                        }
                    })
                } else {
                    return loopThroughErrorHandlers(route.pathSegment.concat(location), n-1)
                }
            } else {
                var f = new Future
                f.throw(e)
                return f
            }
        }
    }

    // returns a list of objects {route:route, pathIndexes: {start:_, end:_} where route matches piece of the pathSegment
    function traverseRoute(that, route, pathSegment, pathIndexOffset, intendedPath) {

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

        var runningDefault = false
        if(matchingRouteInfo === undefined) {
            if(pathSegment.length === 0) {
                return []; // done
            } else if(route.defaultHandler !== undefined) {
                getMatchingInfoForDefault()
            } else {
                return undefined // no default and no match!
            }
        }

        var consumed = matchingRouteInfo.consumed
        var subroute = new Route(matchingRouteInfo.pathSegment)
        matchingRouteInfo.handler.apply(subroute, handlerParameters)

        if(runningDefault) {
            var rest = []
        } else {
            var rest = traverseRoute(that, subroute, pathSegment.slice(consumed), pathIndexOffset+consumed, intendedPath)
        }

        if(rest === undefined) {
            // since there wasn't a full match in the child route, do the default route

            if(route.defaultHandler !== undefined) {
                getMatchingInfoForDefault()
                consumed = matchingRouteInfo.consumed
                subroute = new Route(matchingRouteInfo.pathSegment)
                matchingRouteInfo.handler.apply(subroute, handlerParameters)
                rest = []
            } else {
                return undefined // no default and no match!
            }
        }

        var pathIndexEnd = pathIndexOffset+consumed
        if(consumed !== 0) {
            pathIndexEnd--
        }
        return [{route: subroute, pathIndexes: {start:pathIndexOffset, end: pathIndexEnd}}].concat(rest)


        function getMatchingInfoForDefault() {
            matchingRouteInfo = {handler: route.defaultHandler, consumed: pathSegment.length, pathSegment: pathSegment} // default handler consume the whole path - can't have subroutes
            runningDefault = true
            handlerParameters.push(getPathToOutput(that, pathSegment))
        }
    }

    // type is the state - 'exit' or 'enter'
    // direction is 1 for forward (lower index to higher index), -1 for reverse (higher index to lower index)
    // handlerProperty is the property name of the list of appropriate handlers (either exitHandler or enterHandler)
    // routes is the ordered list of Route objects for path to process
    // returns a future that resolves to the maximum depth that succeeded (without errors, duh)
    function runHandlers(currentRoutes, direction, type, handlerProperty, routeVergenceIndex) {
        var routes = currentRoutes.slice(routeVergenceIndex)
        if(direction === -1) {
            routes.reverse() // exit handlers are handled backwards
        }

        return loopThroughHandlers(Future(undefined), 0) // start at 0


        // returns a future that resolves to the maximum depth that succeeded, or undefined if everything succeeded
        function loopThroughHandlers(lastFuture, n) {
            if(n < routes.length) {
                var route = routes[n].route
                var handler = route[handlerProperty]

                if(direction === -1) {
                    var originalIndexFromCurrentRoutes = currentRoutes.length - n - 1
                    var distance = routes.length - n        // divergenceDistance
                } else {
                    var originalIndexFromCurrentRoutes = routeVergenceIndex+n
                    var distance = undefined                // no more leafDistance: routes.length - n - 1    // leafDistance
                }

                return lastFuture.then(function() {
                    if(handler !== undefined) {
                        if(originalIndexFromCurrentRoutes > 0) {
                            var parentRoute = currentRoutes[originalIndexFromCurrentRoutes-1]
                            var lastValue = parentRoute.route.lastValue
                        }

                        var nextFuture = handler.call(route, lastValue, distance)
                        if(nextFuture !== undefined) {
                            nextFuture.then(function(value) {
                                route.lastValue = value
                            }) // no done because nextFuture's errors are handled elsewhere
                        }
                    }

                    if(nextFuture === undefined) {
                        nextFuture = Future(undefined)
                    }

                    return loopThroughHandlers(nextFuture, n+1)

                }).catch(function(e){
                    return handleError(currentRoutes, originalIndexFromCurrentRoutes, type, e, []).then(function() {
                        if(direction === 1) {
                            return Future(n+routeVergenceIndex)
                        } else { // -1 exit handlers
                            return loopThroughHandlers(Future(undefined), n+1)  // continue executing the parent exit handlers
                        }
                    })
                })
            } else {
                return lastFuture.then(function() {
                    return undefined
                }).catch(function(e) {
                    throw e // propagate the error not the value
                })
            }
        }
    }

})

module.exports.Future = Future // expose the Future library for convenience

var Route = proto(function() {

    this.init = function(pathSegment) {
        this.routes = []
        this.topLevel = false // can be set by something outside to enable that exception down there
        this.pathSegment = pathSegment
    }

    this.enterHandler
    this.exitHandler

    // sets up a sub-route - another piece of the path
    this.route = function(pathSegment, handler) {
        this.routes.push({pathSegment: pathSegment, handler: handler})
    }

    // handler gets one parameter: the new path
    // called if there's no matching route
    this.default = function(handler) {
        if(this.defaultHandler !== undefined) throw new Error("only one `default` call allowed per route")
        if(this.redirectInfo !== undefined) redirectDefaultCoexistError()
        validateFunctionArgs(arguments)
        this.defaultHandler = handler
    }

    this.redirect = function(newPath, emitOldPath) {
        if(this.redirectInfo !== undefined) throw new Error("only one `redirect` call allowed per route")
        if(this.defaultHandler !== undefined) redirectDefaultCoexistError()

        this.redirectInfo = {path: newPath, emitOldPath: emitOldPath}
    }

    // sets up a list of enter handlers that are called when a path is being entered
    this.enter = function(enterHandler) {
        if(this.enterHandler !== undefined) throw new Error("only one `enter` call allowed per route")
        validateFunctionArgs(arguments)
        this.enterHandler = enterHandler
    }

    // sets up a list of exit handlers that are called when a path is being exited
    this.exit = function(exitHandler) {
        if(this.topLevel) throw new Error("exit handlers can't be set up for the top-level router, because it never exits")
        if(this.exitHandler !== undefined) throw new Error("only one `exit` call allowed per route")
        validateFunctionArgs(arguments)
        this.exitHandler = exitHandler
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

function redirectDefaultCoexistError() {
    throw new Error("this.redirect and this.default can't coexist")
}