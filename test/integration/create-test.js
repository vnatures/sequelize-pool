"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;

tap.test("factory.create", function(t) {
  tap.test("handle creation errors", function(t) {
    var created = 0;
    var pool = new Pool({
      name: "test-create-errors",
      create: function(callback) {
        if (created < 5) {
          callback(new Error(`Error ${created} occurred.`));
        } else {
          callback(null, { id: created });
        }
        created++;
      },
      destroy: () => {},
      validate: () => {},
      max: 1,
      min: 0,
      idleTimeoutMillis: 1000
    });

    // ensure that creation errors do not populate the pool.
    for (var i = 0; i < 5; i++) {
      pool.acquire(function(err, client) {
        t.ok(err instanceof Error);
        t.ok(err.message === `Error ${i} occurred.`);
        t.ok(client === null);
      });
    }

    var called = false;
    pool.acquire(function(err, client) {
      t.ok(err === null);
      t.equal(typeof client.id, "number");
      called = true;
    });
    setTimeout(function() {
      t.ok(called);
      t.equal(pool.waiting, 0);
      t.end();
    }, 50);
  });

  tap.test("handle creation errors from delayed creates", function(t) {
    var created = 0;
    var pool = new Pool({
      name: "test-async-create-errors",
      create: function(callback) {
        if (created < 5) {
          setTimeout(function() {
            callback(new Error("Error occurred."));
          }, 10);
        } else {
          setTimeout(function() {
            callback(null, { id: created });
          }, 10);
        }
        created++;
      },
      destroy: () => {},
      validate: () => {},
      max: 1,
      min: 0,
      idleTimeoutMillis: 1000
    });

    // FIXME: this section no longer proves anything as factory
    // errors no longer bubble up through the acquire call
    // we need to make the Pool an Emitter

    // ensure that creation errors do not populate the pool.
    for (var i = 0; i < 5; i++) {
      pool.acquire(function(err, client) {
        t.ok(err instanceof Error);
        t.ok(err.message === "Error occurred.");
        t.ok(client === null);
      });
    }
    var called = false;
    pool.acquire(function(err, client) {
      t.ok(err === null);
      t.equal(typeof client.id, "number");
      called = true;
    });

    setTimeout(function() {
      t.ok(called);
      t.equal(pool.waiting, 0);
      t.end();
    }, 100);
  });

  t.end();
});
