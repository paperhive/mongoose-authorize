var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');
var bcrypt = require('bcrypt');

var utils = require('./utils');
var authorize = utils.authorize;

describe('componentsPlugin', function () {

  // clear database before each run
  beforeEach(utils.clearDB);

  // define models
  beforeEach(function (done) {
    var getEmailComponent = function (doc, done) {
      return done(null, doc.visible ? 'contactVisible' : 'contactHidden');
    };
    var emailSchema = new mongoose.Schema({
      address: {type: String, component: getEmailComponent},
      type: {type: String, component: getEmailComponent},
      visible: {type: Boolean, component: 'contactSettings'}
    });

    var userSchema = new mongoose.Schema({
      name: {type: String, component: 'info'},
      passwordHash: {type: String},
      emails: [emailSchema],
      settings: {
        rememberMe: {type: Boolean, component: 'settings'},
      },
      father: {type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'},
      friends: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'}]
    });
    userSchema.plugin(
      authorize.componentsPlugin,
      {
        permissions: {
          defaults: {
            read: ['info', 'contactVisible']
          },
          fromFun: function (doc, userId, action, done) {
            // user has full access to info and settings
            if (doc._id.equals(userId)) return done(
              null,
              ['info', 'settings', 'contactVisible', 'contactHidden',
              'contactSettings']
            );
            // everyone has read access to info
            if (action === 'read') return done(null, ['info']);
            // everything else is denied
            done(null, []);
          },
        }
      }
    );
    userSchema.plugin(authorize.permissionsPlugin, {userModel: 'User'});

    userSchema.methods.setPassword = function (userId, password, done) {
      var user = this;
      async.waterfall([
        // check permission
        function (cb) {
          if (!user._id.equals(userId)) return cb(new Error('permission denied'));
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
            name: 'Luke', passwordHash: '0afb5c', settings: {rememberMe: true}
          },
          {
            name: 'Darth', passwordHash: 'd4c18b', settings: {rememberMe: false}
          },
          cb
        );
      },
      function setFather (luke, darth, cb) {
        luke.father = darth;
        luke.save(cb);
      },
      function populate (luke, _, cb) {
        luke.populate('father', cb);
      },
      function print (luke, cb) {
        cb();
      }
    ], done);

  });

  describe('#authToJSON', function () {
    it('should only return fields the user is allowed to read', function (done) {
      // check a document
      function checkAuthorizedToJSON(doc, userId, expected) {
        return function (cb) {
          doc.authorizedToJSON(userId, undefined, function (err, json) {
            if (err) return cb(err);
            json.should.eql(expected);
            cb();
          });
        };
      }
      mongoose.model('User').findOne({name: 'Luke'}).populate('father').exec(
        function (err, luke) {
          mongoose.model('User').findOne({name: 'Darth'}, function (err, darth) {
            async.series([
              checkAuthorizedToJSON(luke, luke._id, {
                name: 'Luke', settings: {rememberMe: true},
                father: {name: 'Darth', _id: darth._id.toString()},
                _id: luke._id.toString()
              }),
              checkAuthorizedToJSON(luke, darth._id, {
                name: 'Luke',
                father: {name: 'Darth', _id: darth._id.toString(),
                  settings: {rememberMe: false}
                },
                _id: luke._id.toString()
              })
            ],
            done);
          });
        }
      );
    });
  });

});
