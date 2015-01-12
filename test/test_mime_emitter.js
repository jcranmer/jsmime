"use strict";
define(function(require) {

var assert = require('assert');
var jsmime = require('jsmime');
var MimeEmitter = jsmime.MimeEmitter;

function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++)
    typedarray[i] = buffer.charCodeAt(i);
  return typedarray;
}

function StringHandler() {
  this.string = "";
  this._decoder = new TextDecoder("UTF-8");
}
StringHandler.prototype.deliverData = function (data) {
  this.string += this._decoder.decode(data, {stream: true});
};
StringHandler.prototype.deliverEOF = function () {
  this.string += this._decoder.decode();
};

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

suite('MimeEmitter', function () {
  suite('computeEncodingStats', function () {
    let tests = [
      ["", {
        length: 0,
        maxLine: 0,
        hasBinary: false,
        has8Bit: false,
        numQPChars: 0
      }],
      ["Text\nnot\nusing\nCRLF", {
        length: 19,
        maxLine: 19,
        hasBinary: true,
        has8Bit: true,
        numQPChars: 3,
      }],
      ["Text\rnot\rusing\rCRLF", {
        length: 19,
        maxLine: 19,
        hasBinary: true,
        has8Bit: true,
        numQPChars: 3,
      }],
      ["Text\r\n\r\nusing\r\nCRLF", {
        length: 19,
        maxLine: 5,
        hasBinary: false,
        has8Bit: false,
        numQPChars: 0,
      }],
      ["With some \xe4 chars", {
        length: 17,
        maxLine: 17,
        hasBinary: false,
        has8Bit: true,
        numQPChars: 1,
      }],
      ["With some \x00 chars", {
        length: 17,
        maxLine: 17,
        hasBinary: true,
        has8Bit: true,
        numQPChars: 1,
      }],
      ["\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f" +
       "\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f", {
         length: 32,
         maxLine: 32,
         hasBinary: true,
         has8Bit: true,
         numQPChars: 31
      }],
    ];
    tests.forEach(function (data) {
      arrayTest(data, function () {
        let array = stringToTypedArray(data[0]);
        assert.deepEqual(MimeEmitter.computeEncodingStats(array), data[1]);
      });
    });
  });

  suite("API abuse", function () {
    test("Invalid body", function () {
      let leafEmitter = new MimeEmitter("image/gif");
      let multipartEmitter = new MimeEmitter("multipart/alternative");

      assert.throws(function () { multipartEmitter.setBody(""); },
        "multipart/* MIME parts may not have bodies");
      assert.throws(function () { leafEmitter.addChild(leafEmitter); },
        "Only multipart/* MIME parts may have children");

      // This is legal, since we can change the Content-Type later...
      // XXX: No it ain't...
      assert.doesNotThrow(function () { leafEmitter.setBody("") });
      assert.throws(function () {
        leafEmitter.addHeader("content-type", "multipart/alternative");
      }, "Can't set Content-Type after the body is set");
      assert.throws(function () {
        leafEmitter.addHeader("Content-Type", "image/jpeg");
      }, "Can't set Content-Type after the body is set");

      assert.doesNotThrow(function () {
        multipartEmitter.addChild(leafEmitter);
      });
      assert.throws(function () {
        multipartEmitter.addHeader("content-type", "text/plain");
      }, "Can't set Content-Type after the body is set");
      assert.throws(function () {
        multipartEmitter.addHeader("content-type", "multipart/alternative");
      }, "Can't set Content-Type after the body is set");
    });
  });

  suite('Leaf parts', function () {
    let tests = [
      ['Basic text/plain', 'text/plain', "This is some text.\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: 7bit\r\n" +
        "\r\n" +
        "This is some text.\r\n"],
      ['EOL conversion', 'text/plain', "Line 1\nLine 2\rLine 3\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: 7bit\r\n" +
        "\r\n" +
        "Line 1\r\nLine 2\r\nLine 3\r\n"],
      ['Non-ASCII text', 'text/plain', "dioxyg\u00e8ne\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: 8bit\r\n" +
        "\r\n" +
        "dioxyg\u00e8ne\r\n"],
      ['Binary text', 'text/plain', "\u0000Text with null\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: quoted-printable\r\n" +
        "\r\n" +
        "=00Text with null\r\n"],
      ['Binary and 8bit text', 'text/plain', "\u0000Null\u00A0text block\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: quoted-printable\r\n" +
        "\r\n" +
        "=00Null=C2=A0text block\r\n"],
      ['Binary text (base64)', 'text/plain', "\u0000\r\n",
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: base64\r\n" +
        "\r\n" +
        btoa("\u0000\r\n") + "\r\n"],
      ['HTML', 'text/html', "<blink>\ud83d\udca9</blink>\n",
        "Content-Type: text/html; charset=UTF-8\r\n" +
        "Content-Transfer-Encoding: 8bit\r\n" +
        "\r\n" +
        "<blink>\ud83d\udca9</blink>\r\n"],
    ];
    tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = new MimeEmitter(data[1]);
        emitter.setBody(data[2]);
        let handler = new StringHandler();
        emitter.writeOutput(handler, {});
        assert.equal(handler.string, data[3]);
      });
    });
  });

  suite('Base64 encoding of bodies', function () {
    function breakEvery40(str) {
      var lines = [];
      while (str.length > 40) {
        lines.push(str.substring(0, 40));
        str = str.substring(40);
      }
      lines.push(str);
      return lines.join('\r\n');
    }
    let tests = [
      ['Empty text', '', ''],
      ['30 characters', '1234567890'.repeat(5),
        breakEvery40(btoa('1234567890'.repeat(5)))],
    ];
    tests.forEach(function (data) {
      arrayTest(data, function () {
        let emitter = new MimeEmitter("text/plain; charset=UTF-8");
        emitter.addHeader("Content-Transfer-Encoding", "base64");
        emitter.setBody(data[1]);
        let handler = new StringHandler();
        emitter.writeOutput(handler, {
          softMargin: 42 // Not divisible by 4!
        });
        assert.equal(handler.string,
          "Content-Type: text/plain; charset=UTF-8\r\n" +
          "Content-Transfer-Encoding: base64\r\n\r\n" +
          data[2] + '\r\n');
      });
    });
  });
});

});
