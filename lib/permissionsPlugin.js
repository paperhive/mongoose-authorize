var mongoose = require('mongoose');
var _ = require('underscore');

module.exports = function (schema, options) {
  options = _.defaults(_.clone(options || {}), {
    permissionsKey: 'permissions',
    getPermissionsKey: 'getPermissions',
    teamModel: 'Team',
    userModel: 'User'
  });

  // add permissions to schema
  var permissionsSchema = {};
  permissionsPlugin[options.permissionsKey] = {
    permissions: [{
      team: {type: mongoose.Schema.Types.ObjectId, ref: options.teamModel},
      action: String,
      target: String
    }]
  };
  schema.add(permissionsSchema);

  schema.methods[options.getPermissionsKey] = function (done) {
    // TODO: get permissions!
  };
};
