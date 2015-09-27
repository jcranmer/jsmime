"use strict";
define(function (require) {

var assert = require('assert');
var headerparser = require('jsmime').headerparser;

function smartDeepEqual(actual, expected) {
  assert.deepEqual(actual, expected);
  if (actual instanceof Map && expected instanceof Map) {
    assert.deepEqual([x for (x of actual.entries())],
      [y for (y of expected.entries())]);
  }
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

function testHeader(header, tests) {
  suite(header, function () {
    tests.forEach(function (data) {
      arrayTest(data, function () {
        smartDeepEqual(headerparser.parseStructuredHeader(header,
          data[0]), data[1]);
      });
    });
  });
}

function makeCT(media, sub, params) {
  var object = new Map();
  object.mediatype = media;
  object.subtype = sub;
  object.type = media + "/" + sub;
  for (let k in params)
    object.set(k, params[k]);
  return object;
}
function makeCD(isAttachment, params) {
  var object = new Map();
  object.isAttachment = isAttachment;
  for (let k in params)
    object.set(k, params[k]);
  return object;
}

suite('Structured headers', function () {
  // Ad-hoc header tests
  testHeader('Content-Type', [
    ['text/plain', makeCT("text", "plain", {})],
    ['text/html', makeCT("text", "html", {})],
    ['text/plain; charset="UTF-8"',
      makeCT("text", "plain", {charset: "UTF-8"})],
    ['text/', makeCT("text", "", {})],
    ['text', makeCT("text", "plain", {})],
    ['image/', makeCT("image", "", {})],
    ['image', makeCT("text", "plain", {})],
    ['hacker/x-mailnews', makeCT("hacker", "x-mailnews", {})],
    ['hacker/x-mailnews;', makeCT("hacker", "x-mailnews", {})],
    ['HACKER/X-MAILNEWS', makeCT("hacker", "x-mailnews", {})],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      makeCT("application",
      "vnd.openxmlformats-officedocument.spreadsheetml.sheet", {})],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;\r' +
      '\n name="Presentation.pptx"',
      makeCT("application",
      "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      {name: "Presentation.pptx"})],
    ['', makeCT("text", "plain", {})],
    ['                                        ', makeCT("text", "plain", {})],
    ['text/plain; c', makeCT("text", "plain", {})],
    ['text/plain; charset=', makeCT("text", "plain", {charset: ""})],
    ['text/plain; charset="', makeCT("text", "plain", {charset: ""})],
    ['text\\/enriched', makeCT("text\\", "enriched", {})],
    ['multipart/mixed ";" wtf=stupid', makeCT("multipart", "mixed", {})],
    ['multipart/mixed; wtf=stupid',
      makeCT("multipart", "mixed", {wtf: "stupid"})],
    ['text/plain; CHARSET=Big5', makeCT("text", "plain", {charset: "Big5"})],
    ['text/html; CHARSET="Big5"', makeCT("text", "html", {charset: "Big5"})],
    ['text/html; CHARSET="Big5', makeCT("text", "html", {charset: "Big5"})],
    [['text/html', 'multipart/mixed'], makeCT("text", "html", {})],
  ]);
  testHeader('Content-Transfer-Encoding', [
    ['', ''],
    ['8bit', '8bit'],
    ['8BIT', '8bit'],
    ['QuOtEd-PrInTaBlE', 'quoted-printable'],
    ['Base64', 'base64'],
    ['7bit', '7bit'],
    [['7bit', '8bit'], '7bit'],
    ['x-uuencode', 'x-uuencode']
  ]);
  testHeader('Content-Disposition', [
    ['inline', makeCD(false, {})],
    ['attachment', makeCD(true, {})],
    ['illegal', makeCD(true, {})],
    ['attachment; filename="filename.txt"',
      makeCD(true, {filename: "filename.txt"})],
    ['attachment; filename="filename.txt"; filename*=UTF-8\'\'oxyg%c3%a8ne.txt',
      makeCD(true, {filename: "oxyg\xe8ne.txt"})],
    ['attachment; filename="=?UTF-8?Q?oxyg=c3=a8ne.txt?="',
      makeCD(true, {filename: "oxyg\xe8ne.txt"})],
    ['inline; filename="filename.txt"',
      makeCD(false, {filename: "filename.txt"})],
    ['attachment; filename=genome.jpeg; ' +
      'modification-date="Wed, 12 Feb 1997 16:29:51 -0500"', makeCD(true, {
         filename: "genome.jpeg",
         "modification-date": new Date("1997-02-12T16:29:51-0500")
      })],
    ['inline; size=212', makeCD(false, {size: 212})],
    // TODO: Disable this test for now, since NaN !== NaN can cause problems for
    // some assert implementations (notably, the one used in xpcshell).
    //['inline; size=deadbeef', makeCD(false, {size: NaN})],
    ['attachment; filename=genome.jpeg; read-date="yesterday"', makeCD(true, {
         filename: "genome.jpeg",
         "read-date": new Date(NaN)
      })],
    ['attachment; filename=genome.jpeg; ' +
      'creation-date="31 Dec 98 23:59:60 +0000"', makeCD(true, {
         filename: "genome.jpeg",
         "creation-date": new Date("1999-01-01T00:00:00Z")
      })],
    ['attachment; filename=genome.jpeg; ' +
      'screwed-date="31 Dec 98 23:59:60 +0000"', makeCD(true, {
         filename: "genome.jpeg",
         "screwed-date": "31 Dec 98 23:59:60 +0000"
      })],
    // Testcases following copied from http://greenbytes.de/tech/tc2231/. Some
    // of the rules (e.g., refusing RFC 2047) don't apply to us since we're not
    // a browser. We also don't ignore the header on parse errors but rather try
    // to extract some sense from it.
    ['"inline"', makeCD(true, {})],
    ['inline; filename="foo.html"', makeCD(false, {filename: "foo.html"})],
    ['inline; filename="Not an attachment!"',
      makeCD(false, {filename: "Not an attachment!"})],
    ['inline; filename="foo.pdf"', makeCD(false, {filename: "foo.pdf"})],
    ['attachment', makeCD(true, {})],
    ['"attachment"', makeCD(true, {})],
    ['ATTACHMENT', makeCD(true, {})],
    ['attachment; filename="foo.html"', makeCD(true, {filename: "foo.html"})],
    ['attachment; filename="0000000000111111111122222"',
      makeCD(true, {filename: "0000000000111111111122222"})],
    ['attachment; filename="00000000001111111111222222222233333"',
      makeCD(true, {filename: "00000000001111111111222222222233333"})],
    ['attachment; filename="f\oo.html"',
      makeCD(true, {filename: "foo.html"})],
    ['attachment; filename="\\"quoting\\" tested.html"',
      makeCD(true, {filename: '"quoting" tested.html'})],
    ['attachment; filename="Here\'s a semicolon;.html"',
      makeCD(true, {filename: "Here's a semicolon;.html"})],
    ['attachment; foo="bar"; filename="foo.html"',
      makeCD(true, {foo: "bar", filename: "foo.html"})],
    ['attachment; foo="\\"\\\\";filename="foo.html"',
      makeCD(true, {foo: '"\\', filename: "foo.html"})],
    ['attachment; FILENAME="foo.html"', makeCD(true, {filename: "foo.html"})],
    ['attachment; filename=foo.html', makeCD(true, {filename: "foo.html"})],
    ['attachment; filename=foo,bar.html',
      makeCD(true, {filename: "foo,bar.html"})],
    ['attachment; filename=foo.html ;', makeCD(true, {filename: "foo.html"})],
    ['attachment; ;filename=foo', makeCD(true, {filename: "foo"})],
    ['attachment; filename=foo bar.html', makeCD(true, {filename: "foo"})],
    ['attachment; filename=\'foo.bar\'', makeCD(true, {filename: "'foo.bar'"})],
    ['attachment; filename="foo-\xe4.html"',
      makeCD(true, {filename: "foo-\xe4.html"})],
    ['attachment; filename="foo-\xc3\xa4.html"',
      makeCD(true, {filename: "foo-\xc3\xa4.html"})],
    ['attachment; filename="foo-%41.html"',
      makeCD(true, {filename: "foo-%41.html"})],
    ['attachment; filename="50%.html"', makeCD(true, {filename: "50%.html"})],
    ['attachment; filename="foo-%\\41.html"',
      makeCD(true, {filename: "foo-%41.html"})],
    ['attachment; name="foo-%41.html"', makeCD(true, {name: "foo-%41.html"})],
    ['attachment; filename="\xe3-%41.html"',
      makeCD(true, {filename: "\xe3-%41.html"})],
    ['attachment; filename="foo-%c3%a4-%e2%82%ac.html"',
      makeCD(true, {filename: "foo-%c3%a4-%e2%82%ac.html"})],
    ['attachment; filename ="foo.html"', makeCD(true, {filename: "foo.html"})],
    ['attachment; filename="foo.html"; filename="bar.html"',
      makeCD(true, {filename: "foo.html"})],
    ['attachment; filename=foo[1](2).html',
      makeCD(true, {filename: "foo[1](2).html"})],
    ['attachment; filename=foo-\xe3.html',
      makeCD(true, {filename: "foo-\xe3.html"})],
    ['attachment; filename=foo-\xc3\xa4.html',
      makeCD(true, {filename: "foo-\xc3\xa4.html"})],
    ['filename=foo.html', makeCD(true, {})],
    ['x=y; filename=foo.html', makeCD(true, {filename: "foo.html"})],
    ['"foo; filename=bar;baz"; filename=qux', makeCD(true, {filename: "bar"})],
    ['filename=foo.html, filename=bar.html', makeCD(true, {})],
    ['; filename=foo.html', makeCD(true, {filename: "foo.html"})],
    [': inline; attachment; filename=foo.html',
      makeCD(true, {filename: "foo.html"})],
    ['inline; attachment; filename=foo.html',
      makeCD(false, {filename: "foo.html"})],
    ['attachment; inline; filename=foo.html',
      makeCD(true, {filename: "foo.html"})],
    ['attachment; filename="foo.html".txt',
      makeCD(true, {filename: "foo.html"})],
    ['attachment; filename="bar', makeCD(true, {filename: "bar"})],
    ['attachment; filename=foo"bar;baz"qux', makeCD(true, {filename: "foo"})],
    ['attachment; filename=foo.html, attachment; filename=bar.html',
      makeCD(true, {filename: "foo.html,"})],
    ['attachment; foo=foo filename=bar', makeCD(true, {foo: "foo"})],
    ['attachment; filename=bar foo=foo ', makeCD(true, {filename: "bar"})],
    ['attachment filename=bar', makeCD(true, {})],
    ['filename=foo.html; attachment', makeCD(true, {})],
    ['attachment; xfilename=foo.html', makeCD(true, {xfilename: "foo.html"})],
    ['attachment; filename="/foo.html"', makeCD(true, {filename: "/foo.html"})],
    ['attachment; filename="\\\\foo.html"',
      makeCD(true, {filename: "\\foo.html"})],
    ['attachment; creation-date="Wed, 12 Feb 1997 16:29:51 -0500"',
      makeCD(true, {"creation-date": new Date("1997-02-12T16:29:51-0500")})],
    ['attachment; modification-date="Wed, 12 Feb 1997 16:29:51 -0500"',
      makeCD(true, {
        "modification-date": new Date("1997-02-12T16:29:51-0500")
      })],
    ['foobar', makeCD(true, {})],
    ['attachment; example="filename=example.txt"',
      makeCD(true, {example: "filename=example.txt"})],
    ['attachment; filename*=iso-8859-1\'\'foo-%E4.html',
      makeCD(true, {filename: "foo-\u00e4.html"})],
    ['attachment; filename*=UTF-8\'\'foo-%c3%a4-%e2%82%ac.html',
      makeCD(true, {filename: "foo-\u00e4-\u20ac.html"})],
    ['attachment; filename*=\'\'foo-%c3%a4-%e2%82%ac.html', makeCD(true, {})],
    ['attachment; filename*=UTF-8\'\'foo-a%cc%88.html',
      makeCD(true, {filename: "foo-a\u0308.html"})],
    ['attachment; filename*=iso-8859-1\'\'foo-%c3%a4-%e2%82%ac.html',
      makeCD(true, {filename: "foo-\xc3\xa4-\xe2\u201a\xac.html"})],
    ['attachment; filename*=utf-8\'\'foo-%E4.html', makeCD(true, {})],
    ['attachment; filename *=UTF-8\'\'foo-%c3%a4.html', makeCD(true, {})],
    ['attachment; filename*= UTF-8\'\'foo-%c3%a4.html',
      makeCD(true, {filename: "foo-\xe4.html"})],
    ['attachment; filename* =UTF-8\'\'foo-%c3%a4.html',
      makeCD(true, {filename: "foo-\xe4.html"})],
    ['attachment; filename*="UTF-8\'\'foo-%c3%a4.html"',
      makeCD(true, {filename: "foo-\xe4.html"})],
    ['attachment; filename*="foo%20bar.html"', makeCD(true, {})],
    ['attachment; filename*=UTF-8\'foo-%c3%a4.html',
      makeCD(true, {filename: "foo-\xe4.html"})],
    ['attachment; filename*=UTF-8\'\'foo%',
      makeCD(true, {filename: "foo%"})],
    ['attachment; filename*=UTF-8\'\'f%oo.html',
      makeCD(true, {filename: "f%oo.html"})],
    ['attachment; filename*=UTF-8\'\'A-%2541.html',
      makeCD(true, {filename: "A-%41.html"})],
    ['attachment; filename*=UTF-8\'\'%5cfoo.html',
      makeCD(true, {filename: "\\foo.html"})],
    ['attachment; filename*0="foo."; filename*1="html"',
      makeCD(true, {filename: "foo.html"})],
    ['attachment; filename*0="foo"; filename*1="\\b\\a\\r.html"',
      makeCD(true, {filename: "foobar.html"})],
    ['attachment; filename*0*=UTF-8\'\'foo-%c3%a4; filename*1=".html"',
      makeCD(true, {filename: "foo-\u00e4.html"})],
    ['attachment; filename*0="foo"; filename*01="bar"',
      makeCD(true, {filename: "foo"})],
    ['attachment; filename*0="foo"; filename*2="bar"',
      makeCD(true, {filename: "foo"})],
    ['attachment; filename*1="foo."; filename*2="html"', makeCD(true, {})],
    ['attachment; filename*1="bar"; filename*0="foo"',
      makeCD(true, {filename: "foobar"})],
    ['attachment; filename="foo-ae.html"; filename*=UTF-8\'\'foo-%c3%a4.html',
      makeCD(true, {filename: "foo-\u00e4.html"})],
    ['attachment; filename*=UTF-8\'\'foo-%c3%a4.html; filename="foo-ae.html"',
      makeCD(true, {filename: "foo-\u00e4.html"})],
    ['attachment; filename*0*=ISO-8859-15\'\'euro-sign%3d%a4; ' +
      'filename*=ISO-8859-1\'\'currency-sign%3d%a4',
      makeCD(true, {filename: "currency-sign=\u00a4"})],
    ['attachment; foobar=x; filename="foo.html"',
      makeCD(true, {foobar: "x", filename: "foo.html"})],
    ['attachment; filename==?ISO-8859-1?Q?foo-=E4.html?=',
      makeCD(true, {filename: "foo-\u00e4.html"})],
    ['attachment; filename="=?ISO-8859-1?Q?foo-=E4.html?="',
      makeCD(true, {filename: "foo-\u00e4.html"})],
  ]);

  // Non-ad-hoc header tests
  let addressing_headers = ['From', 'To', 'Cc', 'Bcc', 'Sender', 'Reply-To',
    'Resent-Bcc', 'Resent-To', 'Resent-From', 'Resent-Cc', 'Resent-Sender',
    'Approved', 'Disposition-Notification-To', 'Delivered-To',
    'Return-Receipt-To', 'Resent-Reply-To', 'Mail-Reply-To', 'Mail-Followup-To'
  ];
  let address_tests = [
    ["", []],
    ["a@example.invalid", [{name: "", email: "a@example.invalid"}]],
    ["John Doe <a@example.invalid>",
      [{name: "John Doe", email: "a@example.invalid"}]],
    ["John Doe <A@EXAMPLE.INVALID>",
      [{name: "John Doe", email: "A@EXAMPLE.INVALID"}]],
    ["=?UTF-8?B?5bGx55Sw5aSq6YOO?= <a@example.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@example.invalid"}]],
    ["undisclosed-recipients:;", [{name: "undisclosed-recipients", group: []}]],
    ["world: a@example.invalid, b@example.invalid;",
      [{name: "world", group: [
        {name: "", email: "a@example.invalid"},
        {name: "", email: "b@example.invalid"}
      ]}]],
    // TODO when we support IDN:
    // This should be \u4f8b.invalid instead (Japanese kanji for "example")
    ["\u5c71\u7530\u592a\u90ce <a@xn--fsq.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@xn--fsq.invalid"}]],
    ["\u5c71\u7530\u592a\u90ce <a@\u4f8b.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@\u4f8b.invalid"}]],
    ["\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb@\u4f8b.invalid",
      [{name: "", email:
         "\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb@\u4f8b.invalid"}]],
    [["a@example.invalid", "b@example.invalid"],
      [{name: "", email: "a@example.invalid"},
       {name: "", email: "b@example.invalid"}]],
  ];
  addressing_headers.forEach(function (header) {
    testHeader(header, address_tests);
  });

  let date_headers = ['Date', 'Expires', 'Injection-Date', 'NNTP-Posting-Date',
    'Resent-Date'];
  let date_tests = [
    ["Thu, 06 Sep 2012 08:08:21 -0700", new Date("2012-09-06T08:08:21-0700")],
    ["This is so not a date", new Date(NaN)],
  ];
  date_headers.forEach(function (header) {
    testHeader(header, date_tests);
  });

  let multiple_unstructured_headers = ['In-Reply-To', 'References'];
  let multiple_unstructured_tests = [
    ["<asdasdasd@asdasdasd.com>", "<asdasdasd@asdasdasd.com>"],
    ["<asd@asd.com> <asdf@asdf.com>", "<asd@asd.com> <asdf@asdf.com>"],

    // This test is needed for clients sending non-compliant headers, see bug 1154521
    ["<asd@asd.com>,<asdf@asdf.com>,<asdfg@asdfg.com>", "<asd@asd.com> <asdf@asdf.com> <asdfg@asdfg.com>"],
    // Test for bug 1197686
    ["<asd@asd.com><asdf@asdf.com><asdfg@asdfg.com>", "<asd@asd.com> <asdf@asdf.com> <asdfg@asdfg.com>"],
  ];
  multiple_unstructured_headers.forEach(function (header) {
    testHeader(header, multiple_unstructured_tests);
  });

  let unstructured_headers = ['Comments', 'Content-Description', 'Keywords',
    'Subject'];
  let unstructured_tests = [
    ["", ""],
    ["This is a subject", "This is a subject"],
    [["Subject 1", "Subject 2"], "Subject 1"],
    ["=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?=",
      "\u79c1\u306f\u4ef6\u540d\u5348\u524d"],
  ];
  unstructured_headers.forEach(function (header) {
    testHeader(header, unstructured_tests);
  });
});

});
