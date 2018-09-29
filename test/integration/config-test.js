"use strict";

var tap = require("tap");
var Pool = require("../..").Pool;

tap.test("fail for max < min", function(t) {
  var factory = {
    name: "test-config",
    create: () => {},
    destroy: () => {},
    validate: () => {},
    max: 1,
    min: 12
  };

  t.throws(() => {
    Pool(factory);
  }, "max is smaller than min");
  t.end();
});

tap.test("fail without factory.create", function(t) {
  var factory = {
    name: "test-config",
    destroy: () => {},
    validate: () => {},
    max: 1,
    min: 0
  };

  t.throws(() => {
    Pool(factory);
  }, "create function is required");
  t.end();
});

tap.test("fail without factory.destroy", function(t) {
  var factory = {
    name: "test-config",
    create: () => {},
    validate: () => {},
    max: 1,
    min: 0
  };

  t.throws(() => {
    Pool(factory);
  }, "destroy function is required");
  t.end();
});

tap.test("fail without factory.validate or factory.validateAsync", function(t) {
  var factory = {
    name: "test-config",
    create: () => {},
    destroy: () => {},
    max: 1,
    min: 0
  };

  t.throws(() => {
    Pool(factory);
  }, "Neither validate or validateAsync was specified");
  t.end();
});

tap.test("fail with both factory.validate or factory.validateAsync", function(
  t
) {
  var factory = {
    name: "test-config",
    create: () => {},
    destroy: () => {},
    validate: () => {},
    validateAsync: () => {},
    max: 1,
    min: 0
  };

  t.throws(() => {
    Pool(factory);
  }, "Only one of validate or validateAsync may be specified");
  t.end();
});
