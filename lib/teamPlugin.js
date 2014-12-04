var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');

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
  schema.methods[options.getUserIdsKey] = function (done) {
    var doc = this;

    // "un-populate" users if necessary in order to get ids
    var user_ids = _.map(doc[options.membersKey].users, function (value) {
      return value._id ? value._id : value;
    });
    doc.populate(options.membersKey + '.teams', function (err, doc) {
      if (err) return done(err);
      async.parallel(
        _.map(doc[options.membersKey].teams, function (team) {
          return team.getUserIds.bind(team);
        }),
        function (err, userIdsArray) {
          if (err) return done(err);
          done(null, user_ids.concat.apply(user_ids, userIdsArray));
        }
      );
    });
  };
};
