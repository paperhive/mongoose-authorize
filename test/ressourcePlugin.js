var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');
var bcrypt = require('bcrypt');

var authorize = require('../');
var utils = require('./utils');

describe('ressourcePlugin', function () {

  describe('#authToJSON', function () {
    it('should only return fields the user is allowed to read', function (done) {
      function ressourcePlugin(schema, options) {

        schema.methods.authorizedToJSON = function () {
          var ret = {};
        };
      }

      var getEmailRessource = function (doc) {
        return doc.visible ? 'contactVisible' : 'contactHidden';
      };
      var emailSchema = new mongoose.Schema({
        address: {type: String, ressource: getEmailRessource},
        type: {type: String, ressouceClass: getEmailRessource},
        visible: {type: Boolean, ressource: 'contactSettings'}
      });

      var userSchema = new mongoose.Schema({
        name: {type: String, ressource: 'info'},
        passwordHash: String,
        emails: [emailSchema],
        settings: {
          rememberMe: {type: Boolean, ressource: 'settings'}
        }
      });
      userSchema.plugin(ressourcePlugin, {ressource: 'info'});
      userSchema.plugin(authorize.permissionsPlugin);

      userSchema.methods.setPassword = function (userId, password, done) {
        var user = this;
        async.waterfall([
          // check permission
          function (cb) {
            if (userId != user._id) return cb(new Error('permission denied'));
            cb();
          },
          // generate salt
          function (cb) {
            bcrypt.genSalt(10, cb);
          },
          // generate hash
          function (salt, cb) {
            bcrypt.hash(password, salt, cb);
          },
          // store password
          function (hash, cb) {
            user.passwordHash = hash;
            cb();
          }
        ], done);
      };

      var User = mongoose.model('User1', userSchema);

      User.create({
        name: 'André',
        passwordHash: '0eaf4f4c',
        emails: [
          {address: 'andre@gaul.io', type: 'private', visible: true}
        ],
        settings: {rememberMe: true}
      }, function (err, user) {
        if (err) return done(err);
        user.setPassword(user._id, 'pass', function (err) {
          if (err) return done(err);
          done();
        });
      });
    });
  });

});
