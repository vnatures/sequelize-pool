function doWhileAsync(conditionFn, iterateFn, callbackFn) {
  var next = function() {
    if (conditionFn()) {
      iterateFn(next);
    } else {
      callbackFn();
    }
  };
  next();
}
module.exports.doWhileAsync = doWhileAsync;
