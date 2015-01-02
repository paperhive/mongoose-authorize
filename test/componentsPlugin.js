'use strict';
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
        lightsaber: {type: String, component: 'info'}
      },
      father: {type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'},
      siblings: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'}]
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
    mongoose.model('User', userSchema);

    // define Team
    var teamSchema = new mongoose.Schema({name: String});
    teamSchema.plugin(authorize.teamPlugin);
    mongoose.model('Team', teamSchema);

    async.waterfall([
      function createUsers (cb) {
        mongoose.model('User').create(
          {
            name: 'Luke', passwordHash: '0afb5c',
            settings: {rememberMe: true, lightsaber: 'blue'},
            emails: [
              {address: 'luke@skywalk.er', type: 'family', visible: true}
            ]
          },
          {
            name: 'Leia', passwordHash: 'caffee',
            settings: {rememberMe: true, lightsaber: 'blue'},
            emails: [
              {address: 'leia@skywalk.er', type: 'family', visible: false},
              {address: 'leia@rebels.io', type: 'work', visible: true}
            ]
          },
          {
            name: 'Darth', passwordHash: 'd4c18b',
            settings: {rememberMe: false, lightsaber: 'red'}
          },
          cb
        );
      },
      function setFamily (luke, leia, darth, cb) {
        luke.father = darth;
        luke.siblings = [leia];
        leia.father = darth;
        leia.siblings = [luke];
        async.parallel(_.map([luke, leia], function (doc) {
          return function (cb) {doc.save(cb);};
        }), cb);
      }
    ], done);
  });

  // get the users as key-value pairs
  function getUsers(cb) {
    async.series({
      // get luke
      luke: function (cb) {
        mongoose.model('User').findOne({name: 'Luke'}, cb);
      },
      // get leia and populate everything
      leia: function (cb) {
        mongoose.model('User').findOne({name: 'Leia'}).
          populate('father siblings').exec(cb);
      },
      // get darth and populate everything
      darth: function (cb) {
        mongoose.model('User').findOne({name: 'Darth'}, cb);
      }
    }, cb);
  }

  function getLukeForEveryone (docs) {
    return {
      _id: docs.luke._id.toString(),
      name: 'Luke',
      emails: [{address: 'luke@skywalk.er', type: 'family',
        _id: docs.luke.emails[0]._id.toString()}],
      father: docs.darth._id.toString(),
      settings: {lightsaber: 'blue'},
      siblings: [docs.leia._id.toString()]
    };
  }

  function getLukeForLuke (docs) {
    var luke = getLukeForEveryone(docs);
    luke.settings.rememberMe = true;
    luke.emails[0].visible = true;
    return luke;
  }

  function getLeiaForEveryone (docs) {
    return {
      _id: docs.leia._id.toString(),
      name: 'Leia',
      settings: {lightsaber: 'blue'},
      emails: [{address: 'leia@rebels.io', type: 'work',
        _id: docs.leia.emails[1]._id.toString()}],
      father: getDarthForEveryone(docs),
      siblings: [getLukeForEveryone(docs)],
    };
  }

  function getLeiaForLeia (docs) {
    var leia = getLeiaForEveryone(docs);
    leia.settings.rememberMe = true;
    leia.emails = [
      {address: 'leia@skywalk.er', type: 'family',
        _id: docs.leia.emails[0]._id.toString(), visible: false},
      {address: 'leia@rebels.io', type: 'work',
        _id: docs.leia.emails[1]._id.toString(), visible: true}
    ];
    return leia;
  }

  function getDarthForEveryone (docs) {
    return {
      _id: docs.darth._id.toString(),
      name: 'Darth',
      settings: {lightsaber: 'red'}
    };
  }

  describe('#authToJSON', function () {

    describe('all documents', function () {

      it('should not return fields without component', function (done) {
        getUsers(function (err, docs) {
          async.series(_.map(docs, function (doc) {
            return function (cb) {
              doc.authorizedToJSON(doc._id, function (err, json) {
                should.not.exist(json.passwordHash);
                cb();
              });
            };
          }), done);
        });
      });
    }); // all docs

    describe('unpopulated document (luke)', function () {

      it('should return authorized fields for everyone', function (done) {
        getUsers(function (err, docs) {
          docs.luke.authorizedToJSON(null, function (err, json) {
            json.should.eql(getLukeForEveryone(docs));
            done();
          });
        });
      });

      it('should return authorized fields for luke', function (done) {
        getUsers(function (err, docs) {
          docs.luke.authorizedToJSON(docs.luke._id, function (err, json) {
            json.should.eql(getLukeForLuke(docs));
            done();
          });
        });
      });
    }); // unpopulated doc

    describe('populated document (leia)', function () {

      it('should return authorized fields for everyone', function (done) {
        getUsers(function (err, docs) {
          docs.leia.authorizedToJSON(null, function (err, json) {
            json.should.eql(getLeiaForEveryone(docs));
            done();
          });
        });
      });

      it('should return authorized fields for leia', function (done) {
        getUsers(function (err, docs) {
          docs.leia.authorizedToJSON(docs.leia._id, function (err, json) {
            json.should.eql(getLeiaForLeia(docs));
            done();
          });
        });
      });
    }); // populated doc

  }); // #authToJSON

});
