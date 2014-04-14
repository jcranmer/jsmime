"use strict";
define(function(require) {

var assert = require('assert');
var headeremitter = require('jsmime').headeremitter;

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(JSON.stringify(data[0]), fn);
}

suite('headeremitter', function () {
  suite('addAddresses', function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        if (this.output == "")
          assert.equal(this.output, this.expected);
        else
          assert.equal(this.output, this.expected + '\r\n');
        for (let line of this.output.split('\r\n'))
          assert.ok(line.length <= 30, "Line is too long");
      }
    };
    let header_tests = [
      [[{name: "", email: ""}], ""],
      [[{name: "", email: "a@example.com"}], "a@example.com"],
      [[{name: "John Doe", email: "a@example.com"}], "John Doe <a@example.com>"],
      [[{name: "", email: "a@b.c"}, {name: "", email: "b@b.c"}], "a@b.c, b@b.c"],
      [[{name: "JD", email: "a@a.c"}, {name: "SD", email: "b@b.c"}],
        "JD <a@a.c>, SD <b@b.c>"],
      [[{name: "John Doe", email: "a@example.com"},
        {name: "Sally Doe", email: "b@example.com"}],
        "John Doe <a@example.com>,\r\n Sally Doe <b@example.com>"],
      [[{name: "My name is really long and I split somewhere", email: "a@a.c"}],
        "My name is really long and I\r\n split somewhere <a@a.c>"],
      // Note that the name is 29 chars here, so adding the email needs a break.
      [[{name: "My name is really really long", email: "a@a.c"}],
        "My name is really really long\r\n <a@a.c>"],
      [[{name: "", email: "a@a.c"}, {name: "This name is long", email: "b@b.c"}],
        "a@a.c,\r\n This name is long <b@b.c>"],
      [[{name: "", email: "a@a.c"}, {name: "This name is also long", email: "b@b.c"}],
        "a@a.c,\r\n This name is also long\r\n <b@b.c>"],
      [[{name: "", email: "hi!bad@all.com"}], "\"hi!bad\"@all.com"],
      [[{name: "", email: "\"hi!bad\"@all.com"}], "\"hi!bad\"@all.com"],
      [[{name: "Doe, John", email: "a@a.com"}], "\"Doe, John\" <a@a.com>"],
      // This one violates the line length, so it underquotes instead.
      [[{name: "A really, really long name to quote", email: "a@example.com"}],
        "A \"really,\" really long name\r\n to quote <a@example.com>"],
      [[{name: "Group", group: [{name: "", email: "a@a.c"},
                                {name: "", email: "b@b.c"}]}],
        "Group: a@a.c, b@b.c;"],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          useASCII: false,
        });
        handler.reset(data[1]);
        emitter.addAddresses(data[0]);
        emitter.finish(true);
      });
    });
  });
  suite('addAddresses (RFC 2047)', function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        assert.equal(this.output, this.expected + '\r\n');
        for (let line of this.output.split('\r\n'))
          assert.ok(line.length <= 30, "Line is too long");
      }
    }
    let header_tests = [
      [[{name: "\u0436", email: "a@a.c"}], "=?UTF-8?B?0LY=?= <a@a.c>"],
      [[{name: "dioxyg\u00e8ne", email: "a@a.c"}],
        "=?UTF-8?Q?dioxyg=c3=a8ne?=\r\n <a@a.c>"],
      // Prefer QP if base64 and QP are exactly the same length
      [[{name: "oxyg\u00e8ne", email: "a@a.c"}],
      // =?UTF-8?B?b3h5Z8OobmU=?=
        "=?UTF-8?Q?oxyg=c3=a8ne?=\r\n <a@a.c>"],
      [[{name: "\ud83d\udca9\ud83d\udca9\ud83d\udca9\ud83d\udca9",
        email: "a@a.c"}],
        "=?UTF-8?B?8J+SqfCfkqnwn5Kp?=\r\n =?UTF-8?B?8J+SqQ==?= <a@a.c>"],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          useASCII: true
        });
        handler.reset(data[1]);
        emitter.addAddresses(data[0]);
        emitter.finish(true);
      });
    });
  });
  suite('addUnstructured (RFC 2047)', function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        assert.equal(this.output, this.expected + '\r\n');
        for (let line of this.output.split('\r\n'))
          assert.ok(line.length <= 30, "Line is too long");
      }
    }
    let header_tests = [
      ["My house   burned down!", "My house burned down!"],

      // Which variables need to be encoded in QP encoding?
      ["! \" # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~ \x7f",
        "=?UTF-8?Q?!_=22_#_$_%_&_'_?=\r\n" +
        " =?UTF-8?Q?=28_=29_*_+_,_-_.?=\r\n" +
        " =?UTF-8?Q?_/_:_;_<_=3d_>_?=\r\n" +
        " =?UTF-8?Q?=3f_@_[_\\_]_^_=5f?=\r\n" +
        " =?UTF-8?Q?_`_{_|_}_~_=7f?="],
      // But non-printable characters don't need it in the first place!
      ["! \" # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~",
        "! \" # $ % & ' ( ) * + , - . /\r\n" +
        " : ; < = > ? @ [ \\ ] ^ _ ` { |\r\n" +
        " } ~"],

      // Test to make sure 2047-encoding chooses the right values.
      ["\u001f", "=?UTF-8?Q?=1f?="],
      ["\u001fa", "=?UTF-8?Q?=1fa?="],
      ["\u001faa", "=?UTF-8?B?H2Fh?="],
      ["\u001faaa", "=?UTF-8?Q?=1faaa?="],
      ["\u001faaa\u001f", "=?UTF-8?B?H2FhYR8=?="],
      ["\u001faaa\u001fa", "=?UTF-8?B?H2FhYR9h?="],
      ["\u001faaa\u001faa", "=?UTF-8?Q?=1faaa=1faa?="],
      ["\u001faaa\u001faa\u001faaaa", "=?UTF-8?B?H2FhYR9hYR9hYWFh?="],

      // Make sure line breaking works right at the edge cases
      ["\u001faaa\u001faaaaaaaaa", "=?UTF-8?Q?=1faaa=1faaaaaaaaa?="],
      ["\u001faaa\u001faaaaaaaaaa",
        "=?UTF-8?Q?=1faaa=1faaaaaaaaa?=\r\n =?UTF-8?Q?a?="],

      // Choose base64/qp independently for each word
      ["\ud83d\udca9\ud83d\udca9\ud83d\udca9a",
        "=?UTF-8?B?8J+SqfCfkqnwn5Kp?=\r\n =?UTF-8?Q?a?="],

      // Don't split a surrogate character!
      ["a\ud83d\udca9\ud83d\udca9\ud83d\udca9a",
        "=?UTF-8?B?YfCfkqnwn5Kp?=\r\n =?UTF-8?B?8J+SqWE=?="],

      // Spacing a UTF-8 string
      ["L'oxyg\u00e8ne est un \u00e9l\u00e9ment chimique du groupe des " +
        "chalcog\u00e8nes",
      //          1         2         3
      // 123456789012345678901234567890
        "=?UTF-8?Q?L'oxyg=c3=a8ne_est?=\r\n" +
        " =?UTF-8?B?IHVuIMOpbMOpbWVu?=\r\n" +
        " =?UTF-8?Q?t_chimique_du_gro?=\r\n" +
        " =?UTF-8?Q?upe_des_chalcog?=\r\n" +
        " =?UTF-8?B?w6huZXM=?="],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          useASCII: true
        });
        handler.reset(data[1]);
        emitter.addUnstructured(data[0]);
        emitter.finish(true);
      });
    });
  });
  suite("addParameter", function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        assert.equal(this.output, this.expected + '\r\n');
      }
    };
    let header_tests = [
      [["key", {"param": "5"}], "key; param=5"],
      [["key", {"param": "has a space"}], 'key; param="has a space"'],
      [["key", {"param": "very long value here"}],
        'key;\r\n param="very long value here"'],
      [["key", {"param": "an extremely long value here"}],
        'key;\r\n param="an extremely long value here"'],
      [["key", {"p1": "100", "p2": "50"}], "key; p1=100; p2=50"],
      [["multipart/related", {"boundary": "---===_boundary_string"}],
        'multipart/related;\r\n boundary=---===_boundary_string'],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          useASCII: false
        });
        handler.reset(data[1]);
        emitter.addText(data[0][0], false);
        for (let key in data[0][1]) {
          emitter.addParameter(key, data[0][1][key]);
        }
        emitter.finish(true);
      });
    });
  });

  suite("addParameter (RFC 2231)", function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        assert.equal(this.output, this.expected + '\r\n');
      }
    };
    let header_tests = [
      // Test quoting, with otherwise fully-ASCII characters
      [["key", {"param": "5"}], "key; param=5"],
      [["key", {"param": "%"}], "key; param=%"],
      [["key", {"param": "has a space"}], 'key; param="has a space"'],
      [["key", {"param": "very long value here"}],
        'key;\r\n param="very long value here"'],
      [["key", {"param": "an extremely long value here"}],
        'key;\r\n param*0="an extremely long va";\r\n param*1="lue here"'],
      [["key", {"param": "an extremely long value here"}],
        'key;\r\n param*0="an extremely long va";\r\n param*1="lue here"'],
      [["key", {"file": "/path/to/some/very/deep/path/with a space"}],
        'key;\r\n file*0=/path/to/some/very/de;\r\n' +
                ' file*1="ep/path/with a space"'],

      // Test the presence of non-ASCII yet non-continuing 2231 scenarios.
      [["key", {"param": "\ud83d\udca9"}],
        "key;\r\n param*=UTF-8''%f0%9f%92%a9"],
      [["key", {"param": "\u00e3 %"}],
        "key;\r\n param*=UTF-8''%c3%a3%20%25"],

      // Test that we don't break in the middle of a %-sign
      [["key", {"param": "aaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaa%f0%9f%92;\r\n param*1*=%a9"],
      [["key", {"param": "aaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaa%f0%9f;\r\n param*1*=%92%a9"],
      [["key", {"param": "aaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaa%f0%9f;\r\n param*1*=%92%a9"],
      [["key", {"param": "aaaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaaa%f0%9f;\r\n param*1*=%92%a9"],
      [["key", {"param": "aaaaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaaaa%f0;\r\n param*1*=%9f%92%a9"],

      // Test that we work even on 2-digit continuation numbers
      [["key", {"param": "\ud83d\udca9".repeat(20)}],
        "key;\r\n param*0*=UTF-8''%f0%9f%92%a9;\r\n" +
                " param*1*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*2*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*3*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*4*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*5*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*6*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*7*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*8*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*9*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*10*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*11*=%f0%9f%92%a9%f0%9f;\r\n" +
                " param*12*=%92%a9%f0%9f%92%a9;\r\n" +
                " param*13*=%f0%9f%92%a9"],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          useASCII: true
        });
        handler.reset(data[1]);
        emitter.addText(data[0][0], false);
        for (let key in data[0][1]) {
          emitter.addParameter(key, data[0][1][key]);
        }
        emitter.finish(true);
      });
    });
  });

  suite("Header lengths", function () {
    let handler = {
      reset: function (expected) {
        this.output = '';
        this.expected = expected;
      },
      deliverData: function (data) { this.output += data; },
      deliverEOF: function () {
        assert.equal(this.output, this.expected + '\r\n');
      }
    };
    let header_tests = [
      [[{name: "Supercalifragilisticexpialidocious", email: "a@b.c"}],
        'Supercalifragilisticexpialidocious\r\n <a@b.c>'],
      [[{email: "supercalifragilisticexpialidocious@" +
          "the.longest.domain.name.in.the.world.invalid"}],
        'supercalifragilisticexpialidocious\r\n' +
        ' @the.longest.domain.name.in.the.world.invalid'],
      [[{name: "Lopadotemachoselachogaleokranioleipsanodrimhypotrimmatosilphi" +
        "paraomelitokatakechymenokichlepikossyphophattoperisteralektryonoptek" +
        "ephalliokigklopeleiolagoiosiraiobaphetraganopterygon", email: "a@b.c"}],
        new Error],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, {
          softMargin: 30,
          hardMargin: 50,
          useASCII: false,
        });
        handler.reset(data[1]);
        if (data[1] instanceof Error)
          assert.throws(function () { emitter.addAddresses(data[0]); });
        else {
          assert.doesNotThrow(function () { emitter.addAddresses(data[0]); });
          emitter.finish(true);
        }
      });
    });
  });
});

});
