"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;

tap.test("async multiple calls", function(t) {
  var createCount = 0;

  var pool = new Pool({
    name: "test",
    create: function(callback) {
      setTimeout(function() {
        createCount += 1;
        callback(null, { id: createCount });
      }, 50);
    },
    validate: () => true,
    destroy: () => {},
    max: 3,
    min: 0,
    idleTimeoutMillis: 100,
    log: false
  });

  var borrowedObjects = [];

  var acquireRelease = function(
    num,
    inUseCount,
    availableCount,
    releaseTimeout
  ) {
    releaseTimeout = releaseTimeout || 100;
    inUseCount = inUseCount === undefined ? 0 : inUseCount;
    availableCount = availableCount === undefined ? 0 : availableCount;

    //console.log("Request " + num + " - available " + pool.available);
    pool.acquire(function(err, obj) {
      // check we haven't already borrowed this before:
      t.equal(
        borrowedObjects.indexOf(obj),
        -1,
        "acquire returned an object is currently acquired"
      );
      borrowedObjects.push(obj);

      //console.log("Acquire " + num + " - object id:", obj.id);
      t.error(err);
      t.ok(createCount <= 3);

      setTimeout(function() {
        var pos = borrowedObjects.indexOf(obj);
        borrowedObjects.splice(pos, 1);

        //console.log("Release " + num + " - object id:", obj.id);
        pool.release(obj);
      }, releaseTimeout);
    });
  };

  acquireRelease(1, 1);
  acquireRelease(2, 2);
  acquireRelease(3);
  acquireRelease(4);

  setTimeout(function() {
    acquireRelease(5);
    acquireRelease(6);
    acquireRelease(7);
    acquireRelease(8, 3, 0, 50);
    acquireRelease(9, 3, 0, 50);
    acquireRelease(10, 3, 0, 50);
    acquireRelease(11);
    acquireRelease(12);

    pool.drain(function() {
      t.end();
    });
  }, 110);
});
