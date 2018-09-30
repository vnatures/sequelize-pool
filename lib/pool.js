"use strict";

const Denque = require("denque");

/**
 * Generate an Object pool with a specified `factory`.
 *
 * @class
 * @param {Object} factory
 *   Factory to be used for generating and destroying the items.
 * @param {String} [factory.name]
 *   Name of the factory. Serves only logging purposes.
 * @param {Function} factory.create
 *   Should create the item to be acquired,
 *   and call it's first callback argument with the generated item as it's argument.
 * @param {Function} factory.destroy
 *   Should gently close any resources that the item is using.
 *   Called before the items is destroyed.
 * @param {Function} factory.validate
 *   Should return true if connection is still valid and false
 *   If it should be removed from pool. Called before item is
 *   acquired from pool.
 * @param {Number} factory.max
 *   Maximum number of items that can exist at the same time.
 *   Any further acquire requests will be pushed to the waiting list.
 * @param {Number} factory.min
 *   Minimum number of items in pool (including in-use).
 *   When the pool is created, or a resource destroyed, this minimum will
 *   be checked. If the pool resource count is below the minimum, a new
 *   resource will be created and added to the pool.
 * @param {Number} [factory.idleTimeoutMillis=30000]
 *   Delay in milliseconds after the idle items in the pool will be destroyed.
 *   And idle item is that is not acquired yet. Waiting items doesn't count here.
 * @param {Number} [factory.reapIntervalMillis=1000]
 *   Clean up is scheduled in every `factory.reapIntervalMillis` milliseconds.
 * @param {Boolean|Function} [factory.log=false]
 *   Whether the pool should log activity. If function is specified,
 *   that will be used instead. The function expects the arguments msg, loglevel
 */
class Pool {
  constructor(factory) {
    if (!(this instanceof Pool)) {
      return new Pool(factory);
    }

    if (!factory.create) {
      throw new Error("create function is required");
    }

    if (!factory.destroy) {
      throw new Error("destroy function is required");
    }

    if (!factory.validate) {
      throw new Error("validate function is required");
    }

    if (
      typeof factory.min !== "number" ||
      factory.min < 0 ||
      factory.min !== Math.round(factory.min)
    ) {
      throw new Error("min must be an integer >= 0");
    }

    if (
      typeof factory.max !== "number" ||
      factory.max <= 0 ||
      factory.max !== Math.round(factory.max)
    ) {
      throw new Error("max must be an integer > 0");
    }

    if (factory.min > factory.max) {
      throw new Error("max is smaller than min");
    }

    // defaults
    factory.idleTimeoutMillis = factory.idleTimeoutMillis || 30000;
    factory.reapInterval = factory.reapIntervalMillis || 1000;
    factory.max = parseInt(factory.max, 10);
    factory.min = parseInt(factory.min, 10);
    factory.log = factory.log || false;

    this._factory = factory;
    this._count = 0;
    this._draining = false;
    this._waitingAcquires = new Denque();
    this._inUseObjects = [];
    this._availableObjects = [];
    this._asyncTestObjects = [];
    this._removeIdleTimer = null;
    this._removeIdleScheduled = false;
  }

  get size() {
    return this._count;
  }

  get name() {
    return this._factory.name;
  }

  get available() {
    return this._availableObjects.length;
  }

  get using() {
    return this._inUseObjects.length;
  }

  get waiting() {
    return this._waitingAcquires.size();
  }

  get maxSize() {
    return this._factory.max;
  }

  get minSize() {
    return this._factory.min;
  }

  /**
   * logs to console or user defined log function
   * @private
   * @param {string} message
   * @param {string} level
   */
  _log(message, level) {
    if (typeof this._factory.log === "function") {
      this._factory.log(message, level);
    } else if (this._factory.log) {
      console.log(`${level.toUpperCase()} pool ${this.name} - ${message}`);
    }
  }

