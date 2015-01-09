/* jshint expr: true */
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
      siblings: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'}],
      tags: {
        type: [String],
        component: 'tags'
      },
      complexTags: {
        type: [{
          name: {type: String, component: 'tags'},
          color: {type: String, component: 'tags'},
          secret: String
        }],
        component: 'tags'
      }
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
              'contactSettings', 'accountArray', 'tags']
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
            ],
            complexTags: [{name: '+1', color: 'green', secret: 'topsecret'}]
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
      siblings: [docs.leia._id.toString()],
    };
  }

  function getLukeForLuke (docs) {
    var luke = getLukeForEveryone(docs);
    luke.settings.rememberMe = true;
    luke.emails[0].visible = true;
    luke.complexTags = [{name: '+1', color: 'green', 
      _id: docs.luke.complexTags[0]._id.toString()}];
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

  describe('#authorizedToJSON', function () {

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

  }); // #authorizedToJSON

  describe('#authorizedSet', function () {

    function checkauthorizedSet (doc, userId, json, done) {
      return doc.authorizedSet(json, userId, function (err) {
        if (err) return done(err);
        return doc.save(done);
      });
    }

    describe('unpopulated document (luke)', function () {

      it('should update authorized fields', function (done) {
        getUsers(function (err, docs) {
          checkauthorizedSet(
            docs.luke, docs.luke._id,
            {
              name: 'Luke Skywalker',
              settings: {rememberMe: false},
              tags: ['foo', 'bar']
            },
            function (err, luke) {
              if (err) return done(err);
              var json = luke.toJSON();
              json.settings.rememberMe.should.eql(false);
              json.name.should.eql('Luke Skywalker');
              json.tags.should.eql(['foo', 'bar']);
              return done();
            }
          );
        });
      });

      it('should delete authorized fields via undefined', function (done) {
        getUsers(function (err, docs) {
          checkauthorizedSet(
            docs.luke, docs.luke._id,
            {name: undefined, settings: {rememberMe: undefined}},
            function (err, luke) {
              if (err) return done(err);
              var json = luke.toJSON();
              (json.name === undefined).should.be.true;
              (json.settings.rememberMe === undefined).should.be.true;
              return done();
            }
          );
        });
      });

      it('should deny updating if user has no permissions', function (done) {
        getUsers(function (err, docs) {
          var original = docs.luke.toJSON();
          checkauthorizedSet(
            docs.luke, docs.leia._id,
            {name: 'Luke Skywalker', settings: {rememberMe: false}},
            function (err, luke) {
              should(err).be.an.Error;
              original.should.eql(docs.luke.toJSON());
              return done();
            }
          );
        });
      });

      it('should deny updating an unauthorized field', function (done) {
        getUsers(function (err, docs) {
          var original = docs.luke.toJSON();
          checkauthorizedSet(
            docs.luke, docs.luke._id, {passwordHash: 'foo'},
            function (err, luke) {
              should(err).be.an.Error;
              original.should.eql(docs.luke.toJSON());
              return done();
            }
          );
        });
      });

      it('should deny updating mixed authorized and unauthorized fields',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedSet(
              docs.luke, docs.luke._id,
              {name: 'Luke Skywalker', _id: 'foo'},
              function (err, luke) {
                should(err).be.an.Error;
                // check that document is unchanged
                original.should.eql(docs.luke.toJSON());
                return done();
              }
            );
          });
        }
      );

      it('should deny updating subdocuments in arrays via the parent doc',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedSet(
              docs.luke, docs.luke._id,
              {emails: [{address: 'foo@bar.io', type: 'work', visible: true}]},
              function (err, luke) {
                should(err).be.an.Error;
                // check that document is unchanged
                original.should.eql(docs.luke.toJSON());
                return done();
              }
            );
          });
        }
      );

    }); // unpopulated docs

    describe('populated document (leia)', function () {

      it('should update populated and authorized references', function (done) {
        getUsers(function (err, docs) {
          checkauthorizedSet(
            docs.leia, docs.leia._id,
            {father: docs.luke._id.toString()},
            function (err, leia) {
              if (err) return done(err);
              should(docs.luke._id.equals(leia.father)).be.true;
              return done();
            }
          );
        });
      });

      it('should deny updating populated references', function (done) {
        getUsers(function (err, docs) {
          var original = docs.leia.toJSON();
          checkauthorizedSet(
            docs.leia, docs.leia._id,
            {father: {name: 'Darthy'}},
            function (err, leia) {
              should(err).be.an.Error;
              // check that document is unchanged
              original.should.eql(docs.leia.toJSON());
              return done();
            }
          );
        });
      });

    }); // populated docs

  }); // authorizedSet

  describe('#authorizedArrayPush', function () {

    function checkauthorizedArrayPush (doc, json, array, userId, done) {
      return doc.authorizedArrayPush(json, array, userId, function (err) {
        if (err) return done(err);
        return doc.save(done);
      });
    }

    describe('unpopulated document (luke)', function () {

      it('should push authorized subdocuments to an array',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayPush(
              docs.luke, {name: 'todo', color: 'red'}, docs.luke.complexTags,
              docs.luke._id,
              function (err, luke) {
                if (err) return done(err);
                luke.complexTags[1].name.should.eql('todo');
                luke.complexTags[1].color.should.eql('red');
                return done();
              }
            );
          });
        }
      );

      it('should deny pushing to an unauthorized array',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayPush(
              docs.luke, {name: 'todo', color: 'red', secret: 'boo'},
              docs.luke.complexTags, docs.luke._id,
              function (err, luke) {
                should(err).be.an.Error;
                // check that document is unchanged
                original.should.eql(docs.luke.toJSON());
                return done();
              }
            );
          });
        }
      );

      it('should deny pushing to an authorized array with unauthorized data',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayPush(
              docs.luke, {address: 'foo@bar.io', type: 'work', visible: true},
              docs.luke.emails, docs.luke._id,
              function (err, luke) {
                should(err).be.an.Error;
                // check that document is unchanged
                original.should.eql(docs.luke.toJSON());
                return done();
              }
            );
          });
        }
      );

    }); // unpopulated
  }); // authorizedArrayPush

  describe('#authorizedArrayRemove', function () {

    function checkauthorizedArrayRemove (doc, id, array, userId, done) {
      return doc.authorizedArrayRemove(id, array, userId, function (err) {
        if (err) return done(err);
        return doc.save(done);
      });
    }

    describe('unpopulated document (luke)', function () {

      it('should remove subdocuments from an authorized array',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayRemove(
              docs.luke, docs.luke.complexTags[0]._id, docs.luke.complexTags,
              docs.luke._id,
              function (err, luke) {
                if (err) return done(err);
                docs.luke.toJSON().complexTags.should.eql([]);
                return done();
              }
            );
          });
        }
      );

      it('should deny removing subdocuments from an unauthorized array',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayRemove(
              docs.luke, docs.luke.emails[0]._id, docs.luke.emails,
              docs.luke._id,
              function (err, luke) {
                should(err).be.an.Error;
                docs.luke.toJSON().should.eql(original);
                return done();
              }
            );
          });
        }
      );

      it('should deny removing a non-existing subdocument from an array',
        function (done) {
          getUsers(function (err, docs) {
            var original = docs.luke.toJSON();
            checkauthorizedArrayRemove(
              docs.luke, 'nonexisting', docs.luke.complexTags,
              docs.luke._id,
              function (err, luke) {
                should(err).be.an.Error;
                docs.luke.toJSON().should.eql(original);
                return done();
              }
            );
          });
        }
      );

    }); // unpopulated
  }); // authorizedArrayRemove

});
