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
    it(
      'should allow insertion of users and teams as described in the docs',
      function (done) {
        async.waterfall([
          // create a user
          function (cb) {
            mongoose.model('User').create({name: 'hondanz'}, {name: 'halligalli'}, cb);
          },
          // create a team 'admins' with member user_hondanz
          function(user_hondanz, user_halligalli, cb) {
            mongoose.model('Team').create(
              {
                name: 'admins',
                members: {
                  users: [user_hondanz],
                  teams: []
                }
              },
              function (err, team_admins) {
                if (err) return cb(err);
                cb(null, user_halligalli, team_admins);
              }
            );
          },
          // create a team 'editors' with members user_halligalli and all members of team_admins
          function (user_halligalli, team_admins, cb) {
            mongoose.model('Team').create(
              {
                name: 'editors',
                members: {
                  users: [user_halligalli],
                  teams: [team_admins]
                }
              },
              cb
            );
          }],
          done
        );
      }
    );

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
      utils.insertDocs(function (err, user1, user2, team1, team2) {
        if (err) return done(err);
        team2.getUserIds(function (err, userIds) {
          if (err) return done(err);
          [user2._id, user1._id].should.eql(userIds);
          done();
        });
      });
    });
    it('should detect team cycles', function(done) {
      utils.insertDocs(function (err, user1, user2, team1, team2) {
        if (err) return done(err);
        team1.members.teams.push(team2);
        team1.save(function (err, team1) {
          if (err) return done(err);
          team1.getUserIds(function (err, userIds) {
            if (err) return done(err);
            [user1._id, user2._id].should.eql(userIds);
            done();
          });
        });
      });
    });
  }); // #getUserIds
}); // teamPlugin
