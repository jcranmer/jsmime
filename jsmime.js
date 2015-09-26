define(function(require) {
  return {
    emailutils: require('./emailutils'),
    MimeParser: require('./mimeparser'),
    headerparser: require('./headerparser'),
    headeremitter: require('./headeremitter')
  }
});
