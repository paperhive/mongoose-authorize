'use strict';
var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');

var utils = require('./utils');

describe('permissionPlugin', function () {

  beforeEach(utils.clearDB);
  beforeEach(utils.defineModels);

  describe('#getPermissions', function () {
    it('should return permissions with arrays of userIds', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        orga1.getPermissions(function (err, permissions) {
          if (err) return done(err);
          permissions.should.eql([
            {userIds: [user2._id, user1._id], action: 'read', component: 'orgaInfo'},
            {userIds: [user1._id], action: 'write', component: 'orgaInfo'}
          ]);
          done();
        });
      });
    });
  }); // getPermissions

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
  }); // hasPermission

  describe('#getComponents', function () {
    it('should return the list of valid components for an action', function (done) {

      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        // see definition of teams + permissions in utils.js

        function checkComponents(target, userId, action, expected) {
          return function (cb) {
            target.getComponents(userId, action, function (err, components) {
              if (err) return cb(err);
              components.should.eql(expected);
              cb();
            });
          };
        }

        async.series([
          checkComponents(orga1, user1._id, 'read', ['orgaInfo']),
          checkComponents(orga1, user2._id, 'write', [])
        ], done);
      });
    });
  }); // getComponents
});
