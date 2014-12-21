var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (config) {
  return function (schema, options) {

    // add permissions to schema
    var permissionsSchema = {};
    permissionsSchema[config.permissions] = [{
      team: {type: mongoose.Schema.Types.ObjectId, ref: config.teamModel},
      action: String,
      ressource: String
    }];
    schema.add(permissionsSchema);

    schema.methods[config.permissionsGet] =
      function (done) {
        // populate permissions[].team
        this.populate(
          config.permissions + '.team',
          function (err, doc) {
            if (err) return done(err);
            async.parallel(
              // get userIds for each permission
              _.map(doc[config.permissions], function (permission) {
                return function (cb) {
                  // get userIds for this permission
                  permission.team[config.teamGetUserIds](function (err, userIds) {
                    if (err) return cb(err);
                    // return permission object with userIds (and without team)
                    return cb(null, {
                      userIds: userIds,
                      action: permission.action,
                      ressource: permission.ressource
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
    schema.methods[config.permissionsHas] =
      function (userId, action, ressource, done) {
        this[config.permissionsGet](function (err, permissions) {
          if (err) return done(err);
          // match given parameters
          var matches = _.where(
            permissions,
            {userIds: [userId], action: action, ressource: ressource}
          );
          done(null, matches.length > 0);
        });
      };
    // check if a given user has the provided permission
    schema.methods[config.permissionsAssert] =
      function (userId, action, ressource, done) {
        this.hasPermissions(userId, action, ressource, function (err, granted) {
          if (err) return done(err);
          if (!granted) return done(new Error('permission denied'));
          done();
        });
      };
    schema.methods[config.permissionsGetRessources] =
      function (userId, action, done) {
        this[config.permissionsGet](function (err, permissions) {
          if (err) return done(err);

          var ressources = _.union(_.pluck(
            _.where(permissions, {userIds: [userId], action: action}),
            'ressource'
          ));

          return done(null, ressources);
        });
      };
  };
};