  /**
   * Request the client to be destroyed. The factory's destroy handler
   * will also be called.
   *
   * This should be called within an acquire() block as an alternative to release().
   *
   * @param {Object} resource
   *   The acquired item to be destroyed.
   */
  destroy(resource) {
    this._count -= 1;
    if (this._count < 0) this._count = 0;

    this._availableObjects = this._availableObjects.filter(
      object => object.resource !== resource
    );
    this._inUseObjects = this._inUseObjects.filter(
      object => object !== resource
    );

    this._factory.destroy(resource);
    this._ensureMinimum();
  }

  /**
   * Checks and removes the available (idle) clients that have timed out.
   * @private
   */
  _removeIdle() {
    var toRemove = [];
    var now = Date.now();
    var i;
    var available = this._availableObjects.length;
    var maxRemovable = this._count - this._factory.min;
    var timeout;

    this._removeIdleScheduled = false;

    // Go through the available (idle) items,
    // check if they have timed out
    for (i = 0; i < available && maxRemovable > toRemove.length; i++) {
      timeout = this._availableObjects[i].timeout;
      if (now >= timeout) {
        // Client timed out, so destroy it.
        this._log(
          "removeIdle() destroying obj - now:" + now + " timeout:" + timeout,
          "verbose"
        );
        toRemove.push(this._availableObjects[i].resource);
      }
    }

    toRemove.forEach(this.destroy, this);

    // NOTE: we are re-calculating this value because it may have changed
    // after destroying items above
    // Replace the available items with the ones to keep.
    available = this._availableObjects.length;

    if (available > 0) {
      this._log("this._availableObjects.length=" + available, "verbose");
      this._scheduleRemoveIdle();
    } else {
      this._log("removeIdle() all objects removed", "verbose");
    }
  }

  /**
   * Schedule removal of idle items in the pool.
   *
   * More schedules cannot run concurrently.
   */
  _scheduleRemoveIdle() {
    if (!this._removeIdleScheduled) {
      this._removeIdleScheduled = true;
      this._removeIdleTimer = setTimeout(() => {
        this._removeIdle();
      }, this._factory.reapInterval);
    }
  }

  /**
   * Try to get a new client to work, and clean up pool unused (idle) items.
   *
   *  - If there are available clients waiting, shift the first one out (LIFO),
   *    and call its callback.
   *  - If there are no waiting clients, try to create one if it won't exceed
   *    the maximum number of clients.
   *  - If creating a new client would exceed the maximum, add the client to
   *    the wait list.
   * @private
   */
  _dispense() {
    var resourceWithTimeout = null;
    var clientCb = null;
    var waitingCount = this._waitingAcquires.size();

    this._log(
      `dispense() clients=${waitingCount} available=${
        this._availableObjects.length
      }`,
      "info"
    );

    if (waitingCount < 1) {
      return;
    }

    while (this._availableObjects.length > 0) {
      this._log("dispense() - reusing obj", "verbose");
      resourceWithTimeout = this._availableObjects[0];
      if (!this._factory.validate(resourceWithTimeout.resource)) {
        this.destroy(resourceWithTimeout.resource);
        continue;
      }

      this._availableObjects.shift();
      this._inUseObjects.push(resourceWithTimeout.resource);
      clientCb = this._waitingAcquires.shift();

      return clientCb(null, resourceWithTimeout.resource);
    }

    if (this._count < this._factory.max) {
      this._createResource();
    }
  }

  /**
   * @private
   */
  _createResource() {
    this._count += 1;
    this._log(
      `createResource() - creating obj - count=${this._count} min=${
        this._factory.min
      } max=${this._factory.max}`,
      "verbose"
    );

    this._factory.create((error = null, object = null) => {
      var clientCb = this._waitingAcquires.shift();
      if (error) {
        this._count -= 1;
        if (this._count < 0) this._count = 0;
        if (clientCb) {
          clientCb(error, object);
        }
        process.nextTick(() => {
          this._dispense();
        });
      } else {
        this._inUseObjects.push(object);
        if (clientCb) {
          clientCb(error, object);
        } else {
          this._addResourceToAvailableObjects(object);
        }
      }
    });
  }

