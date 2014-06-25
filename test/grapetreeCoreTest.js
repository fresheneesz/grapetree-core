"use strict";

var Unit = require('deadunit')
var Future = require('async-future')

var testUtils = require('./testUtils')
var equal = testUtils.equal

var Router = require("../grapetreeCore")

Unit.test("grapetree core", function(t) {




    //*
    this.test('simple route', function(t) {
        this.count(5)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'enter1')},
                function() {t.eq(type, 'default')},
                function() {t.eq(type, 'goEvent')}
            )
        }

        var router = Router(function() { // root
            this.enter(function() {
                events('enter1')
            })

            this.default(function(path) {
                t.ok(equal(path, ['moo']), path)
                this.enter(function() {
                    events('default')
                })
            })
        })

        router.on('change', function(newPath) { // router is an EventEmitter
            events('goEvent')
            t.ok(equal(newPath, ['moo']), newPath)
        })

        router.go(['moo']).done()
    })

    this.test('nested routes', function(t) {
        this.count(16)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'enter')},
                function() {t.eq(type, 'a_enter')},
                function() {t.eq(type, 'defaultEnter')},
                function() {t.eq(type, 'defaultExit')},
                function() {t.eq(type, 'a_exit')},
                function() {t.eq(type, 'bbcat_enter')},
                function() {t.eq(type, 'bbbox_enter')},
                function() {t.eq(type, 'c_enter')},
                function() {t.eq(type, 'cboom_enter')}
            )
        }

        var router = Router(function() {
            this.enter(function() {
                events('enter')
            })

            this.route('aa', function() {
                this.enter(function(arg, leafDistance) {
                    events('a_enter')
                    t.eq(leafDistance, undefined)//0)
                })

                this.exit(function(arg, divergenceDistance) {
                    events('a_exit')
                    t.eq(divergenceDistance, 1)
                })

                this.default(function(pathSegment) {
                    t.ok(equal(pathSegment, ['moo']), pathSegment)

                    this.enter(function() {
                        events('defaultEnter')
                    })
                    this.exit(function(arg, divergenceDistance) {
                        t.eq(divergenceDistance, 2)
                        events('defaultExit')
                    })
                })
            })

            this.route(['bb','cat'], function() {   // routes can have multiple parts
                this.enter(function(arg, leafDistance) {
                    t.eq(leafDistance, undefined)//0)
                    events('bbcat_enter')
                })
            })
            this.route(['bb','box'], function() {
                this.enter(function() {
                    events('bbbox_enter')
                })
            })

            this.route('cc', function() {
                this.enter(function(arg, leafDistance) {
                    events('c_enter')
                    t.eq(leafDistance, undefined)//1)
                })

                this.route('boom', function() {
                    this.enter(function(arg, leafDistance) {
                        events('cboom_enter')
                        t.eq(leafDistance, undefined)//0)
                    })
                })
            })

        })

        router.go([]).then(function() { // going to where you are does nothing at all
            return router.go(['aa'])
        }).then(function() {
            return router.go(['aa']) // again: going to where you are does nothing at all
        }).then(function() {
            return router.go(['aa', 'moo'])
        }).then(function() {
            return router.go(['bb','cat'])
        }).then(function() {
            return router.go(['bb','box'])
        }).then(function() {
            return router.go(['cc','boom'])
        }).done()
    })

    this.test('parameters', function(t) {
        this.count(12)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'moo')},
                function() {t.eq(type, 'quack')},
                function() {t.eq(type, 'testAEnter')},
                function() {t.eq(type, 'test1')},
                function() {t.eq(type, 'testAExit')},
                function() {t.eq(type, 'testAEnter')},
                function() {t.eq(type, 'test2')},
                function() {t.eq(type, 'testAExit')},
                function() {t.eq(type, 'testB')}
            )
        }

        var router = Router(function() {
            this.route(['a',Router.param], function(param) {
                this.enter(function() {
                    events('testAEnter')
                    events(param)
                })
                this.exit(function() {
                    events('testAExit')
                })

                this.route('x', function() {

                })
            })
            this.route(['b','c',Router.param,Router.param,'d',Router.param], function(one, two, three) {  // parameters can be anywhere
                this.enter(function() {
                    events('testB')
                    t.eq(one,1)
                    t.ok(equal(two,['some','array']))
                    t.ok(equal(three,{an:'object'}))
                })
            })
            this.route(Router.param, function(param) { // parameters can be taken as standalone routes - they match anything
                this.enter(function() {
                    events(param)
                })
            })
        })

        // these match '{}'
        router.go(['moo']).done()
        router.go(['quack']).done()

        router.go(['a','test1', 'x']).done()
        router.go(['a','test2']).done()   // should trigger a's exit *and* enter handler
        router.go(['b','c',1,['some','array'],'d',{an:'object'}]).done() // any value can be used as parameters!
    })

    this.test('path transforms', function(t) {
        this.count(7)

        var sequence = testUtils.sequence()
        var router = Router(function() {
            this.route('x', function() {
                t.ok(true)

                this.route('y.z', function() {
                    t.ok(true)
                })
            })
            this.default(function(path) {
                t.ok(equal(path, "a.b.c"), path)
            })
        })

        router.on('change', function(newPath) {
            sequence(function() {
                t.ok(equal(newPath, "a.b.c"), newPath)
            }, function() {
                t.ok(equal(newPath, 'x'), newPath)
            }, function() {
                t.ok(equal(newPath, 'x.y.z'), newPath)
            }, function() {
                t.ok(false) // should never get here, the path doesn't change if that route doesn't exist
            })
        })

        // transforms the path for sending to the 'go' event and for the 'default'
        router.transformPath({
            toExternal: function(internalPath) {
                return internalPath.join('.')
            },
            toInternal: function(externalPath) {
                if(externalPath === '')
                    return []
                else
                    return externalPath.split('.')
            }
        })

        router.go('a.b.c').then(function() {
            return router.go('x')
        }).then(function() {
            return router.go('x.y.z')
        }).then(function() {
            return router.go('x.nonexistant.route').catch(function(e) {
                t.ok(e.message === 'No route matched path: "x.nonexistant.route"', e)
            })
        }).done()
    })

    this.test('silent path changes', function(t) {
        this.count(1)

        var router = Router(function() {
            this.route('a', function() {
                this.enter(function() {
                    t.ok(true)
                })
            })
        })

        router.on('change', function() {
            t.ok(false) // should never be hit
        })

        router.go(['a'],false) // false means to not emit the 'change' event
    })

    this.test('futures', function(t) {
        this.count(18)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'root_enter')},
                function() {t.eq(type, 'a_enter')},
                function() {t.eq(type, 'b_enter')},
                function() {t.eq(type, 'b_exit')},
                function() {t.eq(type, 'b_exit_finish')},
                function() {t.eq(type, 'b_enter')},
                function() {t.eq(type, 'b_exit')},
                function() {t.eq(type, 'b_exit_finish')},
                function() {t.eq(type, 'a_exit')},
                function() {t.eq(type, 'a_exit_finish')},
                function() {t.eq(type, 'x_enter')}
            )
        }

        var router = Router(function() {
            this.enter(function() {
                events('root_enter')
                return Future(1)
            })

            this.route('a', function() {
                this.enter(function(one) {
                    events('a_enter')
                    t.eq(one, 1)
                    return Future(2)
                })
                this.exit(function(one) {
                    events('a_exit')
                    t.eq(one, 1)
                    var f = new Future
                    setTimeout(function() {
                        events('a_exit_finish')
                        f.return()
                    },10)
                    return f
                })

                this.route('b', function() {
                    this.enter(function(two) {
                        events('b_enter')
                        t.eq(two, 2)   // should happen TWICE
                    })
                    this.exit(function(two) {
                        events('b_exit')
                        t.eq(two, 2)
                        var f = new Future
                        setTimeout(function() {
                            events('b_exit_finish')
                            f.return('ignored')
                        },10)
                        return f
                    })
                })
            })

            this.route('x', function() {
                this.enter(function(one) {
                    events('x_enter')
                    t.eq(one, 1)
                })
            })
        })

        router.go(['a','b']).then(function() {
            return router.go(['a'])
        }).then(function() {
            return router.go(['a','b'])
        }).then(function() {
            return router.go(['x'])
        }).done()

    })

    this.test('default handlers', function(t) {
        this.count(3)

        var n = 0
        var router = Router(function() {
            this.route('a', function() {
                this.route('b', function() {

                })
            })

            this.route('x', function() {

            })

            this.default(function(path) {
                this.enter(function() {
                    if(n===0) {
                        t.ok(equal(path, ['a', 'b', 'c', 'd']), path)
                    } else if(n===1) {
                        t.ok(equal(path, ['x', 'y']), path)
                    } else if(n===2) {
                        t.ok(equal(path, ['z']), path)
                    } else {
                        throw new Error("shouldn't get here")
                    }
                    n++
                })
            })
        })

        router.go(['a', 'b', 'c', 'd']).done()
        router.go(['x', 'y']).done()
        router.go(['z']).done()
    })

    this.test('redirects', function(t) {

        this.test('normal redirect', function(t) {
            this.count(8)

            var sequence = testUtils.sequence()
            function events(event) {
                sequence(
                    function() {t.eq(event, 'root')},
                    function() {t.eq(event, 'enter_a2')},
                    function() {t.ok(equal(event, ['a2']), event)},
                    function() {t.eq(event, 'enter_a1')},
                    function() {t.ok(equal(event, ['a1']), event)},
                    function() {t.eq(event, 'exit_a1')},
                    function() {t.eq(event, 'enter_a2')},
                    function() {t.ok(equal(event, []), event)}
                )
            }

            var router = Router(function() { // root
                this.redirect(['a2'], true)

                this.enter(function() {
                    events('root')
                })

                this.route('a1', function() {
                    this.enter(function() {
                        events('enter_a1')
                    })
                    this.exit(function() {
                        events('exit_a1')
                    })

                    this.route('b1', function() {
                        this.redirect(['a2'])

                        this.enter(function() {
                            t.ok(false) // shouldn't get here
                        })
                    })
                })

                this.route('a2', function() {
                    this.enter(function() {
                        events('enter_a2')
                    })
                })
            })

            router.on('change', function(newPath) {
                events(newPath)
            })

            router.go(['a1', 'b1']).done()
            router.go([]).done()            // should do nothing, because this redirects to the same place as the last one
            router.go(['a1', 'b1']).done()  // same thing ^

            router.go(['a1']).done()
            router.go([]).done()
        })

        this.test('redirect errors', function(t) {
            this.count(3)

            try {
                Router(function() { // root
                    this.redirect(['a'])
                    this.default(function() {})
                }).go([]).done()
            } catch(e) {
                this.eq(e.message, "this.redirect and this.default can't coexist")
            }

            try {
                Router(function() { // root
                    this.default(function() {})
                    this.redirect(['a'])
                }).go([]).done()
            } catch(e) {
                this.eq(e.message, "this.redirect and this.default can't coexist")
            }

            try {
                Router(function() { // root
                    this.redirect(['a'])
                    this.redirect(['a'])
                }).go([]).done()
            } catch(e) {
                this.eq(e.message, "only one `redirect` call allowed per route")
            }
        })
    })

    this.test('errors', function(t) {
        this.count(4)

        this.test('simple errors', function(t) {
            this.count(8)

            Router(function() {
                try {
                    this.exit(function() {})
                } catch(e) {
                    t.eq(e.message, "exit handlers can't be set up for the top-level router, because it never exits")
                }
            })

            var r = Router(function() {
                this.route('a', function() {
                    t.ok(true)
                })
                this.route('a', function(){
                    t.ok(false) // only the first matching route is used - duplicate routes are ignored
                })
                this.route(['a','b','c'], function(){
                    t.ok(false) // again: only the first matching route is used
                })
            })

            r.go(['a']).done()

            r.go('a').catch(function(e) {
                t.eq(e.message, "A route passed to `go` must be an array")
            }).done()

            var r = Router(function() {
                this.enter(function() {
                    throw new Error('some error')
                })
            })

            r.go([]).catch(function(e) {
                t.eq(e.message, 'some error')
            }).done()

            var r1 = Router(function() {
                this.route('a', function() {
                    this.enter(function() {
                        throw new Error('another error')
                    })
                })
            })


            r1.go(['a']).catch(function(e) {
                t.eq(e.message, 'another error') // routers with no error handler throw the error from the call to `go`
            }).done()


            var sequence = testUtils.sequence()
            var r2 = Router(function() {
                this.enter(function() {
                    throw new Error('enter')
                })
                this.default(function() {
                    this.enter(function() {
                        throw new Error('default')
                    })
                })

                this.error(function(e, info) {
                    t.eq(info.stage,'enter')
                    sequence(function() {
                        t.eq(e.message,'enter')
                    }, function() {
                        t.eq(e.message,'default')
                    })
                })
            })

            r2.go(['nonexistent']).done()
        })

        this.test('nested errors', function(t) {
            this.count(10)

            var mainSequence = testUtils.sequence()
            var r = Router(function() {
                this.route('a', function() {
                    this.enter(function() {
                        throw new Error('enter')
                    })
                })

                this.route('b', function() {
                    this.enter(function() {
                        throw new Error('bError')
                    })
                    this.error(function(e, info) {
                        t.eq(e.message, 'bError')
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,[]), info.location)
                        throw e
                    })
                })

                this.error(function(e, info) {
                    mainSequence(function() {
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,['a']), info.location)
                        t.eq(e.message,'enter')
                    }, function() {
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,['b']))
                        t.eq(e.message,'bError')
                    })
                })
            })

            r.go(['a']).done()
            r.go(['b']).done()

            var r2 = Router(function() {
                this.route('a', function() {
                    throw new Error("routing error")
                })
            })

            r2.go(['a']).catch(function(e) {
                t.eq(e.message, "routing error")
            }).done()

        })

        this.test('nested errors with futures', function(t) {
            this.count(9)

            var mainSequence = testUtils.sequence()
            var r = Router(function() {
                this.route('a', function() {
                    this.enter(function() {
                        var f = new Future
                        f.throw(new Error('enter'))
                        return f
                    })
                })

                this.route('b', function() {
                    this.enter(function() {
                        var f = new Future
                        f.throw(new Error('bError'))
                        return f
                    })
                    this.error(function(e, info) {
                        t.eq(e.message, 'bError')
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,[]), info.location)

                        var f = new Future
                        f.throw(e)
                        return f
                    })
                })

                this.error(function(e, info) {
                    mainSequence(function() {
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,['a']), info.location)
                        t.eq(e.message,'enter')
                    }, function() {
                        t.eq(info.stage,'enter')
                        t.ok(equal(info.location,['b']))
                        t.eq(e.message,'bError')
                    })
                })
            })

            r.go(['a']).then(function() {
                return r.go(['b'])
            }).done()

        })

        this.test('router state on error', function(t) {
            this.count(5)

            // routing
            // routing errors (errors stop progress)
            // exit handler
            // error handlers for exit state (errors do not stop progress of parents)
            // enter handlers
            // error handlers for enter state (errors do not stop progress of parents)

            this.test('routing errors', function(t) {
                this.count(2)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(false)
                        })

                        this.route('b', function() {
                            this.enter(function() {
                                t.ok(true)
                            })
                            this.exit(function() {
                                t.ok(false)
                            })
                        })
                    })
                    this.route('c', function() {
                        this.enter(function() {
                            t.ok(false)
                        })
                        this.error(function() {
                            t.ok(false) // error handlers are not called for routing errors
                        })

                        this.route('d', function() {
                            this.enter(function() {
                                t.ok(false)
                            })

                            this.error(function() {
                                t.ok(false) // error handlers are not called for routing errors
                            })

                            throw 'error1'
                        })
                    })
                })

                r.go(['a','b']).done() // should work fine

                r.on('change', function() {
                    t.ok(false) // this event shouldn't happen if there's a routing error
                })

                r.go(['c','d']).catch(function(e) {
                    t.eq(e,'error1')
                }).done()
            })

            this.test("route catches its own error", function(t) {
                this.count(11)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            })
                            this.route('c', function() {
                                this.enter(function() {
                                    t.ok(true) // get here
                                })
                                this.exit(function() {
                                    throw new Error('exitError')
                                })
                                this.error(function(e, info) {
                                    t.eq(e.message, 'exitError')
                                    t.ok(equal(info, {stage: 'exit', location: []})) // location: [] indicates the error happend in the current route
                                })

                                this.route('subc', function() {
                                    this.enter(function() {
                                        t.ok(true) // no error
                                    })
                                })
                            })
                        })
                    })

                    this.route('d', function() {
                        this.enter(function() {
                            t.ok(true) // gets here
                        })

                        this.route('e', function() {
                            this.enter(function() {
                                t.ok(true)  // gets here
                            })
                            this.route('f', function() {
                                this.enter(function() {
                                    throw 'enterError'
                                })
                                this.error(function(e, info) {
                                    t.eq(e, 'enterError')
                                    t.ok(equal(info, {stage: 'enter', location: []}))
                                })

                                this.route('g', function() {
                                    this.enter(function() {
                                        t.ok(false)
                                    })
                                    this.exit(function() {
                                        t.ok(false)
                                    })
                                })
                            })
                        })
                    })
                })

                r.go(['a','b','c', 'subc']).done() // should work fine

                r.on('change', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e', 'f']), newPath) // didn't quite get through the whole path, but the event does *not* reflect that
                })

                r.go(['d','e','f']).done()
            })

            this.test("route's parent catches error", function(t){
                this.count(12)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            })
                            this.error(function(e, info) {
                                t.eq(e, 'exitError')
                                t.ok(equal(info, {stage: 'exit', location: ['c']}))
                            })

                            this.route('c', function() {
                                this.enter(function() {
                                    t.ok(true) // get here
                                })
                                this.exit(function() {
                                    throw 'exitError'
                                })

                                this.route('subc', function() {
                                    this.enter(function() {
                                        t.ok(true) // no error
                                    })
                                    this.exit(function() {
                                        t.ok(true) // no error
                                    })
                                })
                            })
                        })
                    })

                    this.route('d', function() {
                        this.enter(function() {
                            t.ok(true) // gets here
                        })

                        this.route('e', function() {
                            this.enter(function() {
                                t.ok(true)  // gets here
                            })

                            this.error(function(e, info) {
                                t.eq(e, 'enterError')
                                t.ok(equal(info, {stage: 'enter', location: ['f']}))
                            })

                            this.route('f', function() {
                                this.enter(function() {
                                    throw 'enterError'
                                })

                                this.route('g', function() {
                                    this.enter(function() {
                                        t.ok(false)
                                    })
                                })
                            })
                        })
                    })
                })

                r.go(['a','b','c', 'subc']).done() // should work fine

                r.on('change', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e', 'f']), newPath) // didn't quite get through the whole path, but the event does *not* reflect that
                })

                r.go(['d','e','f']).done()
            })

            this.test("route's parent bubbles error to its parent", function(t){
                this.count(12)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })
                        this.error(function(e, info) {
                            t.eq(e, 'exitError')
                            t.ok(equal(info, {stage: 'exit', location: ['b','c']}))
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            })

                            this.route('c', function() {
                                this.enter(function() {
                                    t.ok(true) // get here
                                })
                                this.exit(function() {
                                    throw 'exitError'
                                })

                                this.route('subc', function() {
                                    this.enter(function() {
                                        t.ok(true) // no error
                                    })
                                    this.exit(function() {
                                        t.ok(true) // no error
                                    })
                                })
                            })
                        })
                    })

                    this.route('d', function() {
                        this.enter(function() {
                            t.ok(true) // gets here
                        })
                        this.error(function(e, info) {
                            t.eq(e, 'enterError')
                            t.ok(equal(info, {stage: 'enter', location: ['e','f']}))
                        })

                        this.route('e', function() {
                            this.enter(function() {
                                t.ok(true)  // gets here
                            })
                            this.exit(function() {
                                t.ok(false)
                            })

                            this.route('f', function() {
                                this.enter(function() {
                                    throw 'enterError'
                                })

                                this.route('g', function() {
                                    this.enter(function() {
                                        t.ok(false)
                                    })
                                })
                            })
                        })
                    })
                })

                r.go(['a','b','c','subc']).done() // should work fine

                r.on('change', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e', 'f']), newPath) // didn't quite get through the whole path, but the event does *not* reflect that
                })

                r.go(['d','e','f']).done()
            })

            this.test("route's parent error handler throws to its parent", function(t){
                this.count(16)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })
                        this.error(function(e, info) {
                            t.eq(e, 'errorError')
                            t.ok(equal(info, {stage: 'exit', location: ['b']}))
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            })
                            this.error(function(e,info) {
                                t.eq(e, 'exitError')
                                t.ok(equal(info, {stage: 'exit', location: ['c']}))
                                throw "errorError"
                            })

                            this.route('c', function() {
                                this.enter(function() {
                                    t.ok(true) // get here
                                })
                                this.exit(function() {
                                    throw 'exitError'
                                })

                                this.route('subc', function() {
                                    this.enter(function() {
                                        t.ok(true) // no error
                                    })
                                    this.exit(function() {
                                        t.ok(true) // no error
                                    })
                                })
                            })
                        })
                    })

                    this.route('d', function() {
                        this.enter(function() {
                            t.ok(true) // gets here
                        })
                        this.error(function(e, info) {
                            t.eq(e, 'errorError2')
                            t.ok(equal(info, {stage: 'enter', location: ['e']}))
                        })

                        this.route('e', function() {
                            this.enter(function() {
                                t.ok(true)  // gets here
                            })
                            this.exit(function() {
                                t.ok(false)
                            })
                            this.error(function(e,info) {
                                t.eq(e, 'enterError')
                                t.ok(equal(info, {stage: 'enter', location: ['f']}))
                                throw "errorError2"
                            })

                            this.route('f', function() {
                                this.enter(function() {
                                    throw 'enterError'
                                })

                                this.route('g', function() {
                                    this.enter(function() {
                                        t.ok(false)
                                    })
                                })
                            })
                        })
                    })
                })

                r.go(['a','b','c','subc']).done() // should work fine

                r.on('change', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e', 'f'])) // didn't quite get through the whole path, but the event does *not* reflect that
                })

                r.go(['d','e','f']).done()
            })
        })
    })

    this.test('former bugs', function() {
        this.test('some bug i forgot about', function(t) {
            this.count(1)
            var r = Router(function() {
                this.route('aa', function() {
                })
            })

            r.go(['aa','xx']).catch(function(e) {
                t.eq(e.message, 'No route matched path: ["aa","xx"]')
            }).done()

        })
    })

    //*/


}).writeConsole(200)



