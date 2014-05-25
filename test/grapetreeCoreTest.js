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
                function() {t.eq(type, 'goEvent')},
                function() {t.eq(type, 'default')}
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

            this.route('a', function() {
                this.enter(function(convergenceDistance) {
                    events('a_enter1')
                    t.eq(convergenceDistance, 0)
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

                this.default(function(path) {
                    t.ok(equal(path, ['a','moo']), path)

                    this.enter(function() {
                        events('defaultEnter')
                    })
                    this.exit(function(divergenceDistance) {
                        t.eq(divergenceDistance, 2)
                        events('defaultExit')
                    })
                })
            })

            this.route(['b','cat'], function() {   // routes can have multiple parts
                this.enter(function(convergenceDistance) {
                    t.eq(convergenceDistance, 0)
                    events('b_enter')
                })
            })

            this.route('c', function() {
                this.enter(function(convergenceDistance) {
                    events('c_enter1')
                    t.eq(convergenceDistance, 0)
                }, function() {
                    events('c_enter2')
                })

                this.route('boom', function() {
                    this.enter(function(convergenceDistance) {
                        events('cboom_enter1')
                        t.eq(convergenceDistance, 1)
                    },
                    undefined,
                    function() {
                        events('cboom_enter2')
                    })
                })
            })

        })

        router.go([]) // going to where you are does nothing at all
        router.go(['a'])
        router.go(['a']) // again: going to where you are does nothing at all
        router.go(['a', 'moo'])
        router.go(['b','cat'])
        router.go(['c','boom'])
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
        this.count(2)

        var router = Router(function() {
            this.default(function(path) {
                t.ok(equal(path, "a,b,c"), path)
            })
        })

        router.on('go', function(newPath) {
            t.ok(equal(newPath, "a,b,c"), newPath)
        })

        // transforms the path for sending to the 'go' event and for the 'default'
        router.transformPath(function(originalPath) {
            return originalPath.join(',')
        })

        router.go(['a','b','c'])
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
        this.count(5)

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

                this.error(function(stage, e) {
                    t.eq(stage,'enter')
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
                    this.exit(function() {
                        throw new Error('exit')
                    })
                    this.default(function(path) {
                        this.enter(function() {
                            t.ok(equal(path, ['a','b']))
                            throw new Error('default')
                        })
                    })
                })

                this.route('b', function() {
                    this.enter(function() {
                        throw new Error('bError')
                    })
                    this.error(function(stage, e) {
                        t.eq(e.message, 'bError')
                        throw e
                    })
                })

                this.error(function(stage, e) {
                    mainSequence(function() {
                        t.eq(stage,'enter')
                        t.eq(e.message,'enter')
                    }, function() {
                        t.eq(stage,'enter')
                        t.eq(e.message,'default')
                    }, function() {
                        t.eq(stage,'exit')
                        t.eq(e.message,'exit')
                    }, function() {
                        t.eq(stage,'enter')
                        t.eq(e.message,'bError')
                    })
                })
            })

            r.go(['a'])
            r.go(['a','b'])
            r.go(['b'])

            Router(function() {
                this.route('a', function() {
                    throw new Error("routing error")
                })

                this.error(function(state, e) {
                    t.eq(state, 'route')
                    t.eq(e.message, "routing error")
                })
            })
        })

    })

    //*/


}).writeConsole()



