'use strict';
var mongoose = require('mongoose');
var erase = require('mongoose-erase');
var should = require('should');
var async = require('async');
var _ = require('lodash');

var utils = require('./utils');

describe('teamPlugin', function () {
  beforeEach(erase.connectAndErase(mongoose, utils.dbURI));
  beforeEach(utils.defineModels);

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
                cb(null, user_hondanz, user_halligalli, team_admins);
              }
            );
          },
          // create a team 'editors' with members user_halligalli and all members of team_admins
          function (user_hondanz, user_halligalli, team_admins, cb) {
            mongoose.model('Team').create(
              {
                name: 'editors',
                members: {
                  users: [user_halligalli],
                  teams: [team_admins]
                }
              },
              function (err, team_editors) {
                if (err) return cb(err);
                cb(null, user_hondanz, user_halligalli, team_editors);
              }
            );
          }],
          function (err, user_hondanz, user_halligalli, team_editors) {
            should(err).equal(null);
            team_editors.getUserIds(function (err, userIds) {
              should(err).equal(null);
              userIds.should.eql([user_halligalli._id, user_hondanz._id]);
              done();
            });
          }
        );
      }
    );

    it('should return an empty array without members', function (done) {
      var team = new (mongoose.model('Team'))({name: 'andrenarchy\'s friends'});
      team.getUserIds(function (err, userIds) {
        if (err) return done(err);
        [].should.eql(userIds);
        done();
      });
    });

    it('should return array of user ids without team members', function (done) {
      var user1 = new (mongoose.model('User'))({name: 'andrenarchy'});
      var user2 = new (mongoose.model('User'))({name: 'nschloe'});
      var team = new (mongoose.model('Team'))({
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
