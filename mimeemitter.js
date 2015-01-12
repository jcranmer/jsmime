define(function(require) {
/**
 * XXX: This module implements the code for emitting structured representations of
 * MIME headers into their encoded forms. The code here is a companion to,
 * but completely independent of, jsmime.headerparser: the structured
 * representations that are used as input to the functions in this file are the
 * same forms that would be parsed.
 */

"use strict";

var base64 = require('./base64');
var mimeutils = require('./mimeutils');
var headeremitter = require('./headeremitter');
var headerparser = require('./headerparser');

// Some constants for various common characters we need to process
const NUL = 0x00;
const TAB = 0x09;
const LF  = 0x0a;
const CR  = 0x0d;
const SP  = 0x20;
const EQ  = 0x3d;

/**
 * Given an input Uint8Array, compute encoding statistics to help determine the
 * optimal encoding to use for this part.
 */
function computeEncodingStats(data) {
  let stats = {
    length: data.length,
    maxLine: 0,
    has8Bit: false,
    hasBinary: false,
    numQPChars: 0
  };
  let lineLength = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] == NUL) {
      stats.hasBinary = true;
      stats.numQPChars++;
    } else if (data[i] == LF) {
      // This is binary because unpaired CRs and LFs are considered binary
      // data in messages.
      stats.hasBinary = true;
      stats.numQPChars++;
    } else if (data[i] == CR) {
      if (i + 1 < data.length && data[i + 1] == LF) {
        // This is a CRLF combo, so it's the end of the line
        if (lineLength > stats.maxLine)
          stats.maxLine = lineLength;
        lineLength = 0;
        i++; // Skip the LF
        continue; // Skip incrementing the line length at the end.
      }

      // If we're here, this is a bare CR. Similar scenario to a bare LF.
      stats.hasBinary = true;
      stats.numQPChars++;
    } else if (data[i] >= 0x80) {
      stats.has8Bit = true;
      stats.numQPChars++;
    } else if (data[i] < 0x20 && data[i] != TAB) {
      stats.numQPChars++;
    }
    // Increment the number of chars in the line.
    lineLength++;
  }

  // Check the final last line length.
  if (lineLength > stats.maxLine)
    stats.maxLine = lineLength;
  // If there's a binary char, it's also 8-bit.
  if (stats.hasBinary)
    stats.has8Bit = true;
  return stats;
}

let hexdigits = [];
for (let i = 0; i < 10; i++)
  hexdigits[i] = 0x30 + i; // '0'
for (let i = 0; i < 6; i++)
  hexdigits[10 + i] = 0x41 + i; // 'A' + n
function computeQP(ch) {
  return [hexdigits[Math.floor(ch / 16)], hexdigits[ch % 16]];
}

function QPEncoder(output, options) {
  this._lastWasCR = false;
  this._currentLength = 0;
  this._maxLength = options.softMargin;
  this._buffer = new Uint8Array(this._maxLength + 2);
  this._index = 0;
  this._output = output;
}
QPEncoder.prototype.deliverData = function (data) {
  for (let i = 0; i < data.length; i++) {
    let ch = data[i];

    // If our last character was a CR, we didn't emit it. So we need to check if
    // the next character is LF (and do newline handling then). If it's not, we
    // need to emit an encoded version of CR.
    if (this._lastWasCR) {
      this._lastWasCR = false;
      if (ch == LF) { // CRLF pair. Work out what to do at the end of a line.
        // If the last character is whitespace, we can't let the line end here.
        if (this._index > 0 && (this._buffer[this._index - 1] == SP ||
                                this._buffer[this._index - 1] == TAB)) {
          // Replace the character with an '=' character.
          let ws = this._buffer[this._index - 1];
          this._buffer[this._index - 1] = EQ;
          if (this._currentLength + 2 <= this._maxLength) {
            // There's enough space to squeeze a =XX here.
            this._shiftOctets(computeQP(ws));
          } else {
            // Not enough space. Add a soft line break and then squeeze in the
            // =XX.
            this._shiftOctets([CR, LF, EQ].concat(computeQP(ws)));
          }
        }

        // Emit the CRLF combo and reset line-tracking parameters.
        this._shiftOctets([CR, LF]);
        this._currentLength = 0;
        continue;
      }

      // Ooops, not a CRLF pair. Encode the CR character and continue as normal.
      this._sendChars([EQ, 0x30, 0x44]); // '=' '0' 'D'
    }

    // If the next character is a CR, it may begin a CRLF pair. Handle this when
    // we see the LF part of it.
    if (ch == CR) {
      this._lastWasCR = true;
      continue;
    }
    let encode = false;
    if (ch > 0x20 && ch < 0x7f && ch != EQ) {
      // 7-bit, printable character, excluding =.
      this._sendChars([ch]);
    } else if (ch == SP || ch == TAB) {
      // Space or tab character.
      this._sendChars([ch]);
    } else {
      // 8-bit character. Hide from QP.
      this._sendChars([EQ].concat(computeQP(ch)));
    }
  }
};

