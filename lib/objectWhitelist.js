var _ = require('underscore');
module.exports = function (object, whitelist) {
  if (!object || !whitelist) return undefined;

  var pickKeys = _.compact(_.map(whitelist, function (value, key) {
    return value===true ? key : null;
  }));
  var res = _.pick(object, pickKeys);

  var objectKeys = _.compact(_.map(whitelist, function (value, key) {
    return _.isObject(value) && !_.isArray(value) && !_.isFunction(value) ?
      key : null;
  }));
  _.each(objectKeys, function (key) {
    res[key] = getWhitelisted(object[key], whitelist[key]);
  });

  return _.size(res) ? res : undefined;
};
