var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');
var bcrypt = require('bcrypt');

var authorize = require('../');
var utils = require('./utils');

// clear database before each run
beforeEach(utils.clearDB);
beforeEach(utils.insertDocs);

describe('ressourcePlugin', function () {

  describe('#authToJSON', function () {
    it('should only return fields the user is allowed to read', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        function ressourcePlugin(schema, options) {

          /* toJSON-like function that only returns the fields where the user
           * has read permissions.
           *
           * TODO: process virtual fields
           */
          schema.methods.authorizedToJSON = function (userId, done) {
            var doc = this;
            return async.waterfall([
              function (cb) {
                // get ressources the user has permissions to read
                return doc.getRessources(userId, 'read', cb);
              },
              function (ressources, cb) {
                return docToJSON(userId, doc, ['info'], cb);
              }
            ], done);
          };

          function docToJSON (userId, doc, readRessources, done) {

            processObj(doc.toJSON(), undefined, function (err, json) {
              if (err) return done(err);
              if (!json || _.isEmpty(json)) return done();

              // insert _id
              json._id = doc._id.toString();
              return done(null, json);
            });

            // recursively process objects until a subdocument is reached
            function processObj (obj, path, cbObj) {

              // helper function for processing leaf elements
              function processLeaf(obj, objdoc, options, schema, cbLeaf) {
                // is sub/embedded document (authorization is checked there)
                if (schema) {
                  return docToJSON(userId, objdoc, readRessources, cbLeaf);
                }

                // check access to ressource
                var ressource = options.ressource;
                if (_.isFunction(ressource)) {
                  ressource = ressource(doc);
                }
                if (!ressource || !_.contains(readRessources, ressource)) {
                  return cbLeaf();
                }

                // referenced document
                if (options.ref) {
                  // populated?
                  if (_.isObject(obj)) {
                    return objdoc.authorizedToJSON(userId, cbLeaf);
                  }
                  // unpopulated (id only)
                  return cbLeaf(null, obj);
                }

                // primitive JSON type
                if (_.isNull(obj) || _.isString(obj) ||
                    _.isNumber(obj) || _.isBoolean(obj)) {
                  return cbLeaf(null, obj);
                }

                // should never be reached!
                return cbLeaf(new Error('unhandled type!'));
              }

              // root object or nested object
              if (!path || doc.schema.nested[path]) {
                return async.parallel(
                  // process keys
                  _.mapValues(obj, function (value, key) {
                    return function (cb) {
                      var curPath = path ? path + '.' + key : key;
                      return processObj(value, curPath, cb);
                    };
                  }),
                  // remove keys with undefined values
                  function (err, result) {
                    if (err) return cbObj(err);
                    result = _.pick(result, function (value) {
                      return value !== undefined;
                    });
                    // return undefined instead of empty object
                    return cbObj(null, _.isEmpty(result) ? undefined : result);
                  }
                );
              }

              // 'leaf' path (in this document)
              if (doc.schema.paths[path]) {
                var pathConfig = doc.schema.paths[path];

                // is array
                if (_.isArray(pathConfig.options.type)) {
                  // iterate over JSON and corresponding mongoose objects
                  return async.parallel(_.map(
                    _.zip(obj, doc.get(path)),
                    function (value) {
                      return function (cb) {
                        processLeaf(
                          value[0], value[1],
                          pathConfig.options.type[0], pathConfig.schema,
                          cb
                        );
                      };
                    }
                  ), function (err, results) {
                    if (err) return cbObj(err);
                    results = _.compact(results);
                    cbObj(null, results.length ? results : undefined);
                  });
                }

                return processLeaf(obj, doc.get(path),
                                   pathConfig.options, pathConfig.schema,
                                   cbObj
                                  );
              }

              // should never be reached!
              return cbObj(new Error('unhandled type'));
            }
          }

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
          passwordHash: {type: String, select: false},
          array: [String],
          emails_flat: [{type: String, ressource: 'info'}],
          emails_inline: [{
            address: {type: String, ressource: 'info'}
          }],
          emails: [emailSchema],
          settings: {
            rememberMe: {type: Boolean, ressource: 'settings'},
            other: {
              animation: {type: Boolean, ressource: 'settings'}
            }
          },
          knows: {type: mongoose.Schema.Types.ObjectId, ref: 'User1', ressource: 'info'}
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

        async.waterfall([
          function (cb) {
            User.create({
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
            andre.knows = schloemi;
            /*
            andre.permissions = [
              {
                team: { members: { users: [andre] } },
                action: 'read',
                ressource: 'info'
              }
            ];*/

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
              console.log(json);
              cb(null, andre);
            });
          },
          function (andre, cb) {
            andre.authorizedToJSON('wurst', function (err, json) {
              console.log(json);
              cb();
            });
          }
        ], done);
      });
    });
  });

});