QPEncoder.prototype.deliverEOF = function () {
  if (this._lastWasCR)
    this._sendChars([EQ, 0x30, 0x44]); // '=' '0' 'D'
  if (this._index > 0)
    this._output.deliverData(this._buffer.subarray(0, this._index));
  this._output.deliverEOF();
};

QPEncoder.prototype._shiftOctets = function (vals) {
  // The important thing to note here is that we flush when we want to add
  // another character to a full buffer, and not when the buffer is full. This
  // is highly desirable: it lets us edit the last character we sent out should
  // the need arise (i.e., whitespace at the end of a line).
  while (vals.length > this._buffer.length - this._index) {
    let amount = this._buffer.length - this._index;
    this._buffer.set(vals.slice(0, amount), this._index);
    this._output.deliverData(this._buffer);
    this._buffer = new Uint8Array(this._buffer.length);
    this._index = 0;
    vals = vals.slice(amount);
  }
  this._buffer.set(vals, this._index);
  this._index += vals.length;
  return;
};

QPEncoder.prototype._sendChars = function (vals) {
  let numChars = vals.length;
  if (numChars + this._currentLength >= this._maxLength) {
    // Is the line too long? Insert an '=' CR LF (encoded CRLF combo).
    this._shiftOctets([EQ, CR, LF]);
    this._currentLength = 0;
  }
  this._currentLength += numChars;
  this._shiftOctets(vals);
};

function Base64Encoder(output, options) {
  this._output = output;
  // Find the number of bytes to write out per line. The softMargin parameter
  // tells us how many characters we need to have prior to a CRLF. Since every
  // three input characters make four output characters, multiply by 3/4 to
  // find the actual number of characters. Round down so that every input line
  // is a perfect multiple of 3.
  this._bytesToEncode = Math.trunc(options.softMargin / 4) * 3;
  this._saved = [];
}
Base64Encoder.prototype.deliverData = function (data) {
  // If there isn't enough data to encode a single byte, save the data and do
  // nothing.
  if (data.length + this._saved.length < this._bytesToEncode) {
    this._saved = this._saved.concat(Array.prototype.slice.call(data));
    return;
  }

  // Concatenate the saved data with the first portion of the data, and save
  // that off. We only use this if there is any saved data, so we can avoid a
  // copy.
  if (this._saved.length) {
    let headData = new Uint8Array(this._bytesToEncode);
    let copyLength = this._bytesToEncode - this._saved.length;
    headData.set(this._saved, 0);
    headData.set(data.subarray(0, copyLength), this._saved.length);
    this._output.deliverData(base64.encodeToTypedArray(headData));
    this._output.deliverData(new Uint8Array([CR, LF]));
    data = data.subarray(copyLength);
  }

  // While we can encode entire lines at once, do so.
  while (data.length > this._bytesToEncode) {
    this._output.deliverData(base64.encodeToTypedArray(
      data.subarray(0, this._bytesToEncode)));
    this._output.deliverData(new Uint8Array([CR, LF]));
    data = data.subarray(this._bytesToEncode);
  }

  // Save off any leftover data.
  this._saved = Array.prototype.slice.call(data);
};
Base64Encoder.prototype.deliverEOF = function () {
  if (this._saved.length > 0) {
    this._output.deliverData(base64.encodeToTypedArray(this._saved));
  }
  // Guarantee end with CRLF
  this._output.deliverData(new Uint8Array([CR, LF]));
  this._output.deliverEOF();
};

