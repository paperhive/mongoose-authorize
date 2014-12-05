var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');

module.exports = function (schema, options) {
  options = _.defaults(_.clone(options || {}), {
    permissionsKey: 'permissions',
    getPermissionsKey: 'getPermissions',
    getUserIdsKey: 'getUserIds',
    teamModel: 'Team',
    userModel: 'User'
  });

  // add permissions to schema
  var permissionsSchema = {};
  permissionsSchema[options.permissionsKey] = [{
    team: {type: mongoose.Schema.Types.ObjectId, ref: options.teamModel},
    action: String,
    target: String
  }];
  schema.add(permissionsSchema);

  schema.methods[options.getPermissionsKey] =
    function (done) {
      // populate permissions[].team
      this.populate(
        options.permissionsKey + '.team',
        function (err, doc) {
          if (err) return done(err);
          async.parallel(
            // get userIds for each permission
            _.map(doc[options.permissionsKey], function (permission) {
              return function (cb) {
                // get userIds for this permission
                permission.team[options.getUserIdsKey](function (err, userIds) {
                  if (err) return cb(err);
                  // return permission object with userIds (and without team)
                  return cb(null, {
                    userIds: userIds,
                    action: permission.action,
                    target: permission.target
                  });
                });
              };
            }),
            done
          );
        }
      );
    };
};
