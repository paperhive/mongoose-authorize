var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('underscore');

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
            {userIds: [user2._id, user1._id], action: 'read', target: 'orgaInfo'},
            {userIds: [user1._id], action: 'write', target: 'orgaInfo'}
          ]);
          done();
        });
      });
    });
  });
});
