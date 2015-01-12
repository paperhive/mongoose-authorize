'use strict';
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (config) {
  // note: options is currently unused
  return function (schema, options) {
    // add users + teams arrays to schema
    var teamSchema = {};
    teamSchema[config.teamMembers] = {
      users: [{type: mongoose.Schema.Types.ObjectId, ref: config.teamUserModel}],
      teams: [{type: mongoose.Schema.Types.ObjectId, ref: config.teamModel}]
    };
    schema.add(teamSchema);

    // add getUserIds function
    schema.methods[config.teamGetUserIds] = function (done, visitedTeams) {
      // has this team already been processed?
      var id = this._id.toString();
      if (visitedTeams && _.contains(visitedTeams, id)) {
        return done(null, []);
      }
      if (!visitedTeams) visitedTeams = [];
      visitedTeams.push(id);

      var doc = this;

      // "un-populate" users if necessary in order to get ids
      var user_ids = _.map(doc[config.teamMembers].users, function (value) {
        return value._id ? value._id : value;
      });
      doc.populate(config.teamMembers + '.teams', function (err, doc) {
        if (err) return done(err);
        async.parallel(
          _.map(doc[config.teamMembers].teams, function (team) {
            return function (cb) {
              team[config.teamGetUserIds](cb, visitedTeams);
            };
          }),
          function (err, userIdsArray) {
            if (err) return done(err);
            done(null, user_ids.concat.apply(user_ids, userIdsArray));
          }
        );
      });
    };
  };
};
