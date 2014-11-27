var should = require('should');
var authorize = require('../');

describe('objectWhitelist()', function () {
  var objectWhitelist = require('../lib/objectWhitelist.js');
  var obj = {
    field1: 1,
    field2: 'foo',
    array: [1, 2, 3],
    nested: {
      field1: 2,
      field2: 'bar'
    }
  };
  it('should return undefined for an empty whitelist', function () {
    (objectWhitelist(obj) === undefined).should.be.true;
    (objectWhitelist(obj, {}) === undefined).should.be.true;
  });
  it('should return undefined for whitelist with missing keys', function () {
    (objectWhitelist(obj, {
      missingKey: true
    }) === undefined).should.be.true;
  });
});
