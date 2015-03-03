"use strict";
define(function(require) {

var assert = require('assert');
var jsmime = require('jsmime');
var headeremitter = jsmime.headeremitter;
var MockDate = require('test/mock_date');

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
      [[{name: "No email address", email: ""}], "No email address"],
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
        "=?UTF-8?Q?dioxyg=C3=A8ne?=\r\n <a@a.c>"],
      // Prefer QP if base64 and QP are exactly the same length
      [[{name: "oxyg\u00e8ne", email: "a@a.c"}],
      // =?UTF-8?B?b3h5Z8OobmU=?=
        "=?UTF-8?Q?oxyg=C3=A8ne?=\r\n <a@a.c>"],
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
        " =?UTF-8?Q?_/_:_;_<_=3D_>_?=\r\n" +
        " =?UTF-8?Q?=3F_@_[_\\_]_^_=5F?=\r\n" +
        " =?UTF-8?Q?_`_{_|_}_~_=7F?="],
      // But non-printable characters don't need it in the first place!
      ["! \" # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~",
        "! \" # $ % & ' ( ) * + , - . /\r\n" +
        " : ; < = > ? @ [ \\ ] ^ _ ` { |\r\n" +
        " } ~"],

      // Test to make sure 2047-encoding chooses the right values.
      ["\u001f", "=?UTF-8?Q?=1F?="],
      ["\u001fa", "=?UTF-8?Q?=1Fa?="],
      ["\u001faa", "=?UTF-8?B?H2Fh?="],
      ["\u001faaa", "=?UTF-8?Q?=1Faaa?="],
      ["\u001faaa\u001f", "=?UTF-8?B?H2FhYR8=?="],
      ["\u001faaa\u001fa", "=?UTF-8?B?H2FhYR9h?="],
      ["\u001faaa\u001faa", "=?UTF-8?Q?=1Faaa=1Faa?="],
      ["\u001faaa\u001faa\u001faaaa", "=?UTF-8?B?H2FhYR9hYR9hYWFh?="],

      // Make sure line breaking works right at the edge cases
      ["\u001faaa\u001faaaaaaaaa", "=?UTF-8?Q?=1Faaa=1Faaaaaaaaa?="],
      ["\u001faaa\u001faaaaaaaaaa",
        "=?UTF-8?Q?=1Faaa=1Faaaaaaaaa?=\r\n =?UTF-8?Q?a?="],

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
        "=?UTF-8?Q?L'oxyg=C3=A8ne_est?=\r\n" +
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
  suite("addDate", function () {
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
      // Test basic day/month names
      ["2000-01-01T00:00:00Z", "Sat, 1 Jan 2000 00:00:00 +0000"],
      ["2000-02-01T00:00:00Z", "Tue, 1 Feb 2000 00:00:00 +0000"],
      ["2000-03-01T00:00:00Z", "Wed, 1 Mar 2000 00:00:00 +0000"],
      ["2000-04-01T00:00:00Z", "Sat, 1 Apr 2000 00:00:00 +0000"],
      ["2000-05-01T00:00:00Z", "Mon, 1 May 2000 00:00:00 +0000"],
      ["2000-06-01T00:00:00Z", "Thu, 1 Jun 2000 00:00:00 +0000"],
      ["2000-07-01T00:00:00Z", "Sat, 1 Jul 2000 00:00:00 +0000"],
      ["2000-08-01T00:00:00Z", "Tue, 1 Aug 2000 00:00:00 +0000"],
      ["2000-09-01T00:00:00Z", "Fri, 1 Sep 2000 00:00:00 +0000"],
      ["2000-10-01T00:00:00Z", "Sun, 1 Oct 2000 00:00:00 +0000"],
      ["2000-11-01T00:00:00Z", "Wed, 1 Nov 2000 00:00:00 +0000"],
      ["2000-12-01T00:00:00Z", "Fri, 1 Dec 2000 00:00:00 +0000"],

      // Test timezone offsets
      ["2000-06-01T12:00:00Z", "Thu, 1 Jun 2000 12:00:00 +0000"],
      ["2000-06-01T12:00:00+0100", "Thu, 1 Jun 2000 12:00:00 +0100"],
      ["2000-06-01T12:00:00+0130", "Thu, 1 Jun 2000 12:00:00 +0130"],
      ["2000-06-01T12:00:00-0100", "Thu, 1 Jun 2000 12:00:00 -0100"],
      ["2000-06-01T12:00:00-0130", "Thu, 1 Jun 2000 12:00:00 -0130"],
      ["2000-06-01T12:00:00+1345", "Thu, 1 Jun 2000 12:00:00 +1345"],
      ["2000-06-01T12:00:00-1200", "Thu, 1 Jun 2000 12:00:00 -1200"],
      ["2000-06-01T12:00:00+1337", "Thu, 1 Jun 2000 12:00:00 +1337"],
      ["2000-06-01T12:00:00+0101", "Thu, 1 Jun 2000 12:00:00 +0101"],
      ["2000-06-01T12:00:00-1337", "Thu, 1 Jun 2000 12:00:00 -1337"],

      // Try some varying hour, minute, and second amounts, to double-check
      // padding and time dates.
      ["2000-06-01T01:02:03Z", "Thu, 1 Jun 2000 01:02:03 +0000"],
      ["2000-06-01T23:13:17Z", "Thu, 1 Jun 2000 23:13:17 +0000"],
      ["2000-06-01T00:05:04Z", "Thu, 1 Jun 2000 00:05:04 +0000"],
      ["2000-06-01T23:59:59Z", "Thu, 1 Jun 2000 23:59:59 +0000"],
      ["2000-06-01T13:17:40Z", "Thu, 1 Jun 2000 13:17:40 +0000"],
      ["2000-06-01T11:15:34Z", "Thu, 1 Jun 2000 11:15:34 +0000"],
      ["2000-06-01T04:09:09Z", "Thu, 1 Jun 2000 04:09:09 +0000"],
      ["2000-06-01T04:10:10Z", "Thu, 1 Jun 2000 04:10:10 +0000"],
      ["2000-06-01T09:13:17Z", "Thu, 1 Jun 2000 09:13:17 +0000"],
      ["2000-06-01T13:12:14Z", "Thu, 1 Jun 2000 13:12:14 +0000"],
      ["2000-06-01T14:16:48Z", "Thu, 1 Jun 2000 14:16:48 +0000"],

      // Try varying month, date, and year values.
      ["2000-01-31T00:00:00Z", "Mon, 31 Jan 2000 00:00:00 +0000"],
      ["2000-02-28T00:00:00Z", "Mon, 28 Feb 2000 00:00:00 +0000"],
      ["2000-02-29T00:00:00Z", "Tue, 29 Feb 2000 00:00:00 +0000"],
      ["2001-02-28T00:00:00Z", "Wed, 28 Feb 2001 00:00:00 +0000"],
      ["2000-03-31T00:00:00Z", "Fri, 31 Mar 2000 00:00:00 +0000"],
      ["2000-04-30T00:00:00Z", "Sun, 30 Apr 2000 00:00:00 +0000"],
      ["2000-05-31T00:00:00Z", "Wed, 31 May 2000 00:00:00 +0000"],
      ["2000-06-30T00:00:00Z", "Fri, 30 Jun 2000 00:00:00 +0000"],
      ["2000-07-31T00:00:00Z", "Mon, 31 Jul 2000 00:00:00 +0000"],
      ["2000-08-31T00:00:00Z", "Thu, 31 Aug 2000 00:00:00 +0000"],
      ["2000-09-30T00:00:00Z", "Sat, 30 Sep 2000 00:00:00 +0000"],
      ["2000-10-31T00:00:00Z", "Tue, 31 Oct 2000 00:00:00 +0000"],
      ["2000-11-30T00:00:00Z", "Thu, 30 Nov 2000 00:00:00 +0000"],
      ["2000-12-31T00:00:00Z", "Sun, 31 Dec 2000 00:00:00 +0000"],
      ["1900-01-01T00:00:00Z", "Mon, 1 Jan 1900 00:00:00 +0000"],
      ["9999-12-31T23:59:59Z", "Fri, 31 Dec 9999 23:59:59 +0000"],

      // Tests that are not actually missing:
      // We don't actually need to test daylight savings time issues, so long as
      // getTimezoneOffset is correct. We've confirmed black-box that the value
      // is being directly queried on every instance, since we have tests that
      // make MockDate.getTimezoneOffset return different values.
      // In addition, ES6 Date objects don't support leap seconds. Invalid dates
      // per RFC 5322 are handled in a later run of code.
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, { });
        handler.reset(data[1]);
        emitter.addDate(new MockDate(data[0]));
        emitter.finish(true);
      });
    });

    // An invalid date should throw an error instead of make a malformed header.
    test('Invalid dates', function () {
      let emitter = headeremitter.makeStreamingEmitter(handler, { });
      assert.throws(function () { emitter.addDate(new Date(NaN)); });
      assert.throws(function () { emitter.addDate(new Date("1850-01-01")); });
      assert.throws(function () { emitter.addDate(new Date("10000-01-01")); });
    });

    // Test preferred breaking for the date header.
    test('Break spot', function () {
      let emitter = headeremitter.makeStreamingEmitter(handler, {
        softMargin: 30
      });
      handler.reset("Overly-Long-Date:\r\n Sat, 1 Jan 2000 00:00:00 +0000");
      emitter.addHeaderName("Overly-Long-Date");
      emitter.addDate(new MockDate("2000-01-01T00:00:00Z"));
      emitter.finish();
    });

    test('Correctness of date', function () {
      let emitter = headeremitter.makeStreamingEmitter(handler, { });
      handler.reset();
      let now = new Date();
      emitter.addDate(now);
      emitter.finish();
      // All engines can parse the date strings we produce
      let reparsed = new Date(handler.output);

      // Now and reparsed should be correct to second-level precision.
      assert.equal(reparsed.getMilliseconds(), 0);
      assert.equal(now.getTime() - now.getMilliseconds(), reparsed.getTime());
    });
  });

  /**
     * Test addDate method when displayUTC flag is set. This is to support add-ons which dont want 
     * emails to contain TimeStamp information when email is sent. For example, Torbirdy add-on doesnt 
     * want timestamp to be shown as it can leak the user location.
     */
  suite("addDateAsUTCOnly", function () {
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
      ["2000-01-01T00:00:00Z", "Sat, 1 Jan 2000 00:00:00 +0000"],
      ["2000-02-01T00:00:00Z", "Tue, 1 Feb 2000 00:00:00 +0000"],
      ["2000-03-01T00:00:00Z", "Wed, 1 Mar 2000 00:00:00 +0000"],
      ["2000-04-01T00:00:00Z", "Sat, 1 Apr 2000 00:00:00 +0000"],
      ["2000-05-01T00:00:00Z", "Mon, 1 May 2000 00:00:00 +0000"],
      ["2000-06-01T00:00:00Z", "Thu, 1 Jun 2000 00:00:00 +0000"],
      ["2000-07-01T00:00:00Z", "Sat, 1 Jul 2000 00:00:00 +0000"],
      ["2000-08-01T00:00:00Z", "Tue, 1 Aug 2000 00:00:00 +0000"],
      ["2000-09-01T00:00:00Z", "Fri, 1 Sep 2000 00:00:00 +0000"],
      ["2000-10-01T00:00:00Z", "Sun, 1 Oct 2000 00:00:00 +0000"],
      ["2000-11-01T00:00:00Z", "Wed, 1 Nov 2000 00:00:00 +0000"],
      ["2000-12-01T00:00:00Z", "Fri, 1 Dec 2000 00:00:00 +0000"],

      // Test timezone offsets
      ["2000-06-01T12:00:00Z", "Thu, 1 Jun 2000 12:00:00 +0000"],
      ["2000-06-01T12:00:00+0100", "Thu, 1 Jun 2000 11:00:00 +0000"],
      ["2000-06-01T12:00:00+0130", "Thu, 1 Jun 2000 10:30:00 +0000"],
      ["2000-06-01T12:00:00-0100", "Thu, 1 Jun 2000 13:00:00 +0000"],
      ["2000-06-01T12:00:00-0130", "Thu, 1 Jun 2000 13:30:00 +0000"],
      ["2000-06-01T12:00:00+1345", "Wed, 31 May 2000 22:15:00 +0000"],
      ["2000-06-01T12:00:00-1200", "Fri, 2 Jun 2000 00:00:00 +0000"],
      ["2000-06-01T12:00:00+1337", "Wed, 31 May 2000 22:23:00 +0000"],
      ["2000-06-01T12:00:00+0101", "Thu, 1 Jun 2000 10:59:00 +0000"],
      ["2000-06-01T12:00:00-1337", "Fri, 2 Jun 2000 01:37:00 +0000"],

      //Some new cases with respect to changing Timezone to UTC 

      // Trying change of year conversion
      ["2000-12-31T12:00:00-1200", "Mon, 1 Jan 2001 00:00:00 +0000"],
      ["2001-01-01T00:00:00+1200", "Sun, 31 Dec 2000 12:00:00 +0000"],

      // Trying leap year conversion
      ["2000-02-28T12:00:00-1200", "Tue, 29 Feb 2000 00:00:00 +0000"],
      ["2000-03-01T00:00:00+1200", "Tue, 29 Feb 2000 12:00:00 +0000"],

      // Trying non-leap year conversion
      ["2001-02-28T12:00:00-1200", "Thu, 1 Mar 2001 00:00:00 +0000"],
      ["2001-03-01T00:00:00+1200", "Wed, 28 Feb 2001 12:00:00 +0000"],

      // Try some varying hour, minute, and second amounts, to double-check
      // padding and time dates.
      ["2000-06-01T01:02:03Z", "Thu, 1 Jun 2000 01:02:03 +0000"],
      ["2000-06-01T23:13:17Z", "Thu, 1 Jun 2000 23:13:17 +0000"],
      ["2000-06-01T00:05:04Z", "Thu, 1 Jun 2000 00:05:04 +0000"],
      ["2000-06-01T23:59:59Z", "Thu, 1 Jun 2000 23:59:59 +0000"],
      ["2000-06-01T13:17:40Z", "Thu, 1 Jun 2000 13:17:40 +0000"],
      ["2000-06-01T11:15:34Z", "Thu, 1 Jun 2000 11:15:34 +0000"],
      ["2000-06-01T04:09:09Z", "Thu, 1 Jun 2000 04:09:09 +0000"],
      ["2000-06-01T04:10:10Z", "Thu, 1 Jun 2000 04:10:10 +0000"],
      ["2000-06-01T09:13:17Z", "Thu, 1 Jun 2000 09:13:17 +0000"],
      ["2000-06-01T13:12:14Z", "Thu, 1 Jun 2000 13:12:14 +0000"],
      ["2000-06-01T14:16:48Z", "Thu, 1 Jun 2000 14:16:48 +0000"],

      // Try varying month, date, and year values.
      ["2000-01-31T00:00:00Z", "Mon, 31 Jan 2000 00:00:00 +0000"],
      ["2000-02-28T00:00:00Z", "Mon, 28 Feb 2000 00:00:00 +0000"],
      ["2000-02-29T00:00:00Z", "Tue, 29 Feb 2000 00:00:00 +0000"],
      ["2001-02-28T00:00:00Z", "Wed, 28 Feb 2001 00:00:00 +0000"],
      ["2000-03-31T00:00:00Z", "Fri, 31 Mar 2000 00:00:00 +0000"],
      ["2000-04-30T00:00:00Z", "Sun, 30 Apr 2000 00:00:00 +0000"],
      ["2000-05-31T00:00:00Z", "Wed, 31 May 2000 00:00:00 +0000"],
      ["2000-06-30T00:00:00Z", "Fri, 30 Jun 2000 00:00:00 +0000"],
      ["2000-07-31T00:00:00Z", "Mon, 31 Jul 2000 00:00:00 +0000"],
      ["2000-08-31T00:00:00Z", "Thu, 31 Aug 2000 00:00:00 +0000"],
      ["2000-09-30T00:00:00Z", "Sat, 30 Sep 2000 00:00:00 +0000"],
      ["2000-10-31T00:00:00Z", "Tue, 31 Oct 2000 00:00:00 +0000"],
      ["2000-11-30T00:00:00Z", "Thu, 30 Nov 2000 00:00:00 +0000"],
      ["2000-12-31T00:00:00Z", "Sun, 31 Dec 2000 00:00:00 +0000"],
      ["1900-01-01T00:00:00Z", "Mon, 1 Jan 1900 00:00:00 +0000"],
      ["9999-12-31T23:59:59Z", "Fri, 31 Dec 9999 23:59:59 +0000"],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = headeremitter.makeStreamingEmitter(handler, { useOnlyUTC: true });
        handler.reset(data[1]);
        emitter.addDate(new MockDate(data[0]));
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
        "key;\r\n param*=UTF-8''%F0%9F%92%A9"],
      [["key", {"param": "\u00e3 %"}],
        "key;\r\n param*=UTF-8''%C3%A3%20%25"],

      // Test that we don't break in the middle of a %-sign
      [["key", {"param": "aaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaa%F0%9F%92;\r\n param*1*=%A9"],
      [["key", {"param": "aaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaa%F0%9F;\r\n param*1*=%92%A9"],
      [["key", {"param": "aaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaa%F0%9F;\r\n param*1*=%92%A9"],
      [["key", {"param": "aaaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaaa%F0%9F;\r\n param*1*=%92%A9"],
      [["key", {"param": "aaaaaaa\ud83d\udca9"}],
        "key;\r\n param*0*=UTF-8''aaaaaaa%F0;\r\n param*1*=%9F%92%A9"],

      // Test that we work even on 2-digit continuation numbers
      [["key", {"param": "\ud83d\udca9".repeat(20)}],
        "key;\r\n param*0*=UTF-8''%F0%9F%92%A9;\r\n" +
                " param*1*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*2*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*3*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*4*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*5*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*6*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*7*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*8*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*9*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*10*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*11*=%F0%9F%92%A9%F0%9F;\r\n" +
                " param*12*=%92%A9%F0%9F%92%A9;\r\n" +
                " param*13*=%F0%9F%92%A9"],
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
