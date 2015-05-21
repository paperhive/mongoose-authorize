'use strict';
var mongoose = require('mongoose');
var erase = require('mongoose-erase');
var should = require('should');
var async = require('async');
var _ = require('lodash');

var utils = require('./utils');

describe('permissionPlugin', function () {

  beforeEach(erase.connectAndErase(mongoose, utils.dbURI));
  beforeEach(utils.defineModels);

  describe('#getPermissions', function () {
    it('should return permissions with arrays of userIds', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        orga1.getPermissions(function (err, permissions) {
          if (err) return done(err);
          permissions.should.eql([
            {userIds: [user2._id.toString(), user1._id.toString()],
              action: 'read', component: 'orgaInfo'},
            {userIds: [user1._id.toString()], action: 'write',
              component: 'orgaInfo'}
          ]);
          done();
        });
      });
    });
  }); // getPermissions

  describe('#hasPermissions', function () {
    it('should return true/false based on permissions', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        if (err) return done(err);
        // see definition of teams + permissions in utils.js

        async.series(_.map([
          // check permissions for user1
          [user1._id, 'write', 'orgaInfo', true],
          [user1._id, 'read', 'orgaInfo', true],
          [user1._id, 'hack', 'orgaInfo', false],
          // check permission for user2
          [user2._id, 'write', 'orgaInfo', false],
          [user2._id, 'read', 'orgaInfo', true],
          [user2._id, 'hack', 'orgaInfo', false],
          // check permission for unknown user
          ['nobody', 'write', 'orgaInfo', false],
          ['nobody', 'read', 'orgaInfo', false],
          ['nobody', 'hack', 'orgaInfo', false]
        ], function (arr) {
          return function (cb) {
            return orga1.hasPermissions(arr[0], arr[1], arr[2], function (err, val) {
              if (err) return cb(err);
              should(val).equal(arr[3]);
              cb();
            });
          };
        }), done);
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