function NullEncoder(output) {
  this._output = output;
}
NullEncoder.prototype.deliverData = function (data) {
  if (Array.isArray(data))
    this._output.deliverData(new Uint8Array(data));
  else
    this._output.deliverData(data);
};
NullEncoder.prototype.deliverEOF = function () {
  this._output.deliverEOF();
};

function UTF8Handler(handler) {
  this._output = handler;
  this._encoder = new TextEncoder("UTF-8");
}
UTF8Handler.prototype.deliverData = function (str) {
  this._output.deliverData(this._encoder.encode(str));
};
UTF8Handler.prototype.deliverEOF = function () {
};

function canonicalizeHeader(headerName, value) {
  if (typeof value == "string") {
    try {
      let parsed = headerparser.parseStructuredHeader(headerName, value);
      if (typeof parsed != "string")
        return parsed;
    } catch (e) {
    }
  }
  return value;
}

/**
 * A class that emits MIME messages as Uint8Array blocks.
 *
 * This class supports emitting either multipart/* blocks (by use of addChild)
 * or regular leaf MIME parts (via setBody). MIME headers can be modified by
 * using addHeader or addHeaders. Modifying headers or the contents of the body
 * can only be done until someone requests that this message be streamed to
 * output, at which point no further operations may be done on this class.
 */
function MimeEmitter(contentType) {
  this._headers = new Map();
  this.addHeader('content-type', contentType);
  this._body = null;
  this._children = null;
  this._startedStream = false;
}

MimeEmitter.prototype.addHeader = function (headerName, value) {
  headerName = headerName.toLowerCase();

  // Are we allowed to set this header? We can't do this at just any time...
  if (headerName == 'content-type' &&
      (this._body != null || this._children != null))
    throw new Error("Can't set Content-Type after the body is set");

  if (this._startedStream)
    throw new Error("Can't set headers after writing has started");

  value = canonicalizeHeader(headerName, value);
  this._headers.set(headerName, value);
};

MimeEmitter.prototype.addHeaders = function (headerMap) {
  headerMap.forEach(function (value, headerName) {
    this.addHeader(headerName, value);
  }, this);
};

MimeEmitter.prototype.addChild = function (child) {
  let isMultipart = this._headers.get('content-type').mediatype == 'multipart';
  if (!isMultipart)
    throw new Error("Only multipart/* MIME parts may have children");

  if (this._startedStream)
    throw new Error("Can't add children after writing has started");

  if (this._children == null)
    this._children = [];
  this._children.push(child);
};

/**
 * Set the body of this MIME part to the given contents.
 *
 * The body can be in multiple formats, and the format used impacts how the
 * message is streamed:
 * * Uint8Array - The exact octets of the body are preserved. If the body type
 *                does not end in a CRLF, then it's guaranteed that decoding of
 *                the body will not end in a CRLF, even if this is a top-level
 *                part. Bare LF and CF octets are never converted to CRLF.
 * * String - The contents of the body will be encoded as UTF-8, and line
 *            endings are normalized to CRLF (this allows for using 8-bit body
 *            parts where acceptable). This format is only supported when the
 *            Content-Type is text/*.
 */
MimeEmitter.prototype.setBody = function (body) {
  let isMultipart = this._headers.get('content-type').mediatype == 'multipart';
  if (isMultipart)
    throw new Error("multipart/* MIME parts may not have bodies");

  if (this._startedStream)
    throw new Error("Can't set the body after writing has started");

  this._body = body;
};

