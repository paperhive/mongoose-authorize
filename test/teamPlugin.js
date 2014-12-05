var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('underscore');

var authorize = require('../');
var utils = require('./utils');

// clear database before each run
beforeEach(utils.clearDB);

describe('teamPlugin', function () {
  describe('#getUserIds', function () {

    it('should return an empty array without members', function (done) {
      var team = new utils.models.Team({name: 'andrenarchy\'s friends'});
      team.getUserIds(function (err, userIds) {
        if (err) return done(err);
        [].should.eql(userIds);
        done();
      });
    });

    it('should return array of user ids without team members', function (done) {
      var user1 = new utils.models.User({name: 'andrenarchy'});
      var user2 = new utils.models.User({name: 'nschloe'});
      var team = new utils.models.Team({
        name: 'PaperHub',
        members: {
          users: [user1._id, user2._id]
        }
      });
      team.getUserIds(function (err, userIds) {
        if (err) return done(err);
        [user1._id, user2._id].should.eql(userIds);
        done();
      });
    });

    it('should return array of user ids for nested teams', function (done) {
      async.waterfall(
        [
          // create user1 and user2
          function (cb) {
            utils.models.User.create({name: 'nschloe'}, {name: 'andrenarchy'}, cb);
          },
          // create team1
          function (user1, user2, cb) {
            utils.models.Team.create(
              {name: 'team nschloe', members: {users: [user1._id] }},
              function (err, team1) {
                if (err) return cb(err);
                return cb(null, user1, user2, team1);
              }
            );
          },
          // create team2
          function (user1, user2, team1, cb) {
            utils.models.Team.create(
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
          }
        ],
        // test
        function (err, user1, user2, team1, team2) {
          if (err) return done(err);
          team2.getUserIds(function (err, userIds) {
            if (err) return done(err);
            [user2._id, user1._id].should.eql(userIds);
            done();
          });
        }
      );
    });
  }); // #getUserIds
}); // teamPlugin
