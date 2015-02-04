'use strict';
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
      component: String
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
                      userIds: _.map(userIds, String),
                      action: permission.action,
                      component: permission.component
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
      function (userId, action, component, done) {
        this[config.permissionsGet](function (err, permissions) {
          if (err) return done(err);
          // match given parameters
          var matches = _.where(
            permissions,
            {userIds: [userId.toString()], action: action, component: component}
          );
          done(null, matches.length > 0);
        });
      };

    // check if a given user has the provided permission
    schema.methods[config.permissionsAssert] =
      function (userId, action, component, done) {
        this.hasPermissions(userId, action, component, function (err, granted) {
          if (err) return done(err);
          if (!granted) return done(new Error('permission denied'));
          done();
        });
      };

    // get all components where the specified user has the permission to carry
    // out the specified action
    schema.methods[config.permissionsGetComponents] =
      function (userId, action, done) {
        this[config.permissionsGet](function (err, permissions) {
          if (err) return done(err);

          var components = _.union(_.pluck(
            _.where(permissions, {userIds: [userId.toString()], action: action}),
            'component'
          ));

          return done(null, components);
        });
      };
  };
};
