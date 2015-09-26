define(function(require) {
"use strict";

var mimeutils = require('./mimeutils');

/**
 * Split an email address into its localpart and domain constituents.
 *
 * @param {String} email The email address to split.
 * @return {String[]} An array of two elements, the first being the localpart
 *                    and the second being the domain.
 */
function splitEmail(email) {
  let at = email.lastIndexOf("@");
  if (at == -1)
    throw new Error("Invalid email");

  let localpart = email.substr(0, at).trim();
  let domain = email.substr(at + 1).trim();
  return [localpart, domain];
}

const IPv4re = /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/;

/**
 * Returns true if the email address is a valid email address.
 *
 * The notion of email address validity is rather complicated, in no small part
 * due to the existence of email addresses that theoretically work but are very
 * unlikely to be usable by many mailers. The latter kinds of addresses are, by
 * default, not considered valid by this method; accepting these email addresses
 * can be done by passing true to the allowRare parameter.
 *
 * Note: this method may return true for email addresses that are valid but are
 * not encoded in the most usable form for further processing (e.g., wrong IDN
 * format or improper normalization). Other functions in this module are capable
 * of converting email addresses to such forms.
 *
 * @param email     {String}  The email address to be validated.
 * @param allowRare {Boolean} If true (defaults to false), allow more, rarer
 *                            forms of email addresses to be considered valid.
 * @return {Boolean} Whether or not the email address is valid.
 */
function isValidEmail(email, allowRare) {
  // Start by breaking up the email address. If splitEmail fails, then we
  // clearly have an invalid address.
  try {
    var [localpart, domain] = splitEmail(email);
  } catch (e) {
    return false;
  }

  // Need non-empty localpart and domains
  if (localpart.length == 0 || domain.length == 0)
    return false;

  // Local part rules: it either must be a valid quoted-text or it should be a
  // text that does not need quoting. We apply some leniency to the last rule in
  // that extra `.' characters in the localpart don't fail validation.
  if (allowRare && localpart[0] == '"') {
    if (!/^"([^\\"]|\\.)*"$/.test(localpart))
      return false;
    // XXX: forbid overly-quoted email addresses?
  } else {
    // The following set of characters are the list of specials from RFC 5322,
    // excepting the . character. Also include whitespace characters (although
    // TAB, VT, CR, and LF will be forbidden by the next rule).
    if (/[()<>[\]:;@\\," ]/.exec(localpart))
      return false;
  }

  // Additionally, RFC 5321 forbids C0 controls and DEL. The EAI specification
  // doesn't explicitly say if it forbids C1 controls, but forbidding one and
  // not the other isn't exactly a wise idea.
  if (/[\x00-\x1f\x7f-\x9f]/.exec(localpart))
    return false;

  // The localpart should be in NFC form. Not required by RFC 6530, but ensuring
  // that non-NFC labels don't get considered will probably be more beneficial
  // for slightly-EAI-aware applications.
  if (localpart.normalize("NFC") != localpart)
    return false;

  // Now, consider the domain. There are two cases. The first case is a manual
  // IPv4 or IPv6 address literal. The other is a regular or IDN domain. Start
  // by checking if we have a literal.
  if (domain.startsWith('[') && domain.endsWith(']')) {
    if (!allowRare)
      return false;

    // Address literal. IPv4 should be [127.0.0.1]. IPv6 is [IPv6:::1]. Note
    // that IPv6 is case insensitive.
    domain = domain.toLowerCase();
    if (domain.startsWith('[ipv6:')) {
      // Cut down to the purported IPv6 address. We'll match this according to
      // the IPv6-addr production in RFC 5321.
      let ipv6 = domain.slice(6, -1);
      let quads = ipv6.split(':');
      let maxQuads = 8;

      // Too few components (need at least 2 colons).
      if (quads.length < 3)
        return false;

      if (IPv4re.test(quads[quads.length - 1])) {
        // The last component can be an IPv4 address instead. In this case, we
        // can only have fewer quads, and we don't want to consider the IPv4
        // part any further.
        maxQuads = 6;
        quads.pop();
      }

      // A :: counts for an unknown number of quads, and this is represented by
      // having an empty group. If this occurs at the beginning or the end, we
      // end up with two empty identifiers. Detect this and delete one of them.
      if (quads[0] === '' && quads[1] === '')
        quads.shift();
      else if (quads[quads.length - 2] === '' && quads[quads.length - 1] === '')
        quads.pop();

      let seenEmpty = false;
      for (let i = 0; i < maxQuads && i < quads.length; i++) {
        // Empty quad?
        if (quads[i] === '') {
          // We found two empty quads -> invalid.
          if (seenEmpty)
            return false;
          seenEmpty = true;
          // An empty quad must stand for at least two 0 fields.
          maxQuads--;
          continue;
        }

        // Not a valid quad.
        if (!/^[0-9a-f]{1,4}$/.test(quads[i]))
          return false;
      }

      // Too many quads.
      if (quads.length > maxQuads)
        return false;

      // Too few.
      if (!seenEmpty && quads.length < maxQuads)
        return false;
    } else {
      // This ought to be a valid IPv4 address literal.
      if (!IPv4re.test(domain.slice(1, -1)))
        return false;
    }

    // We've finished validating IP address literals. If we've gotten here, it's
    // valid.
    return true;
  }

  // Now we're down to regular domains. We're going to rely primarily on the
  // domainToASCII conversion. This is going to catch a small amount of illegal
  // domains (for example, ACE-encoded labels which decode to something that
  // looks like an ACE-encoded label), but it doesn't catch everything if
  // useStd3ASCII rules aren't applied (i.e., if people implement the URL spec
  // correctly).
  try {
    URL.domainToASCII(domain);
  } catch (e) {
    return false;
  }

  // XXX: Should we apply better filters here? Checking for absence of ;, ', ",
  // or space, for example, would go a long way to eliminating SQL injection,
  // for example.
  return true;
}

/**
 * Canonicalize the email address into a stable form.
 *
 * This function guarantees that if canonicalize(a) == canonicalize(b), then a
 * and b necessarily route to the same mailbox. Note that the converse does not
 * necessarily hold true. Canonicalization lets consumers ignore the impact of
 * case-insensitive domain names or multiple variant forms of IDN domains.
 *
 * In the case of IDN email addresses, the ASCII form is the one that is used
 * as the canonical form. To select the Unicode form, use the function
 * makeDisplayable instead.
 *
 * This function may throw if isValidEmail(email, true) is false, but it does
 * not necessarily do so for all cases.
 *
 * @param email {String} The email address to be canonicalized.
 * @return {String} The canonicalized form of the email address.
 */
function canonicalize(email) {
  let [localpart, domain] = splitEmail(email);

  // Normalize the localpart to the minimally-quoted string necessary.
  if (localpart.startsWith('"') && localpart.endsWith('"'))
    localpart = localpart.slice(1, -1).replace(/\\(.?)/g, "$1");

  // EAI doesn't specify how to normalize a local-part for a client. In
  // practice, the internet generally expects NFC normalization. Unless
  // implementation experience dictates otherwise, by forcing NFC normalization,
  // we should produce the least surprises overall.
  localpart = localpart.normalize("NFC");
  localpart = mimeutils.quoteIfNeeded(localpart, "()<>[]:;@\\,\" ");

  if (domain.startsWith('[') && domain.endsWith(']')) {
    // Domain is an IPv4 or an IPv6 address literal. The lower-casing is to
    // standardize both the case of ipv6: and the case of hex digits. We could
    // do more stringent normalization (e.g., 127.000.000.001 -> 127.0.0.1), but
    // IP addresses in email addresses tend to be rare and the logic is involved
    // and just simply not worth it.
    domain = domain.toLowerCase();
  } else {
    // domainToASCII can throw (e.g., xn--a-ecp.ru). In that case, return the
    // domain name lower-cased. This isn't necessarily a correct answer, but it
    // does guarantee that this method should never throw.
    try {
      domain = URL.domainToASCII(domain).toLowerCase();
    } catch (e) {
      domain = domain.toLowerCase();
    }
  }
  return localpart + '@' + domain;
}

/**
 * Convert an email address into a form suitable for display to an end user.
 *
 * This is essentially equivalent to canonicalize, except that IDN domain names
 * are sometimes displayed in Unicode instead of ASCII. The algorithm to
 * determine the display of Unicode is intended to help mitigate Unicode
 * homograph attacks, so the results of this function is not guaranteed to
 * remain stable across different versions of JSMime. For a stable version,
 * please use canonicalize instead.
 *
 * @param email {String} The email address to be made displayable.
 * @return {String} A user-displayable form of the email address.
 */
function makeDisplayable(email) {
  let [localpart, domain] = splitEmail(canonicalize(email));
  try {
    domain = URL.domainToUnicode(domain);
  } catch (e) {
    // If domainToUnicode fails, just return its original value.
  }
  return localpart + "@" + domain;
}

/**
 * Compare two email addresses for equality.
 *
 * There are two different modes of equality for email addresses. "Strict"
 * equality strictly follows the specification and is basically equivalent to
 * canonicalize(email1) == canonicalize(email2). Non-"strict" equality (the
 * default) additionally tries to match case-insensitively, which is more
 * natural and expected for end users.
 *
 * @param email1 {String}  The first email to compare.
 * @param email2 {String}  The second email to compare.
 * @param strict {Boolean} If true (defaults to false), do not try to match
 *                         case-insensitively.
 * @return {Boolean} Whether or not the two email addresses are equivalent.
 */
function areEquivalent(email1, email2, strict) {
  let [local1, domain1] = splitEmail(canonicalize(email1));
  let [local2, domain2] = splitEmail(canonicalize(email2));

  // If we're non-strict, we want to match the localparts via NFKC
  // case-insensitivity.
  if (strict !== true) {
    local1 = local1.normalize("NFKC").toLowerCase();
    local2 = local2.normalize("NFKC").toLowerCase();
  }

  return local1 == local2 && domain1 == domain2;
}

return {
  areEquivalent: areEquivalent,
  canonicalize: canonicalize,
  isValidEmail: isValidEmail,
  makeDisplayable: makeDisplayable,
  splitEmail: splitEmail,
};
});
