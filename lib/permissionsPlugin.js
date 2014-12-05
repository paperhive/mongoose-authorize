var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (schema, options) {
  options = _.defaults(_.clone(options || {}), {
    permissionsKey: 'permissions',
    getPermissionsKey: 'getPermissions',
    hasPermissionsKey: 'hasPermissions',
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

  // check if a given user has the provided permission
  schema.methods[options.hasPermissionsKey] =
    function (userId, action, target, done) {
      this[options.getPermissionsKey](function (err, permissions) {
        if (err) return done(err);
        // match given parameters
        var matches = _.where(
          permissions,
          {userIds: [userId], action: action, target: target}
        );
        done(null, matches.length > 0);
      });
    };
};
