var _ = require('underscore');

/*
  obj may be any of
   * null
   * boolean
   * number
   * string
   * array
   * object
  where array and values in an object are again of the above types.
*/
module.exports = function cloneWhitelisted (obj, whitelist) {
  if (obj === undefined || !whitelist) return undefined;

  // simply return whitelisted null, boolean, number and string objs
  if (whitelist === true) {
    if (!_.isNull(obj) && !_.isBoolean(obj) &&
        !_.isNumber(obj) && !_.isString(obj)) {
      throw new Error('obj is not null, boolean, number or string');
    }
    return obj;
  }

  var clone;
  // process array
  if (_.isArray(whitelist)) {
    if (whitelist.length != 1) {
      throw new Error('whitelist arrays have to be of length 1');
    }
    if (!_.isArray(obj)) {
      throw new Error('whitelist is an array while obj is not');
    }
    clone = [];
    _.each(obj, function (value) {
      var valueClone = cloneWhitelisted(value, whitelist[0]);
      // omit element if undefined
      if (valueClone !== undefined) {
        clone.push(valueClone);
      }
    });
    return clone;
  }

  // process object
  if (_.isObject(whitelist) && !_.isFunction(whitelist)) {
    if (!_.isObject(obj)) {
      throw new Error('whitelist is object while obj is not');
    }
    clone = {};
    _.each(obj, function (value, key) {
      var valueClone = cloneWhitelisted(value, whitelist[key]);
      // omit element if undefined
      if (valueClone !== undefined) {
        clone[key] = valueClone;
      }
    });
    return clone;
  }

  throw new Error('whitelist cannot be processed');
};