  _addResourceToAvailableObjects(resource) {
    var resourceWithTimeout = {
      resource: resource,
      timeout: Date.now() + this._factory.idleTimeoutMillis
    };

    this._availableObjects.push(resourceWithTimeout);
    this._dispense();
    this._scheduleRemoveIdle();
  }

  /**
   * @private
   */
  _ensureMinimum() {
    var i, diff;
    if (!this._draining && this._count < this._factory.min) {
      diff = this._factory.min - this._count;
      for (i = 0; i < diff; i++) {
        this._createResource();
      }
    }
  }

  /**
   * Request a new client. The callback will be called,
   * when a new client will be available, passing the client to it.
   *
   * @param {Function} callback
   *   Callback function to be called after the acquire is successful.
   *   The function will receive the acquired item as the first parameter.
   *
   * @returns {boolean} `true` if the pool is not fully utilized, `false` otherwise.
   */
  acquire(callback) {
    if (this._draining)
      throw new Error("pool is draining and cannot accept work");

    this._waitingAcquires.push(callback);
    this._dispense();

    return this._count < this._factory.max;
  }

  /**
   * Return the client to the pool, in case it is no longer required.
   *
   * @param {Object} resource
   *   The acquired object to be put back to the pool.
   */
  release(resource) {
    // check to see if this object has already been released
    // (i.e., is back in the pool of this._availableObjects)
    if (
      this._availableObjects.some(
        resourceWithTimeout => resourceWithTimeout.resource === resource
      )
    ) {
      this._log(
        "release called twice for the same resource: " + new Error().stack,
        "error"
      );
      return;
    }

    // check to see if this object exists in the `in use` list and remove it
    var index = this._inUseObjects.indexOf(resource);
    if (index < 0) {
      this._log(
        "attempt to release an invalid resource: " + new Error().stack,
        "error"
      );
      return;
    }

    this._inUseObjects.splice(index, 1);
    this._addResourceToAvailableObjects(resource);
  }

  /**
   * Disallow any new requests and let the request backlog dissipate.
   *
   * @param {Function} callback
   *   Optional. Callback invoked when all work is done and all clients have been
   *   released.
   */
  drain(callback) {
    this._log("draining", "info");

    // disable the ability to put more work on the queue.
    this._draining = true;

    var check = () => {
      if (this._waitingAcquires.size() > 0) {
        // wait until all client requests have been satisfied.
        return setTimeout(check, 100);
      }
      if (this._asyncTestObjects.length > 0) {
        // wait until any async tests have finished
        return setTimeout(check, 100);
      }
      if (this._availableObjects.length !== this._count) {
        // wait until in use object have been released.
        return setTimeout(check, 100);
      }
      if (callback) {
        setImmediate(callback);
      }
    };

    check();
  }

  /**
   * Forcibly destroys all clients regardless of timeout.  Intended to be
   * invoked as part of a drain.  Does not prevent the creation of new
   * clients as a result of subsequent calls to acquire.
   *
   * Note that if factory.min > 0, the pool will destroy all idle resources
   * in the pool, but replace them with newly created resources up to the
   * specified factory.min value.  If this is not desired, set factory.min
   * to zero before calling destroyAllNow()
   *
   * @param {Function} callback
   *   Optional. Callback invoked after all existing clients are destroyed.
   */
  destroyAllNow(callback) {
    this._log("force destroying all objects", "info");

    var willDie = this._availableObjects;
    this._availableObjects = [];
    var todo = willDie.length;

    this._removeIdleScheduled = false;
    clearTimeout(this._removeIdleTimer);

    if (todo === 0 && callback) {
      return setImmediate(callback);
    }

    var resource;
    var done = 0;

    while ((resource = willDie.shift())) {
      this.destroy(resource.resource);
      ++done;

      if (done === todo && callback) {
        return setImmediate(callback);
      }
    }
  }
}

exports.Pool = Pool;
exports.default = Pool;
