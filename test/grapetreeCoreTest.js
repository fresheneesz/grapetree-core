"use strict";

var Unit = require('deadunit')
var testUtils = require('./testUtils')
var equal = testUtils.equal

var Router = require("../grapetreeCore")

Unit.test("treeRouter", function(t) {



    //*
    this.test('simple route', function(t) {
        this.count(6)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'enter1')},
                function() {t.eq(type, 'enter2')},
                function() {t.eq(type, 'default')},
                function() {t.eq(type, 'goEvent')}
            )
        }

        var router = Router(function() { // root
            this.enter(function() {
                events('enter1')
            }, function() {
                events('enter2')
            })

            this.default(function(path) {
                t.ok(equal(path, ['moo']), path)
                this.enter(function() {
                    events('default')
                })
            })
        })

        router.on('go', function(newPath) { // router is an EventEmitter
            events('goEvent')
            t.ok(equal(newPath, ['moo']), newPath)
        })

        router.go(['moo'])
    })

    this.test('nested routes', function(t) {
        this.count(26)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'enter1')},
                function() {t.eq(type, 'enter2')},
                function() {t.eq(type, 'a_enter1')},
                function() {t.eq(type, 'a_enter2')},
                function() {t.eq(type, 'a_enter3')},
                function() {t.eq(type, 'defaultEnter')},
                function() {t.eq(type, 'defaultExit')},
                function() {t.eq(type, 'a_exit1')},
                function() {t.eq(type, 'a_exit2')},
                function() {t.eq(type, 'a_exit3')},
                function() {t.eq(type, 'b_enter')},
                function() {t.eq(type, 'c_enter1')},
                function() {t.eq(type, 'cboom_enter1')},
                function() {t.eq(type, 'c_enter2')},
                function() {t.eq(type, 'cboom_enter2')}
            )
        }

        var router = Router(function() {
            this.enter(function() {
                events('enter1')
            }, function() {
                events('enter2')
            })

            this.route('aa', function() {
                this.enter(function(leafDistance) {
                    events('a_enter1')
                    t.eq(leafDistance, 0)
                    return 1
                }, function(one) {
                    t.eq(one,1)
                    events('a_enter2')
                    return 2
                }, function(two) {
                    t.eq(two,2)
                    events('a_enter3')
                })

                this.exit(function(divergenceDistance) {
                    events('a_exit1')
                    t.eq(divergenceDistance, 1)
                    return 1
                }, function(one) {
                    events('a_exit2')
                    t.eq(one,1)
                    return 2
                }, function(two) {
                    t.eq(two,2)
                    events('a_exit3')
                })

                this.default(function(pathSegment) {
                    t.ok(equal(pathSegment, ['moo']), pathSegment)

                    this.enter(function() {
                        events('defaultEnter')
                    })
                    this.exit(function(divergenceDistance) {
                        t.eq(divergenceDistance, 2)
                        events('defaultExit')
                    })
                })
            })

            this.route(['bb','cat'], function() {   // routes can have multiple parts
                this.enter(function(leafDistance) {
                    t.eq(leafDistance, 0)
                    events('b_enter')
                })
            })

            this.route('cc', function() {
                this.enter(function(leafDistance) {
                    events('c_enter1')
                    t.eq(leafDistance, 1)
                }, function() {
                    events('c_enter2')
                })

                this.route('boom', function() {
                    this.enter(function(leafDistance) {
                        events('cboom_enter1')
                        t.eq(leafDistance, 0)
                    },
                    undefined,
                    function() {
                        events('cboom_enter2')
                    })
                })
            })

        })

        router.go([]) // going to where you are does nothing at all
        router.go(['aa'])
        router.go(['aa']) // again: going to where you are does nothing at all
        router.go(['aa', 'moo'])
        router.go(['bb','cat'])
        router.go(['cc','boom'])
    })

    this.test('parameters', function(t) {
        this.count(8)

        var sequence = testUtils.sequence()
        function events(type) {
            sequence(
                function() {t.eq(type, 'moo')},
                function() {t.eq(type, 'quack')},
                function() {t.eq(type, 'testA')},
                function() {t.eq(type, 'testB')}
            )
        }

        var router = Router(function() {
            this.route(['a',Router.param], function(param) {
                events('testA')
                t.eq(param, 'test')

                this.route('x', function() {

                })
            })
            this.route(['b','c',Router.param,Router.param,'d',Router.param], function(one, two, three) {  // parameters can be anywhere
                events('testB')
                t.eq(one,1)
                t.ok(equal(two,['some','array']))
                t.ok(equal(three,{an:'object'}))
            })
            this.route(Router.param, function(param) { // parameters can be taken as standalone routes - they match anything
                events(param)
            })
        })

        // these match '{}'
        router.go(['moo'])
        router.go(['quack'])

        router.go(['a','test', 'x'])
        router.go(['b','c',1,['some','array'],'d',{an:'object'}]) // any value can be used as parameters!
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

        router.on('go', function(newPath) {
            sequence(function() {
                t.ok(equal(newPath, "a.b.c"), newPath)
            }, function() {
                t.ok(equal(newPath, 'x'), newPath)
            }, function() {
                t.ok(equal(newPath, 'x.y.z'), newPath)
            }, function() {
                t.ok(equal(newPath, 'x.nonexistant.route'), newPath)
            })
        })

        // transforms the path for sending to the 'go' event and for the 'default'
        router.transformPath({
            toExternal: function(internalPath) {
                return internalPath.join('.')
            },
            toInternal: function(externalPath) {
                return externalPath.split('.')
            }
        })

        router.go('a.b.c')
        router.go('x')
        router.go('x.y.z')

        try {
            router.go('x.nonexistant.route')
        } catch(e) {
            this.ok(e.message === 'No route matched path: "x.nonexistant.route"', e)
        }
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

        router.on('go', function() {
            t.ok(false) // should never be hit
        })

        router.go(['a'],false) // false means to not emit the 'go' event
    })

    this.test('errors', function(t) {
        this.count(6)

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

        r.go(['a'])

        try {
            r.go('a')
        } catch(e) {
            t.eq(e.message, "A route passed to `go` must be an array")
        }

        this.test('simple errors', function(t) {
            this.count(6)

            try {
                Router(function() {
                    this.enter(function() {
                        throw new Error('some error')
                    })
                })
            } catch(e) {
                t.eq(e.message, 'some error')
            }

            var r1 = Router(function() {
                this.route('a', function() {
                    this.enter(function() {
                        throw new Error('another error')
                    })
                })
            })

            try {
                r1.go(['a'])
            } catch(e) {
                this.eq(e.message, 'another error') // routers with no error handler throw the error from the call to `go`
            }


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

            r2.go(['nonexistent'])
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

            r.go(['a'])
            r.go(['b'])

            var r2 = Router(function() {
                this.route('a', function() {
                    throw new Error("routing error")
                })
            })

            try {
                r2.go(['a'])
            } catch(e) {
                t.eq(e.message, "routing error")
            }

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

                r.go(['a','b']) // should work fine

                r.on('go', function() {
                    t.ok(false) // this event shouldn't happen if there's a routing error
                })

                try {
                    r.go(['c','d'])
                } catch(e) {
                    this.eq(e,'error1')
                }
            })

            this.test("route catches its own error", function(t) {
                this.count(13)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            }, function() {
                                t.ok(true)  // shouldn't be prevented
                            })
                            this.route('c', function() {
                                this.enter(function() {
                                    t.ok(true) // get here
                                })
                                this.exit(function() {
                                    throw new Error('exitError')
                                }, function() {
                                    t.ok(false) // shouldn't get here after an error happened in the level before it
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
                            }, function() {
                                t.ok(true)  // shouldn't be prevented
                            })
                            this.route('f', function() {
                                this.enter(function() {
                                    throw 'enterError'
                                }, function() {
                                    t.ok(false) // shouldn't get here after an error happened in the level before it
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

                r.go(['a','b','c', 'subc']) // should work fine

                r.on('go', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e']), newPath) // didn't quite get through the whole path, and the event reflects that
                })

                r.go(['d','e','f'])
            })

            this.test("route's parent catches error", function(t){
                this.count(15)

                var r = Router(function() {
                    this.route('a', function() {
                        this.exit(function() {
                            t.ok(true) // gets here
                        })

                        this.route('b', function() {
                            this.exit(function() {
                                t.ok(true)  // gets here
                            }, function() {
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
                                    }, function() {
                                        t.ok(true) // doesn't get prevented by parent's error
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
                            }, function() {
                                t.ok(true) // not prevented because parent handled the error
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

                r.go(['a','b','c', 'subc']) // should work fine

                r.on('go', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e']), newPath) // didn't quite get through the whole path, and the event reflects that
                })

                r.go(['d','e','f'])
            })

            this.test("route's parent bubbles error to its parent", function(t){
                this.count(15)

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
                            }, function() {
                                t.ok(true)  // not prevented
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
                                    }, function() {
                                        t.ok(true) // doesn't get prevented by parent's error
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
                            }, function() {
                                t.ok(true) // *not* prevented because the error happened in its child
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

                r.go(['a','b','c','subc']) // should work fine

                r.on('go', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e']), newPath) // didn't quite get through the whole path, and the event reflects that
                })

                r.go(['d','e','f'])
            })

            this.test("route's parent error handler throws to its parent", function(t){
                this.count(19)

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
                            }, function() {
                                t.ok(true)  // not prevented
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
                                    }, function() {
                                        t.ok(true) // doesn't get prevented by parent's error
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
                            }, function() {
                                t.ok(true) // *not* prevented because the error happened in its child
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

                r.go(['a','b','c','subc']) // should work fine

                r.on('go', function(newPath) {
                    t.ok(equal(newPath, ['d', 'e'])) // didn't quite get through the whole path, and the event reflects that
                })

                r.go(['d','e','f'])
            })
        })
    })

    this.test('former bugs', function() {
        var r = Router(function() {
            this.route('aa', function() {
            })
        })

        try {
            r.go(['aa','xx'])
        } catch(e) {
            this.eq(e.message, 'No route matched path: ["aa","xx"]')
        }
    })

    //*/


}).writeConsole()



