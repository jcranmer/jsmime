"use strict";
define(function(require) {

var assert = require('assert');
try {
  var base64 = require('base64');
  var mimeutils = require('mimeutils');
} catch (e) {
  // We only run these tests if we can load the submodule.
  return;
}

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(data[0], fn);
}

let allb64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
  "0123456789+/";

let vector_tests = [
  ["", ""],
  ["f", "Zg=="],
  ["fo", "Zm8="],
  ["foo", "Zm9v"],
  ["foob", "Zm9vYg=="],
  ["fooba", "Zm9vYmE="],
  ["foobar", "Zm9vYmFy"],
  [atob(allb64Chars), allb64Chars],
];

suite('Base64 encode', function () {
  vector_tests.forEach(function (data) {
    arrayTest(data, function () {
      let toEncode = mimeutils.stringToTypedArray(data[0]);
      let base64Encoded = base64.encodeToTypedArray(toEncode);
      let str = mimeutils.typedArrayToString(base64Encoded);
      return assert.equal(str, data[1]);
    });
  });
});
suite('Base64 decode', function () {
  vector_tests.forEach(function (data) {
    arrayTest(data, function () {
      let decoded = base64.decodeToTypedArray(data[1]);
      let str = mimeutils.typedArrayToString(decoded);
      return assert.equal(str, data[0]);
    });
  });
});

});
