var dbURI = 'mongodb://localhost/mongoose-authorize-test';
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var authorize = require('../');

var models = {};

// define User
var userSchema = new mongoose.Schema({name: String});
models.User = mongoose.model('User', userSchema);

// define Team
var teamSchema = new mongoose.Schema({name: String});
teamSchema.plugin(authorize.teamPlugin);
models.Team = mongoose.model('Team', teamSchema);

// define Organization
var organizationSchema = new mongoose.Schema({name: String});
organizationSchema.plugin(authorize.permissionsPlugin);
models.Organization = mongoose.model('Organization', organizationSchema);

var clearDB = function (done) {
  async.series(_.flatten([
    // ensure a database connection is established
    function (cb) {
      if (mongoose.connection.db) return cb();
      mongoose.connect(dbURI, cb);
    },
    // drop collections
    function (cb) {
      mongoose.connection.db.collections(function (err, collections) {
        if (err) return cb(err);
        async.parallel(
          _.flatten(_.map(collections, function (collection) {
            if (collection.collectionName.match(/^system\./)) return [];
            return [
              // remove all documents in collection
              function (cb) {
                collection.remove({}, {safe: true}, cb);
              },
              // drop indexes in collection
              function (cb) {
                collection.dropIndexes(cb);
              }
            ];
          })),
          cb
        );
      });
    },
    // ensureIndexes
    _.map(models, function (model) {
      return model.ensureIndexes.bind(model);
    })
  ]),
  done);
};

var insertDocs = function (done) {
  async.waterfall(
    [
      // create user1 and user2
      function (cb) {
        models.User.create({name: 'nschloe'}, {name: 'andrenarchy'}, cb);
      },
      // create team1 with member user1
      function (user1, user2, cb) {
        models.Team.create(
          {name: 'team nschloe', members: {users: [user1._id] }},
          function (err, team1) {
            if (err) return cb(err);
            return cb(null, user1, user2, team1);
          }
        );
      },
      // create team2 with members user2 and team1 -> user1 and user2
      function (user1, user2, team1, cb) {
        models.Team.create(
          {
            name: 'team andrenarchy + friends',
            members: {
              users: [user2._id],
              teams: [team1._id]
            }
          },
          function (err, team2) {
            if (err) return cb(err);
            return cb(null, user1, user2, team1, team2);
          }
        );
      },
      // create orga1 with permissions
      function (user1, user2, team1, team2, cb) {
        models.Organization.create(
          {
            name: 'c-base',
            permissions: [
              // team2: user1 and user2 (via team1)
              {team: team2, action: 'read', target: 'orgaInfo'},
              // team1: user1
              {team: team1, action: 'write', target: 'orgaInfo'}
            ]
          },
          function (err, orga1) {
            if (err) return cb(err);
            cb(null, user1, user2, team1, team2, orga1);
          }
        );
      }
    ],
    done
  );
};


module.exports = {
  clearDB: clearDB,
  insertDocs: insertDocs,
  models: models
};