MimeEmitter.prototype.writeOutput = function (handler, options) {
  if (this._startedStream)
    throw new Error("Message writing already in progress");

  if (this._body == null && this._children == null)
    throw new Error("MIME parts need either a body or a child");

  options = mimeutils.validateEmitterOptions(options);

  this._startedStream = true;

  let encoderClass = this._finalizeHeaders(options);

  // Encode all of the headers in one go.
  let headerHandler = new UTF8Handler(handler);
  let streamedEmitter = headeremitter.makeStreamingEmitter(headerHandler,
      options);
  this._headers.forEach(function (value, headerName) {
    streamedEmitter.addStructuredHeader(headerName, value);
  });
  streamedEmitter.finish(false);

  // Send the CRLF that separates the body.
  handler.deliverData(new Uint8Array([CR, LF]));

  let eof = handler.deliverEOF.bind(handler);
  handler.deliverEOF = function () {};

  // Do we have children? Or a body?
  if (this._children != null) {
    let boundary = this._headers.get('content-type').get('boundary');
    this._children.forEach(function (child) {
      headerHandler.deliverData('\r\n--' + boundary + '\r\n');
      child.writeOutput(handler, options);
    });
    headerHandler.deliverData('\r\n--' + boundary + '--\r\n');
  } else {
    let encoder = new encoderClass(handler, options);
    encoder.deliverData(this._body);
    encoder.deliverEOF();
  }
  eof();
};

MimeEmitter.prototype._finalizeHeaders = function (options) {
  let ct = this._headers.get('content-type');
  if (this._children != null) {
    // In this case, we have a multipart blurb. Make sure that we're multipart/
    // and also choose a boundary if we haven't.
    if (ct.mediatype != 'multipart')
      throw new Error("Only multipart/* types may have children");

    if (this._headers.has('content-transfer-encoding'))
      throw new Error("Content-Transfer-Encoding cannot be set on multipart/*");

    if (!ct.has('boundary')) {
      // Produce a pseudo-random string for the boundary. We include a ":" in
      // the string to guarantee that the boundary parameter is quoted. The
      // string is constructed to be long but still fit on one line (the line
      // will be 75 octets long if multipart/alternative is the Content-Type).
      let randomBytes = new Uint8Array(15);
      for (let i = 0; i < randomBytes.length; i++)
        randomBytes[i] = Math.floor(Math.random() * 256);
      let boundaryStr = "--_:" +
        btoa(mimeutils.typedArrayToString(randomBytes)) + "_--";
      ct.set('boundary', boundaryStr);
    }

    return null;
  }

  // We're a leaf part. First, convert the body to a Uint8Array if it isn't.
  if (typeof this._body == "string") {
    if (ct.mediatype != 'text')
      throw new Error("String body types need to be text/*");

    if (ct.has('charset') && ct.get('charset').toLowerCase() != 'utf-8')
      throw new Error("Only UTF-8 conversion for bodies is supported");

    this._body = this._body.replace(/\r\n|[\r\n]/g, "\r\n");

    ct.set('charset', 'UTF-8');
    this._body = new TextEncoder('UTF-8').encode(this._body);
  }

  if (!(this._body instanceof Uint8Array))
    throw new Error("Only strings or Uint8Arrays accepted as bodies");

  let cte = null;

  if (!this._headers.has("content-transfer-encoding")) {
    // No CTE? Pick one.
    let stats = computeEncodingStats(this._body);

    if (!stats.hasBinary && !stats.has8Bit &&
        stats.maxLine <= options.softMargin) {
      cte = '7bit';
    } else if (options.allow8Bit && !stats.hasBinary &&
        stats.maxLine <= options.softMargin) {
      cte = '8bit';
    } else if (options.allowBinary) {
      cte = 'binary';
    } else {
      // We're either mandatory 8-bit or binary, but our transport won't let us
      // use those. We need to encode, so estimate Base64 versus QP.
      let qpSize = stats.length + 2 * stats.numQPChars;
      let base64Size = stats.length * 4 / 3;
      if (qpSize <= base64Size)
        cte = 'quoted-printable';
      else
        cte = 'base64';
    }

    this._headers.set('content-transfer-encoding', cte);
  } else {
    cte = this._headers.get('content-transfer-encoding').toLowerCase();
  }

  if (cte == '7bit' || cte == '8bit' || cte == 'binary')
    return NullEncoder;
  else if (cte == 'base64')
    return Base64Encoder;
  else if (cte == 'quoted-printable')
    return QPEncoder;

  throw new Error("Unknown Content-Transfer-Encoding: " + cte);
};

MimeEmitter.computeEncodingStats = computeEncodingStats;

return Object.freeze(MimeEmitter);

});
