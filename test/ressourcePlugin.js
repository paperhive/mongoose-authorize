var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');
var bcrypt = require('bcrypt');

var utils = require('./utils');
var authorize = utils.authorize;

describe('ressourcePlugin', function () {

  // clear database before each run
  beforeEach(utils.clearDB);

  // define models
  beforeEach(function (done) {
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
      passwordHash: {type: String, select: false},
      emails: [emailSchema],
      settings: {
        rememberMe: {type: Boolean, ressource: 'settings'},
      },
      father: {type: mongoose.Schema.Types.ObjectId, ref: 'User', ressource: 'info'},
      friends: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', ressource: 'info'}]
    });
    userSchema.plugin(
      authorize.ressourcePlugin,
      {
        getRessources: function (doc, action, data, done) {
          // user has full access to info and settings
          if (data.userId === doc._id) return done(null, ['info', 'settings']);
          // everyone has read access to info
          if (action === 'read') return done(null, ['info']);
          // everything else is denied
          done(null, []);
        },
      }
    );
    userSchema.plugin(authorize.permissionsPlugin, {userModel: 'User'});

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
    mongoose.model('User', userSchema);

    // define Team
    var teamSchema = new mongoose.Schema({name: String});
    teamSchema.plugin(authorize.teamPlugin);
    mongoose.model('Team', teamSchema);

    async.waterfall([
      function createUsers (cb) {
        mongoose.model('User').create(
          {
            name: 'Luke',
            emails: [
              {address: 'luke@skywalk.er', type: 'work', visible: true}
            ]
          },
          cb
        );
      },
      //function createTeams (luke, cb) {
      //  mongoose.model('Team').create(
    ], done);

  });

  describe('#authToJSON', function () {
    it('should only return fields the user is allowed to read', function (done) {
      async.waterfall([
        function (cb) {
          mongoose.model('User').create({
            name: 'André',
            passwordHash: '0eaf4f4c',
            emails: [
              {address: 'andre@gaul.io', type: 'private', visible: true}
            ],
            settings: {rememberMe: true},
          }, {
            name: 'Schlömi',
            settings: {rememberMe: false}
          }, cb);
        },
        function (andre, schloemi, cb) {
          mongoose.model('Team').create({
            name: 'andre',
            members: {
              users: [andre]
            }
          }, function (err, team_andre) {
            cb(null, andre, schloemi, team_andre);
          });
        },
        function (andre, schloemi, team_andre, cb) {
          andre.knows = schloemi;
          andre.permissions = [
            {
              team: team_andre,
              action: 'read',
              ressource: 'info'
            }
          ];

          andre.save(cb);
        },
        function (andre, _, cb) {
          andre.setPassword(andre._id, 'doener', function (err) {
            if (err) return cb(err);
            cb(null, andre);
          });
        },
        function (andre, cb) {
          andre.populate('knows', function (err) {
            if (err) return cb(err);
            cb (null, andre);
          });
        },
        function (andre, cb) {
          andre.authorizedToJSON(andre._id, function (err, json) {
            cb(null, andre);
          });
        },
        function (andre, cb) {
          andre.authorizedToJSON('wurst', function (err, json) {
            cb();
          });
        }
      ], done);
    });
  });

});
