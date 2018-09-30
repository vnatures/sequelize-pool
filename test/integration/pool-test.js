"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;
var utils = require("../utils");
var ResourceFactory = utils.ResourceFactory;

tap.test("pool expands only to max limit", function(t) {
  var resourceFactory = new ResourceFactory();

  var factory = {
    name: "test1",
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    validate: resourceFactory.validate.bind(resourceFactory),
    max: 1,
    min: 0,
    refreshIdle: false
  };

  var pool = new Pool(factory);

  // NOTES:
  // - request a resource
  // - once we have it, request another and check the pool is full
  pool.acquire(function(err, obj) {
    t.error(err);
    var poolIsFull = !pool.acquire(function(err, obj) {
      t.error(err);
      t.equal(1, resourceFactory.created);
      pool.release(obj);
      utils.stopPool(pool);
      t.end();
    });
    t.ok(poolIsFull);
    t.equal(1, resourceFactory.created);
    pool.release(obj);
  });
});

tap.test("removes correct object on reap", function(t) {
  var resourceFactory = new ResourceFactory();

  var pool = new Pool({
    name: "test3",
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    validate: resourceFactory.validate.bind(resourceFactory),
    max: 2,
    min: 0,
    refreshIdle: false
  });

  pool.acquire(function(err, client) {
    t.error(err);
    // should be removed second
    setTimeout(function() {
      pool.destroy(client);
    }, 5);
  });

  pool.acquire(function(err, client) {
    t.error(err);
    // should be removed first
    pool.destroy(client);
  });

  setTimeout(function() {
    t.equal(1, resourceFactory.bin[0].id);
    t.equal(0, resourceFactory.bin[1].id);
    t.end();
  }, 100);
});

tap.test("tests drain", function(t) {
  var count = 5;
  var acquired = 0;

  var resourceFactory = new ResourceFactory();

  var pool = new Pool({
    name: "test4",
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    validate: resourceFactory.validate.bind(resourceFactory),
    max: 2,
    min: 0,
    idleTimeoutMillis: 300000
  });

  // request 5 resources that release after 250ms
  for (var i = 0; i < count; i++) {
    pool.acquire(function(err, client) {
      t.error(err);
      acquired += 1;
      t.equal(typeof client.id, "number");
      setTimeout(function() {
        pool.release(client);
      }, 250);
    });
  }
  // FIXME: what does this assertion prove?
  t.notEqual(count, acquired);
  pool.drain(function() {
    t.equal(count, acquired);
    // short circuit the absurdly long timeout above.
    pool.destroyAllNow();
    t.end();
  });

  // subsequent calls to acquire should return an error.
  t.throws(function() {
    pool.acquire(function() {});
  }, Error);
});

tap.test("logPassesLogLevel", function(t) {
  var logLevels = { verbose: 0, info: 1, warn: 2, error: 3 };
  var logMessages = { verbose: [], info: [], warn: [], error: [] };
  var factory = {
    name: "test12",
    create: function(callback) {
      callback(null, { id: Math.floor(Math.random() * 1000) });
    },
    destroy: () => {},
    validate: () => {},
    max: 2,
    min: 0,
    idleTimeoutMillis: 100,
    log: function(msg, level) {
      testlog(msg, level);
    }
  };
  var testlog = function(msg, level) {
    t.ok(level in logLevels);
    logMessages[level].push(msg);
  };
  var pool = new Pool(factory);

  var pool2 = new Pool({
    name: "testNoLog",
    create: function(callback) {
      callback(null, { id: Math.floor(Math.random() * 1000) });
    },
    destroy: () => {},
    validate: () => {},
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  });
  t.equal(pool2.name, "testNoLog");

  pool.acquire(function(err) {
    t.error(err);
    t.equal(
      logMessages.verbose[0],
      "createResource() - creating obj - count=1 min=0 max=2"
    );
    t.equal(logMessages.info[0], "dispense() clients=1 available=0");
    t.end();
  });
});

tap.test("removes from available objects on destroy", function(t) {
  var destroyCalled = false;
  var factory = {
    name: "test13",
    create: function(callback) {
      callback(null, {});
    },
    destroy: function() {
      destroyCalled = true;
    },
    validate: () => {},
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  };

  var pool = new Pool(factory);
  pool.acquire(function(err, obj) {
    t.error(err);
    pool.destroy(obj);
  });
  setTimeout(function() {
    t.equal(destroyCalled, true);
    t.equal(pool.available, 0);
    t.end();
  }, 10);
});

tap.test("removes from available objects on validation failure", function(t) {
  var destroyCalled = false;
  var validateCalled = false;
  var count = 0;
  var factory = {
    name: "test14",
    create: function(callback) {
      callback(null, { count: count++ });
    },
    destroy: function(client) {
      destroyCalled = client.count;
    },
    validate: function(client) {
      validateCalled = true;
      return client.count > 0;
    },
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  };

  var pool = new Pool(factory);
  pool.acquire(function(err, obj) {
    t.error(err);
    pool.release(obj);
    t.equal(obj.count, 0);

    pool.acquire(function(err, obj) {
      t.error(err);
      pool.release(obj);
      t.equal(obj.count, 1);
    });
  });
  setTimeout(function() {
    t.equal(validateCalled, true);
    t.equal(destroyCalled, 0);
    t.equal(pool.available, 1);
    t.end();
  }, 20);
});

tap.test(
  "do schedule again if error occurred when creating new objects async",
  function(t) {
    // NOTE: we're simulating the first few resource attempts failing
    var resourceCreationAttempts = 0;

    var factory = {
      name: "test16",
      create: function(callback) {
        setTimeout(function() {
          resourceCreationAttempts++;
          if (resourceCreationAttempts < 2) {
            return callback(new Error("Create Error"));
          }
          callback(null, {});
        }, 1);
      },
      destroy: () => {},
      validate: () => {},
      max: 1,
      min: 0,
      refreshIdle: false
    };

    var pool = new Pool(factory);
    pool.acquire(function() {});
    pool.acquire(function(err) {
      t.error(err);
      t.equal(pool.available, 0);
      t.end();
    });
  }
);

tap.test("returns only valid object to the pool", function(t) {
  var pool = new Pool({
    name: "test17",
    create: function(callback) {
      process.nextTick(function() {
        callback(null, { id: "validId" });
      });
    },
    destroy: () => {},
    validate: () => {},
    max: 1,
    min: 0,
    idleTimeoutMillis: 100
  });

  pool.acquire(function(err, obj) {
    t.error(err);
    t.equal(pool.available, 0);
    t.equal(pool.using, 1);

    // Invalid release
    pool.release({});
    t.equal(pool.available, 0);
    t.equal(pool.using, 1);

    // Valid release
    pool.release(obj);
    t.equal(pool.available, 1);
    t.equal(pool.using, 0);
    t.end();
  });
});

tap.test("validate acquires object from the pool", function(t) {
  var pool = new Pool({
    name: "test18",
    create: function(callback) {
      process.nextTick(function() {
        callback(null, { id: "validId" });
      });
    },
    destroy: () => {},
    validate: () => {
      return true;
    },
    max: 1,
    min: 0,
    idleTimeoutMillis: 100
  });

  pool.acquire(function(err) {
    t.error(err);
    t.equal(pool.available, 0);
    t.equal(pool.using, 1);
    t.end();
  });
});
