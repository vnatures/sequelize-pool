"use strict";

/**
 * Generic class for handling creation of resources
 * for testing
 */
class ResourceFactory {
  constructor() {
    this.created = 0;
    this.destroyed = 0;
    this.bin = [];
  }

  create(callback) {
    var resource = {
      id: this.created++
    };
    setTimeout(function() {
      callback(resource);
    }, 1);
  }

  destroy(resource) {
    this.destroyed++;
    this.bin.push(resource);
  }

  validate() {
    return true;
  }
}

exports.ResourceFactory = ResourceFactory;

/**
 * drains and terminates the pool
 *
 * @param  {[type]} pool [description]
 * @return {[type]}      [description]
 */
exports.stopPool = function(pool) {
  pool.drain(function() {
    pool.destroyAllNow();
  });
};
