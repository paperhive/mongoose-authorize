var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (schema, options) {
  options = _.defaults(_.clone(options || {}), {
    membersKey: 'members',
    getUserIdsKey: 'getUserIds',
    userModel: 'User',
    teamModel: 'Team',
  });

  // add users + teams arrays to schema
  var teamSchema = {};
  teamSchema[options.membersKey] = {
    users: [{type: mongoose.Schema.Types.ObjectId, ref: options.userModel}],
    teams: [{type: mongoose.Schema.Types.ObjectId, ref: options.teamModel}]
  };
  schema.add(teamSchema);

  // add getUserIds function
  schema.methods[options.getUserIdsKey] = function (done, visitedTeams) {
    // has this team already been processed?
    if (visitedTeams && _.contains(visitedTeams, String(this._id))) {
      return done(null, []);
    }
    if (!visitedTeams) visitedTeams = [];
    visitedTeams.push(String(this._id));

    var doc = this;

    // "un-populate" users if necessary in order to get ids
    var user_ids = _.map(doc[options.membersKey].users, function (value) {
      return value._id ? value._id : value;
    });
    doc.populate(options.membersKey + '.teams', function (err, doc) {
      if (err) return done(err);
      async.parallel(
        _.map(doc[options.membersKey].teams, function (team) {
          return function (cb) {
            team[options.getUserIdsKey](cb, visitedTeams);
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
