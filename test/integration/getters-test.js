"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;
var random = () => Math.floor(Math.random() * 1000);

tap.test("pool.name", function(t) {
  var pool = new Pool({
    name: "test-pool.name",
    create: callback => callback(null, { id: random() }),
    destroy: () => {},
    validate: () => true,
    max: 2,
    min: 0
  });

  t.ok(pool.name === "test-pool.name");
  t.end();
});

tap.test("pool.size", function(t) {
  var assertionCount = 0;
  var pool = new Pool({
    name: "test-pool.size",
    create: callback => callback(null, { id: random() }),
    destroy: () => {},
    validate: () => true,
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  });

  t.equal(pool.size, 0);
  assertionCount += 1;
  pool.acquire(function(err, obj1) {
    if (err) {
      throw err;
    }
    t.equal(pool.size, 1);
    assertionCount += 1;
    pool.acquire(function(err, obj2) {
      if (err) {
        throw err;
      }
      t.equal(pool.size, 2);
      assertionCount += 1;

      pool.release(obj1);
      pool.release(obj2);

      pool.acquire(function(err, obj3) {
        if (err) {
          throw err;
        }
        // should still be 2
        t.equal(pool.size, 2);
        assertionCount += 1;
        pool.release(obj3);
      });
    });
  });

  setTimeout(function() {
    t.equal(assertionCount, 4);
    t.end();
  }, 40);
});

tap.test("pool.available", function(t) {
  var assertionCount = 0;
  var pool = new Pool({
    name: "test-pool.available",
    create: callback => callback(null, { id: random() }),
    destroy: () => {},
    validate: () => true,
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  });

  t.equal(pool.available, 0);
  assertionCount += 1;
  pool.acquire(function(err, obj1) {
    if (err) {
      throw err;
    }
    t.equal(pool.available, 0);
    assertionCount += 1;

    pool.acquire(function(err, obj2) {
      if (err) {
        throw err;
      }
      t.equal(pool.available, 0);
      assertionCount += 1;

      pool.release(obj1);
      t.equal(pool.available, 1);
      assertionCount += 1;

      pool.release(obj2);
      t.equal(pool.available, 2);
      assertionCount += 1;

      pool.acquire(function(err, obj3) {
        if (err) {
          throw err;
        }
        t.equal(pool.available, 1);
        assertionCount += 1;
        pool.release(obj3);

        t.equal(pool.available, 2);
        assertionCount += 1;
      });
    });
  });

  setTimeout(function() {
    t.equal(assertionCount, 7);
    t.end();
  }, 30);
});
