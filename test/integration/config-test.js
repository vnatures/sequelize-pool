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
    new Pool(factory);
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
    new Pool(factory);
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
    new Pool(factory);
  }, "destroy function is required");
  t.end();
});

tap.test("fail without factory.validate", function(t) {
  var factory = {
    name: "test-config",
    create: () => {},
    destroy: () => {},
    max: 1,
    min: 0
  };

  t.throws(() => {
    new Pool(factory);
  }, "validate function is required");
  t.end();
});
