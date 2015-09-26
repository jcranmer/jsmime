"use strict";
define(function(require) {

var emailutils = require('jsmime').emailutils;
var assert = require('assert');

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(JSON.stringify(data).replace(/[\ud800-\udfff]/g, function (m) {
    return '\\u' + m.charCodeAt(0).toString(16);
  }), fn);
}
suite('emailutils', function () {
  suite('splitEmail', function () {
    [
      ["test@example.com", "test", "example.com"],
      ['\"quotes\"@example.com', '"quotes"', "example.com"],
      ['\"quoted@blah\"@example.com', '"quoted@blah"', "example.com"],
      ["invalid"],
      ["invalid@", "invalid", ""],
      ["multi@email@example.com", "multi@email", "example.com"],
    ].forEach(function (data) {
      arrayTest(data, function () {
        if (data.length == 1)
          assert.throws(function () { emailutils.splitEmail(data[0]); });
        else
          assert.deepEqual(emailutils.splitEmail(data[0]), data.slice(1));
      });
    });
  });
  suite('isValidEmail', function () {
    [
      ["test123@example.com", true],
      ["\"unnecessary\"@example.com", false],
      ["\"unnecessary\"@example.com", false, false],
      ["\"unnecessary\"@example.com", true, true], // XXX?
      ["\"necessary quoting\"@example.com", false],
      ["\"necessary quoting\"@example.com", false, false],
      ["\"necessary quoting\"@example.com", true, true],
      [".not.a.dot.atom@example.com", true],
      ["Really invalid", false],
      ["invalid", false],
      ["user@", false],
      ["@domain", false],
      ["\"Quite invalid@domain", true, false],
      // XXX["more@invalid\"domain", false],
      // Every non-alphanumeric non-special ASCII character.
      ["!#$%&'*+-/=?^_`{}|~@example.com", true],
      // All the specials
      ["(@example.com", true, false],
      [")@example.com", true, false],
      ["<@example.com", true, false],
      [">@example.com", true, false],
      ["[@example.com", true, false],
      ["]@example.com", true, false],
      [":@example.com", true, false],
      [";@example.com", true, false],
      ["@@example.com", true, false],
      ["\\@example.com", true, false],
      [",@example.com", true, false],
      ["\"@example.com", true, false],
      ["needs quotes@example.com", true, false],
      // C0 and C1 controls are simply not valid
      ["\x13@example.com", true, false],
      ["\"\x13\"@example.com", true, false],
      ["\x91@example.com", true, false],
      ["\"\x91\"@example.com", true, false],
      // EAI and IDN emails
      ["\ud83d\udca9@\u2603.net", true],
      //["\ud83d\udca9@\ud83d.net", false], // unpaired surrogate in DNS -> false
      //["\ud83d@\u2603.net", true], // XXX: unpaired surrogate, what to do?
      //["\udca9@\u2603.net", true], // XXX: unpaired surrogate, what to do?
      ["a\u0300@example.com", false], // Not in NFC
      ["\u00e0@example.com", true], // Latin miniscule a with grave accent
      ["\u0300@example.com", true], // Combining character
      ["user@xn--u-ccb", false], // xn--u-ccb is an invalid label
      ["user@\u0300example.de", false], // No combining character start
      ["user@example\u3002com", true],
      // XXX: More. Far more are needed.
      // IP addresses in the right-hand side.
      ["user@[127.0.0.1]", false, false],
      ["user@[127.0.0.1]", true, true],
      ["user@[IPv6:::1]", true, true],
      ["user@[IPv6:fe80::12bf:48ff:fefb:61f3]", true, true],
      ["user@[IPv6:fe80::12bf:48ff:127.0.0.1]", true, true],
      ["user@[IPv6:fe80::]", true, true],
      ["user@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329]", true, true],
      ["user@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329]", true, true],
      ["user@[IPv6:FE80:0:0:0:202:B3FF:FE1E:8329]", true, true],
      // :: must compress at least two fields
      ["user@[IPv6:FE80:0:0::202:B3FF:FE1E:8329]", true, false],
      ["user@[IPv6:FE80:0::202:B3FF:FE1E:8329]", true, true],
      ["user@[IPv6:FE80::202:B3FF:FE1E:8329]", true, true],
      ["user@[IPv6:FE80:0:0:0:202:B3FF:8.8.8.8]", true, true],
      ["user@[IPv6:FE80:0:0::202:B3FF:8.8.8.8]", true, false],
      ["user@[IPv6:FE80:0::202:B3FF:8.8.8.8]", true, true],
      ["user@[IPv6:::8.8.8.8]", true, true],
      ["user@[ipv6:::8.8.8.8]", true, true],
      // Bad IP addresses
      //XXX["user@[", true, false],
      ["user@[daydreamingbob]", true, false],
      ["user@[::1]", true, false],
      ["user@[8.8.8.8.8]", true, false],
      ["user@[8.8.8]", true, false],
      ["user@[1024.0.0.1]", true, false],
      // XXX: IPv4 address literals are loosely matched
      //["user@[256.0.0.1]", true, false],
      ["user@[IPv6:2001:db8::1::1]", true, false],
      ["user@[IPv6:::g]", true, false],
      ["user@[IPv6:::00000]", true, false],
      ["user@[IPv6:FE80:0:0:0:202:B3FF:0:8.8.8.8]", true, false],
      ["user@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329:0]", true, false],
      ["user@[meow:catscan]", true, false],
    ].forEach(function (data) {
      arrayTest(data, function () {
        if (data.length == 2)
          assert.equal(emailutils.isValidEmail(data[0]), data[1]);
        else if (data.length == 3)
          assert.equal(emailutils.isValidEmail(data[0], data[1]), data[2]);
      });
    });
  });
  suite('canonicalize and makeDisplayable', function () {
    [
      ["test123@example.com", "test123@example.com"],
      ["\"unnecessary\"@example.com", "unnecessary@example.com"],
      ["\"necessary quoting\"@example.com", '"necessary quoting"@example.com'],
      [".not.a.dot.atom@example.com", ".not.a.dot.atom@example.com"],
      ["\"fancy \\\" me\"@example.com", "\"fancy \\\" me\"@example.com"],
      // XXX["more@invalid\"domain", false],
      // Every non-alphanumeric non-special ASCII character.
      ["!#$%&'*+-/=?^_`{}|~@example.com", "!#$%&'*+-/=?^_`{}|~@example.com"],
      ["(@example.com", '"("@example.com'],
      ["\\@example.com", '"\\\\"@example.com'],
      ["needs quotes@example.com", '"needs quotes"@example.com'],
      // Test our case folding
      ["USER@EXAMPLE.COM", "USER@example.com"],
      // EAI and IDN emails
      ["\ud83d\udca9@\u2603.net", "\ud83d\udca9@xn--n3h.net",
        "\ud83d\udca9@\u2603.net"],
      ["\ud83d\udca9@XN--N3H.net", "\ud83d\udca9@xn--n3h.net",
        "\ud83d\udca9@\u2603.net"],
      ["user@bu\u0308cher.de", "user@xn--bcher-kva.de", "user@b\u00fccher.de"],
      // We want transitional processing: sharp ss -> ss
      ["user@fa\u00df.de", "user@fass.de"],
      // ZWJ/ZWNJ handling
      ["user@\u0DC1\u0DCA\u200D\u0DBB\u0DD3.com", "user@xn--10cl1a0b.com",
        "user@\u0dc1\u0dca\u0dbb\u0dd3.com"],
      ["user@\u0DC1\u0DCA\u0DBB\u0DD3.com", "user@xn--10cl1a0b.com",
        "user@\u0dc1\u0dca\u0dbb\u0dd3.com"],
      // Final sigma
      ["user@\u03B2\u03CC\u03BB\u03BF\u03C2.com", "user@xn--nxasmq6b.com",
        "user@\u03b2\u03cc\u03bb\u03bf\u03c3.com"],
      ["user@\u03B2\u03CC\u03BB\u03BF\u03C3.com", "user@xn--nxasmq6b.com",
        "user@\u03b2\u03cc\u03bb\u03bf\u03c3.com"],
      // A-labels that can't be reached in transitional processing but can be in
      // non-transitional.
      ["user@xn--fa-hia.de", "user@xn--fa-hia.de", "user@fa\u00df.de"],
      // Case mapping per UTS #46.
      ["user@a\u0300.example", "user@xn--0ca.example", "user@\u00e0.example"],
      ["user@A\u0300.example", "user@xn--0ca.example", "user@\u00e0.example"],
      ["a\u0300@example.com", "\u00e0@example.com"], // Not in NFC
      ["A\u0300@example.com", "\u00c0@example.com"], // Not in NFC
      ["\u00e0@example.com", "\u00e0@example.com"],
      ["\u0300@example.com", "\u0300@example.com"], // Combining character
      // This sequence is an NFC instability issue that was fixed in Unicode 4.
      ["user@\u1100\u0300\u1161", "user@xn--ksa182emia",
        "user@\u1100\u0300\u1161"],
      ["user@example\u3002com", "user@example.com"],
      // What do we do if an IDNA address is invalid?
      ["user@xn--A-ECP.ru", "user@xn--a-ecp.ru"],
      // Unicode homograph attack XXX: show punycode
      ["user@g\u03bf\u03bfgle.com", "user@xn--ggle-0nda.com",
        "user@g\u03bf\u03bfgle.com"],
      // IP addresses in the right-hand side.
      ["user@[127.0.0.1]", "user@[127.0.0.1]"],
      ["user@[IPv6:::1]", "user@[ipv6:::1]"],
      // Note that we don't try to convert IP addresses into a canonical format.
      // They're rare enough as it is, and the logic (especially for IPv6
      // addresses) is difficult. We're only going to normalize to lowercase for
      // different hex values.
      ["user@[127.000.000.001]", "user@[127.000.000.001]"],
      ["user@[IPv6:0::1]", "user@[ipv6:0::1]"],
      ["user@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329]",
        "user@[ipv6:fe80:0000:0000:0000:0202:b3ff:fe1e:8329]"],
      ["user@[IPv6:ffff::127.0.0.1]", "user@[ipv6:ffff::127.0.0.1]"],
    ].forEach(function (data) {
      arrayTest(data, function () {
        assert.equal(emailutils.canonicalize(data[0]), data[1]);
        assert.equal(emailutils.makeDisplayable(data[0]),
          data.length == 2 ? data[1] : data[2]);
      });
    });
  });
  suite('areEquivalent', function () {
    [
      ["test123@example.com", "test123@example.com", true],
      ["test123@example.com", "test123@example.com", true, true],
      ["test123@example.com", "test123@example.com", false, true],
      ["TEST123@example.com", "test123@example.com", true, false],
      ["TEST123@example.com", "test123@example.com", false, true],
      ["test123@\u00c1.com", "test123@\u00e1.com", true, true],
      ["\"unnecessary\"@example.com", "unnecessary@example.com", true],
      ["test@[127.0.0.1]", "test@[IPv6:::1]", false],
      ["test@[IPV6:::1]", "test@[ipv6:::1]", true],
      ["test@[IPV6:::1]", "test@[ipv6:::1]", true, true],
      ["test@[127.0.0.1]", "test@[", false],
      // EAI and IDN emails
      ["\ud83d\udca9@\u2603.net", "\ud83d\udca9@\u2603.net", true],
      ["\ud83d\udca9@\u2603.net", "\ud83d\udca9@xn--n3h.net", false, true],
      ["\ud83d\udca9@\u2603.net", "\ud83d\udca9@xn--n3h.net", true, true],
      ["a\u0300@example.com", "\u00e0@example.com", true],
      ["a\u0300@example.com", "\u00e0@example.com", false, true],
      // \uffe1 (fullwidth pound sign) is in NFC but not NFKC form.
      ["\uffe1@example.com", "\u00a3@example.com", true],
      ["\uffe1@example.com", "\u00a3@example.com", false, true],
      ["\uffe1@example.com", "\u00a3@example.com", true, false],
      // Map deviation domains properly. Faß should not equal fass, even in
      // non-strict mode.
      ["user@fass.de", "user@xn--fa-hia.de", false],
      ["user@fass.de", "user@xn--fa-hia.de", false, false],
      ["user@fass.de", "user@xn--fa-hia.de", true, false],
      // Let's try a few invalid emails to see if the code breaks
      ["user@xn--A-ECP.ru", "user@xn--a-ecp.ru", true],
      ["\ud83d@\ud83d.net", "\ud83d@\ud83d.net", true],
    ].forEach(function (data) {
      arrayTest(data, function () {
        if (data.length == 3)
          assert.equal(emailutils.areEquivalent(data[0], data[1]), data[2]);
        else if (data.length == 4)
          assert.equal(emailutils.areEquivalent(data[0], data[1], data[2]),
            data[3]);
      });
    });
  });
});

});
