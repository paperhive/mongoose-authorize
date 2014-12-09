var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');

var authorize = require('../');
var utils = require('./utils');

// clear database before each run
beforeEach(utils.clearDB);

describe('permissionPlugin', function () {
  describe('#getPermissions', function () {
    it('should return permissions with arrays of userIds', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        orga1.getPermissions(function (err, permissions) {
          if (err) return done(err);
          permissions.should.eql([
            {userIds: [user2._id, user1._id], action: 'read', ressource: 'orgaInfo'},
            {userIds: [user1._id], action: 'write', ressource: 'orgaInfo'}
          ]);
          done();
        });
      });
    });
  });

  describe('#hasPermissions', function () {
    it('should return true/false based on permissions', function (done) {
      function assertTrue(err, value) {
        if (err) return done(err);
        should(value).equal(true);
      }
      function assertFalse(err, value) {
        if (err) return done(err);
        should(value).equal(false);
      }

      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        // see definition of teams + permissions in utils.js

        // check permissions for user1
        orga1.hasPermissions(user1._id, 'write', 'orgaInfo', assertTrue);
        orga1.hasPermissions(user1._id, 'read', 'orgaInfo', assertTrue);
        orga1.hasPermissions(user1._id, 'hack', 'orgaInfo', assertFalse);

        // check permission for user2
        orga1.hasPermissions(user2._id, 'write', 'orgaInfo', assertFalse);
        orga1.hasPermissions(user2._id, 'read', 'orgaInfo', assertTrue);
        orga1.hasPermissions(user2._id, 'hack', 'orgaInfo', assertFalse);

        // check permission for unknown user
        orga1.hasPermissions('nobody', 'write', 'orgaInfo', assertFalse);
        orga1.hasPermissions('nobody', 'read', 'orgaInfo', assertFalse);
        orga1.hasPermissions('nobody', 'hack', 'orgaInfo', assertFalse);

        done();
      });
    });
  });
});
