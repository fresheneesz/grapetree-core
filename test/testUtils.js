exports.sequence = function() {
    var n=-1
    return function() {
        var fns = arguments
        n++
        if(n>=fns.length)
            throw new Error("Unexpected call: "+n)
        // else
        fns[n]()
    }
}

// compares arrays and objects for value equality (all elements and memmbers must match)
exports.equal = function(a,b) {
    if(a instanceof Array) {
        if(!(b instanceof Array))
            return false
        if(a.length !== b.length) {
            return false
        } else {
            return a.reduce(function(previousValue, currentValue, index) {
                return previousValue && exports.equal(currentValue,b[index])
            }, true)
        }
    } else if(a instanceof Object) {
        if(!(b instanceof Object))
            return false

        var aKeys = Object.keys(a)
        var bKeys = Object.keys(b)

        if(aKeys.length !== bKeys.length) {
            return false
        } else {
            for(var n=0; n<aKeys.length; n++) {
                var key = aKeys[n]
                var aVal = a[key]
                var bVal = b[key]

                if(!exports.equal(aVal,bVal)) {
                    return false
                }
            }
            // else
            return true
        }
    } else {
        return a===b
    }
}