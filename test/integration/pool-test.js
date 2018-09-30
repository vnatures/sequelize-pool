"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;
var utils = require("../utils");
var ResourceFactory = utils.ResourceFactory;

tap.test("Pool expands only to max limit", function(t) {
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

tap.test("Pool respects min limit", function(t) {
  var resourceFactory = new ResourceFactory();

  var pool = new Pool({
    name: "test-min",
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    validate: resourceFactory.validate.bind(resourceFactory),
    min: 1,
    max: 2,
    refreshIdle: false
  });

  setTimeout(function() {
    t.equal(resourceFactory.created, 1);
    utils.stopPool(pool);
    t.end();
  }, 10);
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

tap.test("handle creation errors", function(t) {
  var created = 0;
  var pool = new Pool({
    name: "test5",
    create: function(callback) {
      if (created < 5) {
        callback(new Error("Error occurred."));
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
    t.equal(pool.waitingClientsCount(), 0);
    t.end();
  }, 50);
});

tap.test("handle creation errors for delayed creates", function(t) {
  var created = 0;
  var pool = new Pool({
    name: "test6",
    create: function(callback) {
      if (created < 5) {
        setTimeout(function() {
          callback(new Error("Error occurred."));
        }, 0);
      } else {
        setTimeout(function() {
          callback(null, { id: created });
        }, 0);
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
    t.equal(pool.waitingClientsCount(), 0);
    t.end();
  }, 50);
});

tap.test("getPoolSize", function(t) {
  var assertionCount = 0;
  var pool = new Pool({
    name: "test10",
    create: function(callback) {
      callback(null, { id: Math.floor(Math.random() * 1000) });
    },
    destroy: () => {},
    validate: () => true,
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  });

  t.equal(pool.getPoolSize(), 0);
  assertionCount += 1;
  pool.acquire(function(err, obj1) {
    if (err) {
      throw err;
    }
    t.equal(pool.getPoolSize(), 1);
    assertionCount += 1;
    pool.acquire(function(err, obj2) {
      if (err) {
        throw err;
      }
      t.equal(pool.getPoolSize(), 2);
      assertionCount += 1;

      pool.release(obj1);
      pool.release(obj2);

      pool.acquire(function(err, obj3) {
        if (err) {
          throw err;
        }
        // should still be 2
        t.equal(pool.getPoolSize(), 2);
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

tap.test("availableObjectsCount", function(t) {
  var assertionCount = 0;
  var pool = new Pool({
    name: "test11",
    create: function(callback) {
      callback(null, { id: Math.floor(Math.random() * 1000) });
    },
    destroy: () => {},
    validate: () => true,
    max: 2,
    min: 0,
    idleTimeoutMillis: 100
  });

  t.equal(pool.availableObjectsCount(), 0);
  assertionCount += 1;
  pool.acquire(function(err, obj1) {
    if (err) {
      throw err;
    }
    t.equal(pool.availableObjectsCount(), 0);
    assertionCount += 1;

    pool.acquire(function(err, obj2) {
      if (err) {
        throw err;
      }
      t.equal(pool.availableObjectsCount(), 0);
      assertionCount += 1;

      pool.release(obj1);
      t.equal(pool.availableObjectsCount(), 1);
      assertionCount += 1;

      pool.release(obj2);
      t.equal(pool.availableObjectsCount(), 2);
      assertionCount += 1;

      pool.acquire(function(err, obj3) {
        if (err) {
          throw err;
        }
        t.equal(pool.availableObjectsCount(), 1);
        assertionCount += 1;
        pool.release(obj3);

        t.equal(pool.availableObjectsCount(), 2);
        assertionCount += 1;
      });
    });
  });

  setTimeout(function() {
    t.equal(assertionCount, 7);
    t.end();
  }, 30);
});

tap.test("logPassesLogLevel", function(t) {
  var loglevels = { verbose: 0, info: 1, warn: 2, error: 3 };
  var logmessages = { verbose: [], info: [], warn: [], error: [] };
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
    t.ok(level in loglevels);
    logmessages[level].push(msg);
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
  t.equal(pool2.getName(), "testNoLog");

  pool.acquire(function(err) {
    t.error(err);
    t.equal(
      logmessages.verbose[0],
      "createResource() - creating obj - count=1 min=0 max=2"
    );
    t.equal(logmessages.info[0], "dispense() clients=1 available=0");
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
    t.equal(pool.availableObjectsCount(), 0);
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
    t.equal(pool.availableObjectsCount(), 1);
    t.end();
  }, 20);
});

tap.test("removes from available objects on async validation failure", function(
  t
) {
  var destroyCalled = false;
  var validateCalled = false;
  var count = 0;
  var factory = {
    name: "test15",
    create: function(callback) {
      callback(null, { count: count++ });
    },
    destroy: function(client) {
      destroyCalled = client.count;
    },
    validateAsync: function(client, callback) {
      validateCalled = true;
      callback(client.count > 0 ? new Error() : null);
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
    t.equal(pool.availableObjectsCount(), 1);
    t.end();
  }, 50);
});

tap.test(
  "do schedule again if error occurred when creating new Objects async",
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
      t.equal(pool.availableObjectsCount(), 0);
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
    t.equal(pool.availableObjectsCount(), 0);
    t.equal(pool.inUseObjectsCount(), 1);

    // Invalid release
    pool.release({});
    t.equal(pool.availableObjectsCount(), 0);
    t.equal(pool.inUseObjectsCount(), 1);

    // Valid release
    pool.release(obj);
    t.equal(pool.availableObjectsCount(), 1);
    t.equal(pool.inUseObjectsCount(), 0);
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
    t.equal(pool.availableObjectsCount(), 0);
    t.equal(pool.inUseObjectsCount(), 1);
    t.end();
  });
});

tap.test("validateAsync acquires object from the pool", function(t) {
  var pool = new Pool({
    name: "test19",
    create: function(callback) {
      process.nextTick(function() {
        callback(null, { id: "validId" });
      });
    },
    validateAsync: function(resource, callback) {
      callback(new Error("Validate"));
    },
    destroy: function() {},
    max: 1,
    min: 0,
    idleTimeoutMillis: 100
  });

  pool.acquire(function(err) {
    t.error(err);
    t.equal(pool.availableObjectsCount(), 0);
    t.equal(pool.inUseObjectsCount(), 1);
    t.end();
  });
});
